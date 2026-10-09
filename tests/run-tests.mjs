/* 从 poker-calculator.html 里抽出 core 脚本，跑单元测试与胜率基准。
   用法：node tests/run-tests.mjs            */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, '..', 'poker-calculator.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('✗ 没在 HTML 里找到 <script id="core">'); process.exit(1); }

const sandbox = { console, module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox, { filename: 'core.js' });
const C = sandbox.PokerCore;

const mk = (s) => C.makeCard('23456789TJQKA'.indexOf(s[0].toUpperCase()), 'SHDC'.indexOf(s[1].toUpperCase()));
const hand = (a, b) => ({ type: 'hand', cards: [mk(a), mk(b)] });
const range = (text) => ({ type: 'range', combos: C.parseRange(text).combos });
const rnd = () => ({ type: 'random' });
const cardsOf = (str) => str.split(/\s+/).filter(Boolean).map(mk);

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? '  →  ' + extra : '')); console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); }
}
function near(name, actual, expected, tol) {
  ok(name, Math.abs(actual - expected) <= tol, `实际 ${actual.toFixed(3)}，期望 ${expected}±${tol}`);
}
function group(t) { console.log('\n== ' + t + ' =='); }

/* ================= 1. 牌力评估器 ================= */
group('1. 牌力评估器');
{
  const cat = (cards) => C.scoreCategory(C.evaluateN(cards, cards.length));
  const ev = (str) => { const cs = cardsOf(str); return C.evaluateN(cs, cs.length); };

  ok('皇家同花顺 = 同花顺(8)', cat(cardsOf('As Ks Qs Js Ts 2h 3d')) === 8);
  ok('顺子顺（轮子 A2345）判为顺子', cat(cardsOf('As 2h 3d 4c 5s 9h Kd')) === 4);
  ok('轮子描述含 5 高', C.describeScore(ev('As 2h 3d 4c 5s 9h Kd')).includes('5 高'),
    C.describeScore(ev('As 2h 3d 4c 5s 9h Kd')));
  ok('6 高顺 > 5 高顺（轮子）', ev('2s 3h 4d 5c 6s 9h Kd') > ev('As 2h 3d 4c 5s 9h Kd'));
  // 关键回归：5 张同花 + 三条，必须是同花而不是葫芦
  ok('同花优先于三条（7张里5张同花）', cat(cardsOf('As Ks Qs Js 2s 2h 2d')) === 5,
    C.describeScore(ev('As Ks Qs Js 2s 2h 2d')));
  ok('同花顺 > 四条', cat(cardsOf('9s 8s 7s 6s 5s Ah Ad')) === 8 && cat(cardsOf('9s 9h 9d 9c 5s Ah Ad')) === 7);
  ok('四条判对且踢脚正确', ev('9s 9h 9d 9c 5s Ah Ad') > ev('9s 9h 9d 9c 5s Kh Qd'));
  ok('葫芦 > 同花', cat(cardsOf('Ah Ad Ac Kh Kd 2s 3s')) === 6 && cat(cardsOf('Ah Kh Qh Jh 9h 2s 3s')) === 5);
  ok('两条三条组成葫芦，取大的三条', C.describeScore(ev('Kh Kd Kc 9h 9d 9c 2s')).includes('K 带 9'),
    C.describeScore(ev('Kh Kd Kc 9h 9d 9c 2s')));
  ok('顺子 > 三条（7,7,7,8,9,T,J）', cat(cardsOf('7s 7h 7d 8c 9s Td Jh')) === 4,
    C.describeScore(ev('7s 7h 7d 8c 9s Td Jh')));
  ok('两对踢脚比较', ev('Ah Ad Kh Kd 5s 2c 3d') > ev('Ah Ad Kh Kd 4s 2c 3d'));
  ok('一字踢脚：A 高 > K 高', ev('Ah Kd 9s 7c 5d 3s 2h') > ev('Kh Qd 9s 7c 5d 3s 2h'));
  // 公共牌同花顺 → 所有人平局
  const board = cardsOf('Ts Js Qs Ks As');
  const s1 = C.evaluateN(board.concat([mk('2h'), mk('3d')]), 7);
  const s2 = C.evaluateN(board.concat([mk('4c'), mk('5h')]), 7);
  ok('公共牌已是同花顺，两人同分', s1 === s2);
  // 随机模糊测试
  let bad = 0, sample = 0;
  let st = 12345;
  const rndInt = (n) => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st % n; };
  const pool = Array.from({ length: 52 }, (_, i) => i);
  const tmp = new Int32Array(7);
  for (let t = 0; t < 200000; t++) {
    const p = pool.slice();
    for (let i = 0; i < 7; i++) { const j = i + rndInt(52 - i); const x = p[i]; p[i] = p[j]; p[j] = x; tmp[i] = p[i]; }
    const sc = C.evaluateN(tmp, 7);
    sample++;
    const c = sc >>> 20;
    if (!(c >= 0 && c <= 8) || !Number.isFinite(sc)) bad++;
  }
  ok('20 万次随机 7 张牌评估不崩且类别合法', bad === 0 && sample === 200000, 'bad=' + bad);
  // 兜底：偶数张同花但非 5 张时不能误判
  ok('只有 4 张同花不算同花', cat(cardsOf('Ah Kh Qh Jh 9s 2c 3d')) === 0);
}

/* ================= 2. 范围解析 ================= */
group('2. 范围解析与 169 格');
{
  const n = (t) => C.parseRange(t).combos.length;
  ok('JJ+ = 24 组合', n('JJ+') === 24, '实际 ' + n('JJ+'));
  ok('AQs+ = 8 组合', n('AQs+') === 8, '实际 ' + n('AQs+'));
  ok('ATs-A5s = 24 组合', n('ATs-A5s') === 24, '实际 ' + n('ATs-A5s'));
  ok('A5s-A2s = 16 组合', n('A5s-A2s') === 16, '实际 ' + n('A5s-A2s'));
  ok('区间反向写结果一致', JSON.stringify(C.parseRange('A2s-A5s').combos) === JSON.stringify(C.parseRange('A5s-A2s').combos));
  ok('AK = 16 组合（2 格）', n('AK') === 16 && C.parseRange('AK').cells.size === 2);
  ok('AA,AA 去重 = 6 组合', n('AA,AA') === 6, '实际 ' + n('AA,AA'));
  ok('T9s-54s 对角线 = 24 组合', n('T9s-54s') === 24, '实际 ' + n('T9s-54s'));
  ok('22+ = 78 组合（13 个对子）', n('22+') === 78, '实际 ' + n('22+'));
  ok('99-66 = 24 组合', n('99-66') === 24, '实际 ' + n('99-66'));
  ok('随机 = 1326 组合', n('随机') === 1326, '实际 ' + n('随机'));
  let all = 0;
  for (let i = 0; i < 169; i++) all += C.cellCombos(i).length;
  ok('169 格合计 = 1326 组合', all === 1326, '实际 ' + all);
  ok('格子命名 AA / AKs / AKo', C.cellName(0) === 'AA' && C.cellName(1) === 'AKs' && C.cellName(13) === 'AKo',
    [C.cellName(0), C.cellName(1), C.cellName(13)].join(','));
  const concrete = C.parseRange('AsKd');
  ok('具体两张牌 = 1 组合', concrete.combos.length === 1 && concrete.extras.length === 1);
  // 直接打花色图案
  ok('花色图案输入 A♠K♠ = 1 组合', n('A♠K♠') === 1, '实际 ' + n('A♠K♠'));
  ok('花色图案与字母写法等价',
    JSON.stringify(C.parseRange('A♠K♠').combos) === JSON.stringify(C.parseRange('AsKs').combos));
  ok('图案 + 范围混写可用', n('A♥K♥, JJ+') === 25, '实际 ' + n('A♥K♥, JJ+'));
  ok('AKs 的 s 仍是「同花」不是黑桃', n('AKs') === 4 && n('A♠K♠') === 1);
  ok('中文逗号也能分隔', n('JJ+，AQs+') === 32, '实际 ' + n('JJ+，AQs+'));
  // 文字 ↔ 格子 往返
  ['JJ+, AQs+, AKo', '22+, A2s+, KTs+, QTs+, JTs, ATo+, KJo+', 'T9s-54s', 'AA,KK,QQ,AKs'].forEach((t) => {
    const r1 = C.parseRange(t);
    const back = C.rangeToText(r1.cells);
    const r2 = C.parseRange(back);
    ok('范围文字往返一致：' + t + '  →  ' + back, r1.combos.length === r2.combos.length,
      r1.combos.length + ' vs ' + r2.combos.length);
  });
  ok('非法写法会报错', C.parseRange('ZZ9').errors.length > 0);
  ok('区间两端对不上会报错', C.parseRange('AKs-76o').errors.length > 0);
}

/* ================= 3. 胜率基准 ================= */
group('3. 胜率基准（蒙特卡洛，±1.5%）');
{
  const eq = (players, board, iters, seed) => {
    const r = C.runMonteCarloSync(players, board, iters, seed);
    if (!r.ok) throw new Error(r.error);
    return r.equity;
  };
  const IT = 300000;
  let e;
  e = eq([hand('As', 'Ah'), hand('Ks', 'Kh')], [], IT, 7);
  near('AA vs KK：AA 胜率 ≈ 81.9%', e[0], 81.9, 1.5);
  e = eq([hand('Qs', 'Qh'), hand('As', 'Ks')], [], IT, 7);
  near('QQ vs AKs：QQ ≈ 53.9%', e[0], 53.9, 1.5);
  e = eq([hand('2s', '2h'), hand('As', 'Ks')], [], IT, 7);
  near('22 vs AKs：22 ≈ 50.1%', e[0], 50.1, 1.5);
  e = eq([hand('As', 'Ah'), rnd()], [], IT, 7);
  near('AA vs 随机 ≈ 85.2%', e[0], 85.2, 1.5);
  e = eq([rnd(), rnd()], [], 200000, 7);
  near('随机 vs 随机 ≈ 50%', e[0], 50, 1.5);
  e = eq([rnd(), rnd(), rnd()], [], 150000, 7);
  near('3 人胜率合计 = 100%', e.reduce((a, b) => a + b, 0), 100, 0.5);
  e = eq([rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()], [], 80000, 7);
  near('9 人胜率合计 = 100%', e.reduce((a, b) => a + b, 0), 100, 0.5);
  e = eq([hand('As', 'Ks'), range('JJ+, AQs+, AKo')], cardsOf('Ah 7c 2d'), 200000, 7);
  ok('AKs 对 JJ+/AQs+/AKo 在 A72 翻牌面胜率很高（>75%）', e[0] > 75, 'e0=' + e[0].toFixed(2));
  e = eq([hand('Ac', 'Ah'), range('AsKd')], [], 100000, 7);
  near('AA vs 具体牌 A♠K♦ ≈ 92.5%', e[0], 92.5, 1.5);
  const dead = C.buildJob([hand('As', 'Ah'), range('AsKd')], []);
  ok('范围里的具体牌被手牌占用 → 报「全被占用」', dead.ok === false && /占用/.test(dead.error), dead.error);
  const bad = C.buildJob([hand('As', 'Ah'), hand('As', 'Kd')], []);
  ok('同一张牌被两人使用会报错', bad.ok === false && /重复/.test(bad.error), bad.error);
  const bad2 = C.buildJob([hand('As', 'Ah')], [mk('2h'), mk('3h')]);
  ok('公共牌只有 2 张会报错', bad2.ok === false, bad2.error);
  const bad3 = C.buildJob([{ type: 'range', combos: C.parseRange('AsAs').combos }, hand('2c', '3c')], []);
  ok('空范围会报错', bad3.ok === false, bad3.error);
  ok('只剩 1 个人在牌局里会报错', C.buildJob([hand('As', 'Ah')], []).ok === false,
    C.buildJob([hand('As', 'Ah')], []).error);
}

/* ================= 4. 精确枚举 vs 模拟 ================= */
group('4. 精确枚举与模拟交叉验证');
{
  const board = cardsOf('Ah 7c 2d');
  const p1 = hand('As', 'Ks'), p2 = hand('Qh', 'Qd');
  const ex = C.runExactSync([p1, p2], board);
  const mc = C.runMonteCarloSync([p1, p2], board, 300000, 99);
  ok('精确枚举跑通', ex.ok && ex.iters === 990, 'iters=' + ex.iters);
  near('翻牌 990 枚举 vs 30 万次模拟（玩家1）', mc.equity[0], ex.equity[0], 0.7);
  near('翻牌 990 枚举 vs 30 万次模拟（玩家2）', mc.equity[1], ex.equity[1], 0.7);

  const turn = cardsOf('Ah 7c 2d 9s');
  const exT = C.runExactSync([hand('As', 'Ks'), hand('Qh', 'Qd')], turn);
  ok('转牌精确枚举 = 44 种牌面', exT.ok && exT.iters === 44, 'iters=' + exT.iters);

  // 河牌：每人一个范围也不能出错，枚举量 ≈ 两范围有效组合数之积（扣掉互相冲突的分配）
  const riv = cardsOf('Ah 7c 2d 9s 3h');
  const exR = C.runExactSync([range('JJ+, AKo'), range('AQs+, 22-77')], riv);
  const c1 = C.buildJob([range('JJ+, AKo'), hand('2c', '3c')], riv).players[0].combos.length;
  const c2 = C.buildJob([range('AQs+, 22-77'), hand('2c', '3c')], riv).players[0].combos.length;
  const upper = c1 * c2;
  ok('河牌范围 vs 范围 精确枚举组合数合理', exR.ok && exR.iters <= upper && exR.iters >= upper * 0.8,
    'iters=' + exR.iters + ' 上限 ' + upper);
  near('河牌精确枚举两人胜率合计 = 100%', exR.equity[0] + exR.equity[1], 100, 0.001);

  // 弃牌的座位不参与：6 个座位里 4 个弃牌 = 单挑结果（同一个随机种子结果应完全一致）
  const heads = C.runMonteCarloSync([hand('As', 'Ah'), hand('Ks', 'Kh')], [], 100000, 3);
  const sixSeats = C.runMonteCarloSync([hand('As', 'Ah'), hand('Ks', 'Kh'),
    { type: 'folded' }, { type: 'folded' }, { type: 'folded' }, { type: 'folded' }], [], 100000, 3);
  ok('弃牌座位不影响计算结果', Math.abs(heads.equity[0] - sixSeats.equity[0]) < 1e-9, heads.equity[0] + ' vs ' + sixSeats.equity[0]);
  ok('结果只包含在池玩家（2 个）', sixSeats.equity.length === 2, sixSeats.equity.length);

  // 翻前手牌 vs 手牌（枚举量 171 万，用模拟验证数量级）
  const pre = C.runMonteCarloSync([hand('As', 'Ah'), hand('Ks', 'Kh')], [], 200000, 5);
  near('翻前 AA vs KK 模拟复现', pre.equity[0], 81.9, 1.5);
  ok('翻前精确枚举工作量在可接受范围内', C.estimateExactWork(C.buildJob([hand('As', 'Ah'), hand('Ks', 'Kh')], [])).work <= 50000000);
  ok('翻前 3 人有范围时自动放弃精确枚举', C.estimateExactWork(C.buildJob([range('22+'), range('22+'), hand('As', 'Ks')], [])).feasible === false);
  ok('有随机玩家时不做精确枚举', C.estimateExactWork(C.buildJob([hand('As', 'Ah'), rnd()], [])).feasible === false);
}

/* ================= 5. Outs 速查 ================= */
group('5. 听牌 Outs');
{
  near('9 outs 两街 = 35.0%', C.outsToHit(9, 2, 47), 34.97, 0.1);
  near('8 outs 两街 = 31.5%', C.outsToHit(8, 2, 47), 31.45, 0.1);
  near('10 outs 两街 = 38.4%', C.outsToHit(10, 2, 47), 38.39, 0.1);
  near('9 outs 一街 = 19.1%', C.outsToHit(9, 1, 47), 19.15, 0.1);

  let r = C.computeOuts([mk('Ks'), mk('Qs')], cardsOf('Js 2s 7h'));
  ok('同花听牌识别为 9 张 outs', r.ok && r.draws.some(d => d.key === 'flush' && d.outs === 9),
    JSON.stringify(r.draws && r.draws.map(d => d.name + ':' + d.outs)));
  near('同花听牌到河牌成牌率 ≈ 35%', r.draws.find(d => d.key === 'flush').toHit, 34.97, 0.1);
  ok('K 高/同花听牌当前牌力 = 高牌', r.curName.includes('高牌'), r.curName);

  // 两头顺：8h9h + Tc Jd 2s → 7 或 Q 都能接上（8 张）
  r = C.computeOuts([mk('8h'), mk('9h')], cardsOf('Tc Jd 2s'));
  const sd = r.draws.find(d => d.key === 'straight');
  ok('两头顺识别为 8 张 outs', !!sd && sd.outs === 8, sd && sd.name + ':' + sd.outs);
  ok('两头顺命名正确', sd && sd.name === '两头顺听牌', sd && sd.name);

  // 卡顺：9hTh + 6c 8d Ks → 只有 7 能接上（4 张）
  r = C.computeOuts([mk('9h'), mk('Th')], cardsOf('6c 8d Ks'));
  const gd = r.draws.find(d => d.key === 'straight');
  ok('卡顺识别为 4 张 outs', !!gd && gd.outs === 4, gd && gd.name + ':' + gd.outs);
  ok('卡顺命名正确', gd && gd.name === '卡顺听牌', gd && gd.name);

  r = C.computeOuts([mk('Ah'), mk('Ad')], cardsOf('As 7c 2d'));
  ok('已中三条时当前牌力 = 三条', r.ok && r.curCat === 3, r.curName);

  // 组合听牌：KsQs + Js Ts 2h → 同花听 9 张，顺子听 8 张（A、9），并集 15 张
  r = C.computeOuts([mk('Ks'), mk('Qs')], cardsOf('Js Ts 2h'));
  const f = r.draws.find(d => d.key === 'flush'), st = r.draws.find(d => d.key === 'straight');
  ok('组合听牌：同花听 9 张 + 顺子听 8 张', !!f && f.outs === 9 && !!st && st.outs === 8,
    JSON.stringify(r.draws.map(d => d.name + ':' + d.outs)));
  ok('组合听牌并集 = 15 张（A♠/9♠ 只算一次）', r.unionOuts === 15, 'union=' + r.unionOuts);
  near('15 outs 两街成牌率 ≈ 54.1%', r.unionHit, 54.12, 0.2);

  const bad = C.computeOuts([mk('As'), mk('Ks')], []);
  ok('没有公共牌时给出提示', bad.ok === false && /3 张/.test(bad.error), bad.error);
}

/* ================= 6. 位置范围表 ================= */
group('6. 位置范围表');
{
  C.POSITION_RANGES.forEach((p) => {
    const r = C.parseRange(p.text);
    ok(p.label + ' 解析无误（' + r.combos.length + ' 组合）', r.errors.length === 0 && r.combos.length > 0, r.errors.join('；'));
  });
  const utg = C.parseRange(C.POSITION_RANGES[0].text).combos.length;
  const btn = C.parseRange(C.POSITION_RANGES[3].text).combos.length;
  ok('越靠后的位置范围越宽', btn > utg, utg + ' vs ' + btn);
}

/* ================= 7. 预设范围（风格 + 位置） ================= */
group('7. 预设范围（风格 + 位置）');
{
  const styleWidths = [];
  C.OPPONENT_PRESETS.forEach((p) => {
    if (!p.text) return;
    const r = C.parseRange(p.text);
    ok('风格预设「' + p.label + '」解析无误（' + r.combos.length + ' 组合）', r.errors.length === 0 && r.combos.length > 0, r.errors.join('；'));
    styleWidths.push({ label: p.label, n: r.combos.length });
  });
  ok('风格宽度递增：紧 < 常规 < 松 < 跟注站',
    styleWidths[0].n < styleWidths[1].n && styleWidths[1].n < styleWidths[2].n && styleWidths[2].n < styleWidths[3].n,
    styleWidths.map((w) => w.label + ':' + w.n).join('  '));
  ok('「随机」预设不带范围文字（走随机分支）', C.OPPONENT_PRESETS.find((p) => p.key === 'random').text === '');
  ok('每个风格预设都有中文提示', C.OPPONENT_PRESETS.every((p) => p.tip && p.tip.length > 4));
  const utg = C.parseRange(C.POSITION_RANGES[0].text).combos.length;
  const bb = C.parseRange(C.POSITION_RANGES[5].text).combos.length;
  const normal = C.parseRange(C.OPPONENT_PRESETS.find((p) => p.key === 'normal').text).combos.length;
  const station = C.parseRange(C.OPPONENT_PRESETS.find((p) => p.key === 'station').text).combos.length;
  ok('「常规」和 UTG 不重复', normal !== utg, normal + ' vs ' + utg);
  ok('「跟注站」比 BB 更宽（不重复）', station > bb, station + ' vs ' + bb);
  // 位置按钮的标题里要能算出组合数
  C.POSITION_RANGES.forEach((p) => {
    ok('位置「' + p.key + '」有中文标签和范围', !!p.label && !!p.text && C.parseRange(p.text).combos.length > 0);
  });
  // 座位上的真实动作按钮（跟注/加注/底池/3bet/全下/弃牌）
  C.SEAT_ACTIONS.forEach((p) => {
    const r = C.parseRange(p.text);
    ok('动作「' + p.label + '」有中文提示', !!p.tip && p.tip.length > 6);
    if (p.text) ok('动作「' + p.label + '」范围解析无误（' + r.combos.length + ' 组合）', r.errors.length === 0 && r.combos.length > 0, r.errors.join('；'));
  });
  const actW = (k) => C.parseRange(C.SEAT_ACTIONS.find((p) => p.key === k).text).combos.length;
  const callN = actW('call'), potN = actW('pot'), threebet = actW('threebet'), allin = actW('allin');
  ok('动作范围由宽到窄：跟注 > 底池 > 3bet > 全下',
    callN > potN && potN > threebet && threebet > allin,
    [callN, potN, threebet, allin].join(' > '));
  ok('「加注」不带固定范围（用本座位的位置范围）', C.SEAT_ACTIONS.find((p) => p.key === 'raise').text === '');
  ok('「弃牌」是特殊动作（fold 标记）', C.SEAT_ACTIONS.find((p) => p.key === 'fold').fold === true);
  ok('3bet / 全下 都比一把手的开牌范围窄', threebet < normal, threebet + ' vs ' + normal);
}

/* ================= 8. 范围命中率 ================= */
group('8. 范围命中率（他在这个牌面中了什么）');
{
  const B = cardsOf('Ah 7c 2d');
  const hit = (text, dead) => C.rangeHitStats(C.parseRange(text).combos, B, dead || []);
  let h = hit('AA');
  ok('AA 在 A72 上 100% 强牌（三条）', h.total > 0 && h.strong === h.total, JSON.stringify(h));
  h = hit('KK');
  ok('KK 在 A72 上被 A 压住，算中/小对子', h.mid === h.total, JSON.stringify(h));
  h = C.rangeHitStats(C.parseRange('QQ').combos, cardsOf('Js 7c 2d'), []);
  ok('QQ 在 J72 上是超对（算顶对级）', h.toppair === h.total, JSON.stringify(h));
  h = hit('77');
  ok('77 在 A72 上 100% 强牌（三条）', h.strong === h.total, JSON.stringify(h));
  h = hit('AKo');
  ok('AKo 在 A72 上中了顶对', h.toppair === h.total, JSON.stringify(h));
  h = hit('22');
  ok('22 在 A72 上 100% 强牌（三条）', h.strong === h.total, JSON.stringify(h));
  h = hit('98s');
  ok('98s 在 A72 上什么都没中（没顺子听）', h.air === h.total, JSON.stringify(h));
  h = C.rangeHitStats(C.parseRange('KsQs').combos, cardsOf('Js 2s 7h'), []);
  ok('KsQs 只有黑桃那一手有同花听牌', h.flushDraw === 1, JSON.stringify(h));
  ok('同花听的那手被算进「听牌」一类', h.draw === 1, JSON.stringify(h));
  h = C.rangeHitStats(C.parseRange('AA').combos, B, cardsOf('As Ah Ad Ac'));
  ok('死牌过滤：4 张 A 都不可用 → 样本为 0', h.total === 0, JSON.stringify(h));
  // 全随机范围也能算（大约 1200 个组合）
  const t0 = Date.now();
  h = C.rangeHitStats(null, B, cardsOf('As Ks'));
  const dt = Date.now() - t0;
  ok('随机范围统计能跑完（' + h.total + ' 组合，' + dt + 'ms）', h.total > 1000 && dt < 1500, dt + 'ms');
  const sum = h.strong + h.toppair + h.mid + h.draw + h.air;
  ok('五类之和 = 总数', sum === h.total, sum + ' vs ' + h.total);
}

/* ================= 9. 一行话解析 ================= */
group('9. 一行话解析（我 BTN A♠K♠ | 公共牌 … | CO 加注）');
{
  let r = C.parseSituation('我 BTN A♠K♠ | 公共牌 A♥7♣2♦ | CO 加注');
  ok('解析出我的位置', r.myPos === 'BTN', r.myPos);
  ok('解析出我的手牌', r.myCards === 'ASKS', r.myCards);
  ok('解析出公共牌', r.board === 'AH7C2D', r.board);
  ok('解析出对手动作', r.actions.length === 1 && r.actions[0].pos === 'CO' && r.actions[0].action === 'raise',
    JSON.stringify(r.actions));
  ok('没有报错', r.errors.length === 0, r.errors.join('；'));

  r = C.parseSituation('我大盲 AsKs | 翻牌 Ah7c2d | 按钮位 全下 | 小盲 跟注');
  ok('中文位置别名（大盲/按钮位/小盲）', r.myPos === 'BB' && r.actions[0].pos === 'BTN' && r.actions[1].pos === 'SB',
    JSON.stringify(r));
  ok('中文动作别名（全下/跟注）', r.actions[0].action === 'allin' && r.actions[1].action === 'call', JSON.stringify(r.actions));

  r = C.parseSituation('A♠K♠ | A♥7♣2♦ | CO raise');
  ok('省略关键词时按张数判断：2 张=手牌 / 3 张=公共牌', r.myCards === 'ASKS' && r.board === 'AH7C2D',
    r.myCards + ' / ' + r.board);
  ok('英文动作也能认（raise）', r.actions[0].action === 'raise');

  ok('枪口位 = UTG', C.parseSituation('枪口位 加注').actions[0].pos === 'UTG');
  ok('中位 = MP', C.parseSituation('中位 弃牌').actions[0].pos === 'MP');
  ok('关煞位 = CO', C.parseSituation('关煞位 3bet').actions[0].pos === 'CO');
  ok('「推了」= 全下', C.parseSituation('CO 推了').actions[0].action === 'allin');
  ok('「溜入」= 跟注', C.parseSituation('CO 溜入').actions[0].action === 'call');
  ok('「随机」是动作', C.parseSituation('CO 随机').actions[0].action === 'random');
  ok('只写「我 CO」也能设位置', C.parseSituation('我 CO').myPos === 'CO');
  ok('认不出的内容会报错', C.parseSituation('今天天气不错').errors.length > 0);
  ok('空输入会报错', C.parseSituation('').errors.length > 0);
  r = C.parseSituation('我 BTN A♠K♠A♥7♣2♦9♠3♥');
  ok('牌太多会报错', r.errors.length > 0, r.errors.join('；'));
}

console.log('\n========================================');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) { console.log('失败清单：\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('全部通过 ✓');
