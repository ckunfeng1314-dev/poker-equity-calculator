/* 真 DOM 冒烟测试：用 jsdom 把整个页面跑起来，模拟点击/输入，检查渲染与结果。
   用法：node tests/ui-smoke.mjs                                   */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'poker-calculator.html'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const win = dom.window;
const doc = win.document;
const C = win.PokerCore;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));

/* ---- 选择器小工具 ---- */
const seats = () => $$('#tableWrap .seat');
const seatEl = (i) => seats()[i];
let curSeat = 0;
const selectSeat = (i) => { curSeat = i; seatEl(i).click(); };
const ed = () => $('#seatEditor');
const edBtn = (txt) => Array.from(ed().querySelectorAll('.pbtn')).find((b) => b.textContent === txt);
const seatBtn = (i, txt) => Array.from(seatEl(i).querySelectorAll('.miniBtn')).find((b) => b.textContent === txt);
const clickSeatBtn = (txt) => { const b = seatBtn(curSeat, txt); b.click(); return b; };
/* 动作按钮（进池/弃牌/打法）现在在座位卡片上，3bet/全下/位置在右侧面板里 */
const clickEd = (txt) => {
  let b = edBtn(txt);
  if (!b) b = seatBtn(curSeat, txt);
  if (!b) throw new Error('找不到按钮：' + txt);
  b.click(); return b;
};
const pIn = (i) => { selectSeat(i); return ed().querySelector('input[data-kind="player"]'); };
const bIn = () => $('#boardInput');
const setIn = (inp, v) => { inp.value = v; inp.dispatchEvent(new win.Event('change')); };
const seatEq = (i) => seatEl(i).querySelector('.seatEq').textContent;
const seatState = (i) => seatEl(i).querySelector('.seatState').textContent;
const seatPos = (i) => seatEl(i).querySelector('.posBadge').textContent;
const hiddenEl = (e) => !!(e && e.closest && e.closest('.collapsed'));   // 元素是否被收在折叠区里
const resRows = () => $$('#results table.res tr');
const status = () => $('#statusLine').textContent;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => win.addEventListener('DOMContentLoaded', r));
await sleep(60);

/* ---- 1. 初始化：牌桌与座位 ---- */
console.log('== 1. 初始化：牌桌与座位 ==');
ok('core 已在页面里注册', !!C);
ok('桌上有 6 个座位', seats().length === 6, seats().length);
ok('牌桌椭圆已渲染', !!$('.felt'));
ok('公共牌有 5 个牌位', $$('#boardSlots .slot').length === 5);
ok('牌面板有 52 张牌', $$('#cardPanel .cardBtn').length === 52);
ok('范围图有 169 格', $$('#rangeGrid .gc').length === 169);
ok('人数选择器可选 2~9', $('#playerCountSel').options.length === 8);
ok('我坐哪默认大盲', $('#myPosSel').value === 'BB');
ok('我大盲 → 玩家2 枪口位 / 玩家6 小盲',
  seatPos(1) === '枪口位' && seatPos(5) === '小盲',
  seats().map((s) => s.querySelector('.posBadge').textContent).join(' '));
ok('默认 4 个座位是「还没进池」（灰显）', $$('#tableWrap .seat.folded').length === 4, $$('#tableWrap .seat.folded').length);
ok('对手默认是枪口位加注范围', /164|种组合/.test(seatState(1)), seatState(1));
ok('自动计算开关默认打开', $('#autoRun').checked === true);
ok('选中座位默认是我方，编辑器显示我方', /玩家1（我）/.test(ed().textContent), ed().querySelector('.seTitle').textContent);
$('#autoRun').checked = false;   // 先关掉，免得干扰逐项检查

/* ---- 2. 开箱即用的示例自动算完（胜率直接显示在座位上） ---- */
console.log('\n== 2. 示例自动计算 ==');
await sleep(2500);
{
  ok('状态显示计算完成', /计算完成/.test(status()), status());
  ok('我方座位上直接显示胜率', /^\d+\.\d%$/.test(seatEq(0)), seatEq(0));
  ok('对手座位上直接显示胜率', /^\d+\.\d%$/.test(seatEq(1)), seatEq(1));
  ok('没进池的座位显示 —', seatEq(2) === '—', seatEq(2));
  ok('结果明细表有表头 + 2 行', resRows().length === 3, resRows().length);
  const eq1 = parseFloat(seatEq(0)), eq2 = parseFloat(seatEq(1));
  ok('两人胜率合计 ≈ 100%', Math.abs(eq1 + eq2 - 100) < 0.1, eq1 + ' + ' + eq2);
  ok('提示还有 4 个座位没进池（默认状态）', /另有 4 个座位没进池/.test($('#results').textContent));
  const utgText = C.POSITION_RANGES.find((p) => p.key === 'UTG').text;
  const expect = C.runExactSync(
    [{ type: 'hand', cards: [C.makeCard(12, 0), C.makeCard(11, 0)] },
     { type: 'range', combos: C.parseRange(utgText).combos },
     { type: 'folded' }, { type: 'folded' }, { type: 'folded' }, { type: 'folded' }],
    [C.makeCard(12, 1), C.makeCard(5, 3), C.makeCard(0, 2)]
  );
  ok('座位上的胜率与引擎直算一致（' + eq1.toFixed(2) + '% vs ' + expect.equity[0].toFixed(2) + '%）',
    Math.abs(eq1 - expect.equity[0]) < 0.1);
  ok('编辑器里也显示胜率', /%$/.test(ed().querySelector('.seEq').textContent), ed().querySelector('.seEq').textContent);
}

/* ---- 3. 点座位 → 编辑面板 ---- */
console.log('\n== 3. 点座位编辑 ==');
{
  selectSeat(2);
  ok('点座位2 → 选中高亮', seatEl(2).classList.contains('selected'));
  ok('编辑器标题切到玩家3', /玩家3/.test(ed().querySelector('.seTitle').textContent), ed().querySelector('.seTitle').textContent);
  ok('左侧边框里是真实动作按钮', !!seatBtn(2, '加注') && !!seatBtn(2, '弃牌'));
  ok('打法按钮（紧/常规/松/跟注站/随机）在右侧面板里',
    ['紧', '常规', '松', '跟注站', '随机'].every((t) => !!edBtn(t)));
  ok('左侧真实动作按钮齐全：跟注/加注/底池/3bet/全下/弃牌',
    ['跟注', '加注', '底池', '3bet', '全下', '弃牌'].every((t) => !!seatBtn(2, t)));
  ok('我方座位少一个「弃牌」（5 个动作）',
    ['跟注', '加注', '底池', '3bet', '全下'].every((t) => !!seatBtn(0, t)) && !seatBtn(0, '弃牌'));
  ok('我方座位没有「弃牌」按钮（自己不可能弃牌）', !seatBtn(0, '弃牌'));
  ok('对手座位有「弃牌」按钮', !!seatBtn(3, '弃牌'));
  ok('右侧面板里放的是：输他具体手牌 + 打法按钮', !!ed().querySelector('input[data-kind="player"]') && !!edBtn('紧'));
}

/* ---- 4. 一键按钮：胜率立刻更新 ---- */
console.log('\n== 4. 一键按钮 → 立即出胜率 ==');
{
  $('#autoRun').checked = true;
  selectSeat(1);
  clickEd('加注');
  ok('点「加注」→ 自动按座位位置（枪口位）填范围', /164/.test(ed().querySelector('.comboInfo').textContent),
    ed().querySelector('.comboInfo').textContent);
  clickEd('松');
  ok('点「松」→ 334 种组合', /334/.test(ed().querySelector('.comboInfo').textContent), ed().querySelector('.comboInfo').textContent);
  ok('座位上显示已填的打法标签', /松/.test(seatState(1)), seatState(1));
  await sleep(1600);
  ok('改完自动重算出胜率', /计算完成/.test(status()), status());
  ok('胜率出现在座位上', /^\d+\.\d%$/.test(seatEq(1)), seatEq(1));

  selectSeat(2);
  clickEd('弃牌');
  ok('点「弃牌」→ 座位变灰 + 显示弃牌', seatEl(2).classList.contains('folded') && /弃牌/.test(seatState(2)));
  clickEd('加注');
  ok('点「加注」→ 重新进池（不再灰）', !seatEl(2).classList.contains('folded'));
  ok('玩家3 是「中位」，填的是中位范围 220 种', /220/.test(ed().querySelector('.comboInfo').textContent),
    ed().querySelector('.comboInfo').textContent);
}

/* ---- 5. 点选牌面 ---- */
console.log('\n== 5. 点选牌面 ==');
{
  selectSeat(3);
  clickEd('弃牌');            // 先弃牌，再把第 4 个座位的牌位当靶子
  const slots = $$('#seatEditor .slot');
  slots[0].click();
  ok('点牌位后焦点提示指向玩家4', /玩家4/.test($('#focusHint').textContent), $('#focusHint').textContent);
  const usedBtn = $$('#cardPanel .cardBtn').find((b) => b.textContent === 'A♠');
  ok('已占用的 A♠ 被灰掉', usedBtn.classList.contains('used'));
  usedBtn.click();
  ok('点已占用的牌不会填进去', $$('#seatEditor .slot.filled').length === 0);
  $$('#cardPanel .cardBtn').find((b) => b.textContent === 'T♥').click();
  ok('点 T♥ 填进第 1 个牌位', $$('#seatEditor .slot.filled').length === 1);
  ok('自动跳到第 2 个牌位', /第 2 张/.test($('#focusHint').textContent), $('#focusHint').textContent);
  $$('#cardPanel .cardBtn').find((b) => b.textContent === 'T♦').click();
  ok('两牌位都填上', $$('#seatEditor .slot.filled').length === 2);
  ok('座位卡片上显示这两张牌', /T♥/.test(seatEl(3).textContent) && /T♦/.test(seatEl(3).textContent), seatEl(3).textContent);
  ok('编辑器输入框回显 T♥T♦', ed().querySelector('input[data-kind="player"]').value === 'T♥T♦',
    ed().querySelector('input[data-kind="player"]').value);
  ok('填满两张后焦点自动跳到公共牌', /公共牌/.test($('#focusHint').textContent), $('#focusHint').textContent);
  $$('#seatEditor .slot')[1].click();          // 手动点回手牌位
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc 清空当前牌位', $$('#seatEditor .slot.filled').length === 1, $$('#seatEditor .slot.filled').length);
  setIn(ed().querySelector('input[data-kind="player"]'), '随机');
  ok('输入「随机」→ 座位显示随机', /随机/.test(seatState(3)), seatState(3));
}

/* ---- 6. 顶栏输入 ---- */
console.log('\n== 6. 顶栏快速输入 ==');
{
  setIn($('#boardInput'), 'A♥7♣2♦9♠');
  ok('公共牌 4 张', $$('#boardSlots .slot.filled').length === 4, $$('#boardSlots .slot.filled').length);
  setIn($('#boardInput'), 'A♥7♣2♦9♠3♥');
  ok('公共牌 5 张', $$('#boardSlots .slot.filled').length === 5);
  setIn($('#boardInput'), '清空');
  ok('清空公共牌', $$('#boardSlots .slot.filled').length === 0);
  setIn($('#myHandInput'), 'A♥K♥');
  ok('顶栏改我方手牌 → 座位显示红心', /♥/.test(seatEl(0).textContent), seatEl(0).textContent);
  ok('顶栏输入框回显 A♥K♥', $('#myHandInput').value === 'A♥K♥', $('#myHandInput').value);
  setIn($('#myHandInput'), 'AsKs');
  ok('改回 A♠K♠', /♠/.test(seatEl(0).textContent));
}

/* ---- 7. 范围图 ---- */
console.log('\n== 7. 范围图 ==');
{
  selectSeat(1);
  clickEd('加注');
  const cells = $$('#rangeGrid .gc');
  const before = cells.filter((c) => c.classList.contains('on')).length;
  ok('范围图显示玩家2 的范围（27 格）', before === 27, before);
  const c72 = cells.find((c) => c.textContent === '72o');
  c72.click();
  ok('点 72o → 加进范围', c72.classList.contains('on'));
  c72.click();
  ok('再点一次 → 取消', !c72.classList.contains('on'));
  ok('范围图说明指向玩家2', /玩家2/.test($('#gridTargetName').textContent), $('#gridTargetName').textContent);
  setIn(ed().querySelector('input[data-kind="player"]'), 'TT+, AsKd');
  const ako = $$('#rangeGrid .gc').find((c) => c.textContent === 'AKo');
  ok('AsKd 让 AKo 显示为「部分组合」', ako.classList.contains('part'), ako.className);
  ok('组合数 = 30 + 1 = 31', /31/.test(ed().querySelector('.comboInfo').textContent), ed().querySelector('.comboInfo').textContent);
}

/* ---- 8. 位置范围表 ---- */
console.log('\n== 8. 位置范围表 ==');
{
  ok('6 个位置各有一行', $$('#posRows .posRow').length === 6);
  ok('每行有 169 格缩略图', $$('#posRows .posRow')[0].querySelectorAll('.mc').length === 169);
  selectSeat(4);
  $('#posTargetSel').value = '4';
  $$('#posRows .posRow')[3].querySelector('button').click();
  ok('载入按钮位范围到玩家5', /A2s\+/.test(ed().querySelector('input[data-kind="player"]').value));
  ok('载入后座位显示 586 种组合', /586/.test(seatState(4)), seatState(4));
  ok('位置标签正常显示（现在单独放在右区）', !!seatEl(4).querySelector('.posBadge'));
}

/* ---- 9. 听牌 Outs（牌桌下方中间那个常驻区域） ---- */
console.log('\n== 9. 听牌 Outs 区域 ==');
{
  ok('Outs 区域常驻，不用切标签页', !hiddenEl($('#outsMain')));
  setIn($('#myHandInput'), 'KsQs');
  setIn($('#boardInput'), 'JsTs2h');
  await sleep(60);
  const t = $('#outsMain').textContent;
  ok('显示当前牌力', /当前牌力/.test(t));
  ok('同花听牌 9 张', /同花听牌[\s\S]{0,20}9 张 outs/.test(t), t.slice(0, 140));
  ok('两头顺听牌 8 张', /两头顺听牌[\s\S]{0,20}8 张 outs/.test(t));
  ok('组合听牌并集 15 张', /15 张/.test(t));
  ok('该不该跟的结论在 ③ 号区域里', /需要胜率/.test($('#decideText').textContent), $('#decideText').textContent);
  setIn($('#boardInput'), '清空');
}

/* ---- 10. 我坐哪：位置自动匹配 ---- */
console.log('\n== 10. 座位位置自动匹配 ==');
{
  const mySel = $('#myPosSel');
  ok('我坐哪有 6 个位置（中文）', mySel.options.length === 6 && /枪口位/.test(mySel.options[0].textContent));
  mySel.value = 'BTN';
  mySel.dispatchEvent(new win.Event('change'));
  ok('改「我坐按钮位」→ 我是按钮位', seatPos(0) === '按钮位', seatPos(0));
  ok('玩家2 → 小盲（自动重排）', seatPos(1) === '小盲', seatPos(1));
  ok('玩家3 → 大盲', seatPos(2) === '大盲', seatPos(2));
  ok('座位标签全是中文（没有 UTG 这类缩写）', seats().every((s) => /^[\u4e00-\u9fa5]+$/.test(s.querySelector('.posBadge').textContent)),
    seats().map((s) => s.querySelector('.posBadge').textContent).join(','));
  selectSeat(2);
  ok('编辑器标题也是中文位置', /大盲/.test(ed().querySelector('.seTitle').textContent), ed().querySelector('.seTitle').textContent);
  mySel.value = 'BB';
  mySel.dispatchEvent(new win.Event('change'));
  ok('改回大盲', seatPos(0) === '大盲');
}

/* ---- 11. 多人 + 弃牌不参与 ---- */
console.log('\n== 11. 多人局面 ==');
{
  $('#autoRun').checked = true;
  selectSeat(2); clickEd('随机');
  selectSeat(3); clickEd('跟注站');
  selectSeat(4); clickEd('松');
  ok('5 人在池，1 个弃牌', $$('#tableWrap .seat.folded').length === 1, $$('#tableWrap .seat.folded').length);
  await sleep(2200);
  ok('结果表列出 5 个在池玩家', resRows().length === 6, resRows().length);
  let sum = 0;
  for (let i = 1; i < resRows().length; i++) sum += parseFloat(resRows()[i].querySelector('td.eq').textContent);
  ok('5 人胜率合计 = 100%', Math.abs(sum - 100) < 0.6, sum);
  ok('座位上都显示胜率', [0, 1, 2, 3, 4].every((i) => /^\d+\.\d%$/.test(seatEq(i))),
    [0, 1, 2, 3, 4].map(seatEq).join(' '));
  ok('状态栏带误差信息', /计算完成[\s\S]*误差约/.test(status()), status());
  $('#autoRun').checked = false;
}

/* ---- 11.5 旧结果变淡（提示是改动前的数字） ---- */
console.log('\n== 11.5 旧结果提示 ==');
{
  $('#autoRun').checked = false;
  setIn($('#myHandInput'), 'AhAd');
  ok('自动计算关掉时，改动会让座位上的旧胜率变淡', $$('.seatEq.stale').length > 0, $$('.seatEq.stale').length);
  $('#runBtn').click();
  await sleep(300);
  ok('重新计算后不再变淡', $$('.seatEq.stale').length === 0, $$('.seatEq.stale').length);
  ok('状态栏显示计算完成', /计算完成/.test(status()), status());
  $('#autoRun').checked = true;
}

/* ---- 11.6 跟不跟决策条 ---- */
console.log('\n== 11.6 跟不跟决策条 ==');
{
  // 我方 A♠A♥，对手枪口位范围，翻牌 A♥7♣2♦ → 我方胜率极高，底池赔率应该建议跟注
  setIn($('#myHandInput'), 'AsAh');
  selectSeat(1); clickEd('加注');
  setIn($('#boardInput'), 'A♥7♣2♦');
  $('#autoRun').checked = false;
  $('#runBtn').click();
  await sleep(500);
  setIn($('#potInput'), '100');
  $('#potInput').dispatchEvent(new win.Event('input'));
  setIn($('#callInput'), '50');
  $('#callInput').dispatchEvent(new win.Event('input'));
  const dv = $('#decideText').textContent;
  ok('决策条算出需要胜率并给结论', /需要胜率 33\.3%/.test(dv) && /建议跟注/.test(dv), dv);
  ok('结论是绿色（该跟）', $('#decideText').classList.contains('go'), $('#decideText').className);
  // 换成很差的牌 + 极差的赔率 → 建议弃牌
  setIn($('#myHandInput'), '2h3d');
  $('#runBtn').click();
  await sleep(500);
  setIn($('#callInput'), '400');
  $('#callInput').dispatchEvent(new win.Event('input'));
  const dv2 = $('#decideText').textContent;
  ok('烂牌 + 差赔率 → 建议弃牌', /建议弃牌/.test(dv2), dv2);
  ok('结论是红色（该弃）', $('#decideText').classList.contains('no'), $('#decideText').className);
  setIn($('#potInput'), '100'); $('#potInput').dispatchEvent(new win.Event('input'));
  setIn($('#callInput'), '50'); $('#callInput').dispatchEvent(new win.Event('input'));
  setIn($('#myHandInput'), 'AsKs');
  setIn($('#boardInput'), '清空');
  $('#autoRun').checked = true;
}

/* ---- 11.7 下一手换位 ---- */
console.log('\n== 11.7 下一手换位 ==');
{
  $('#autoRun').checked = false;
  selectSeat(1); clickEd('加注');
  const posBefore = seatPos(0), oppBefore = seatPos(1);
  const oppRangeBefore = ed().querySelector('.comboInfo').textContent;
  setIn($('#boardInput'), 'A♥7♣2♦');
  $('#nextHandBtn').click();
  ok('我坐从「' + posBefore + '」转到了下一个位置', seatPos(0) !== posBefore && seatPos(0) === '小盲', seatPos(0));
  ok('大盲 → 小盲（按钮往前一格）', posBefore === '大盲' && seatPos(0) === '小盲', posBefore + '→' + seatPos(0));
  ok('对手座位的位置也跟着转', seatPos(1) !== oppBefore, oppBefore + '→' + seatPos(1));
  ok('手牌被清空', seatEl(0).textContent.includes('还没选牌') || !/♠|♥|♦|♣/.test(seatEl(0).textContent), seatEl(0).textContent);
  ok('公共牌被清空', $$('#boardSlots .slot.filled').length === 0);
  selectSeat(1);
  ok('对手范围保留（没被清掉）', /164/.test(ed().querySelector('.comboInfo').textContent),
    ed().querySelector('.comboInfo').textContent);
  $('#autoRun').checked = true;
  setIn($('#myHandInput'), 'AhAd');
  await sleep(1600);
  ok('换位后重新算胜率正常', /计算完成/.test(status()), status());
}

/* ---- 11.8 3bet / 全下按钮 ---- */
console.log('\n== 11.8 3bet / 全下 ==');
{
  $('#autoRun').checked = false;
  selectSeat(2);
  clickEd('3bet');
  ok('点「3bet」→ 38 种组合', /38/.test(ed().querySelector('.comboInfo').textContent), ed().querySelector('.comboInfo').textContent);
  ok('座位上显示 3bet 标签', /3bet/.test(seatState(2)), seatState(2));
  clickEd('全下');
  ok('点「全下」→ 34 种组合（比 3bet 的 38 更窄）', /34/.test(ed().querySelector('.comboInfo').textContent), ed().querySelector('.comboInfo').textContent);
  selectSeat(3);
  clickEd('全下');
  selectSeat(4);
  clickEd('加注');
  selectSeat(5);
  clickEd('弃牌');
  await sleep(200);
}

/* ---- 11.9 范围命中率（在 ③ 号区域） ---- */
console.log('\n== 11.9 范围命中率 ==');
{
  $('#autoRun').checked = false;
  const mp9 = $('#myPosSel'); mp9.value = 'BB'; mp9.dispatchEvent(new win.Event('change'));   // 复位到大盲，位置断言才稳定
  setIn($('#myHandInput'), 'AsKs');
  setIn($('#boardInput'), 'A♥7♣2♦');
  await sleep(40);
  selectSeat(1);          // 玩家2 = 枪口位范围
  const hb = $('#hitBoxWrap');
  ok('③ 号区域里出现「中了什么」面板', /上中了什么/.test(hb.textContent), hb.textContent.slice(0, 70));
  ok('列出五类命中情况', /强牌（两对以上）/.test(hb.textContent) && /顶对 \/ 超对/.test(hb.textContent) && /什么都没中/.test(hb.textContent));
  ok('给出了百分比', /%/.test(hb.querySelector('.hitBox').textContent));
  ok('标的是哪个座位（枪口位范围）', /枪口位范围在/.test(hb.textContent), hb.textContent.slice(0, 40));
  // 选中具体手牌的座位 → 自动改成显示在池对手的
  selectSeat(0);
  ok('选中我方（具体手牌）时显示的是对手的命中率', /枪口位范围在/.test($('#hitBoxWrap').textContent));
  // 翻前给提示
  setIn($('#boardInput'), '清空');
  await sleep(40);
  ok('翻前给的是提示而不是数据', /翻牌发出来后/.test($('#hitBoxWrap').textContent), $('#hitBoxWrap').textContent.slice(0, 50));
}

/* ---- 11.10 复盘记录 ---- */
console.log('\n== 11.10 复盘记录 ==');
{
  setIn($('#boardInput'), 'A♥7♣2♦');
  setIn($('#myHandInput'), 'AsKs');
  $('#autoRun').checked = false;
  $('#runBtn').click();
  await sleep(400);
  setIn($('#potInput'), '100'); $('#potInput').dispatchEvent(new win.Event('input'));
  setIn($('#callInput'), '50'); $('#callInput').dispatchEvent(new win.Event('input'));
  $('#logCallBtn').click();
  doc.querySelectorAll('.tabBtn')[1].click();     // 复盘记录 标签页
  ok('记录表出现 1 行', $$('#logBox table.log tr').length === 2, $$('#logBox table.log tr').length);
  ok('记录了手牌和牌面', /A♠K♠/.test($('#logBox').textContent) && /A♥7♣2♦/.test($('#logBox').textContent));
  ok('给出了评判', /跟得对|亏钱跟注/.test($('#logBox').textContent), $('#logBox').textContent.slice(0, 200));
  ok('汇总统计出现', /共 1 手/.test($('#logBox').textContent), $('#logBox').querySelector('.logSummary').textContent);
  // 同一手改成「我弃了」→ 覆盖，不新增
  $('#logFoldBtn').click();
  doc.querySelectorAll('.tabBtn')[2].click(); doc.querySelectorAll('.tabBtn')[1].click();
  ok('同一手重复记录会覆盖（仍是 1 行）', $$('#logBox table.log tr').length === 2, $$('#logBox table.log tr').length);
  ok('决定变成弃牌', /弃牌/.test($('#logBox').textContent));
  // 换一手牌 → 新增第二行
  setIn($('#myHandInput'), '2h3d');
  $('#runBtn').click();
  await sleep(400);
  $('#logCallBtn').click();
  doc.querySelectorAll('.tabBtn')[2].click(); doc.querySelectorAll('.tabBtn')[1].click();
  ok('不同手牌会新增记录（2 行）', $$('#logBox table.log tr').length === 3, $$('#logBox table.log tr').length);
  ok('汇总显示共 2 手', /共 2 手/.test($('#logBox .logSummary').textContent), $('#logBox .logSummary').textContent);
  // 导出
  Array.from($('#logBox').querySelectorAll('button')).find((b) => b.textContent === '生成导出文本').click();
  ok('生成导出文本', /我的手牌/.test($('#logBox .logExport').value), $('#logBox .logExport').value.slice(0, 60));
  // 两段式清空
  const clr = Array.from($('#logBox').querySelectorAll('button')).find((b) => b.textContent === '清空记录');
  clr.click();
  ok('第一次点不会清空（要先确认）', $$('#logBox table.log tr').length === 3);
  Array.from($('#logBox').querySelectorAll('button')).find((b) => /确认清空/.test(b.textContent)).click();
  ok('第二次点才清空', /还没有记录/.test($('#logBox').textContent), $('#logBox').textContent.slice(0, 60));
}

/* ---- 12. 人数 2~9 座位 ---- */
console.log('\n== 12. 人数切换 ==');
{
  const sel = $('#playerCountSel');
  const mp = $('#myPosSel');       // 先复位到「大盲」（上一节换过位）
  mp.value = 'BB'; mp.dispatchEvent(new win.Event('change'));
  sel.value = '9';
  sel.dispatchEvent(new win.Event('change'));
  ok('切到 9 人 → 9 个座位', seats().length === 9, seats().length);
  ok('9 个座位都有位置标签', seats().every((s) => !!s.querySelector('.posBadge')));
  sel.value = '2';
  sel.dispatchEvent(new win.Event('change'));
  ok('切到 2 人 → 2 个座位', seats().length === 2);
  ok('2 人时座位位置正确（我大盲 / 对手枪口位）', seatPos(0) === '大盲' && seatPos(1) === '枪口位',
    seatPos(0) + '/' + seatPos(1));
  sel.value = '6';
  sel.dispatchEvent(new win.Event('change'));
  ok('切回 6 人', seats().length === 6);
}

/* ---- 13. 错误处理 ---- */
console.log('\n== 13. 错误处理 ==');
{
  selectSeat(1);
  setIn(ed().querySelector('input[data-kind="player"]'), 'ZZZ乱写');
  ok('乱写不会崩', true);
  setIn($('#myHandInput'), 'AsKs');
  setIn(ed().querySelector('input[data-kind="player"]'), 'AsQh');
  $('#autoRun').checked = false;
  $('#runBtn').click();
  await sleep(150);
  ok('重复用牌 → 弹出中文错误提示', /重复/.test($('#toast').textContent), $('#toast').textContent);
  ok('提示条处于显示状态', $('#toast').classList.contains('show'));
  // 把所有对手都弃牌 → 只剩自己
  setIn($('#myHandInput'), 'AsKs');
  for (let i = 1; i < 6; i++) { selectSeat(i); clickEd('弃牌'); }
  ok('6 个座位里 5 个弃牌', $$('#tableWrap .seat.folded').length === 5, $$('#tableWrap .seat.folded').length);
  $('#runBtn').click();
  await sleep(150);
  ok('只剩 1 人时给出中文提示', /至少/.test(status()) || /至少/.test($('#toast').textContent),
    status() + ' | ' + $('#toast').textContent);
}

/* ---- 14. 界面简化（渐进披露） ---- */
console.log('\n== 14. 界面简化 ==');
{
  // 折叠默认状态
  ok('⚙ 设置抽屉默认收起', $('#settingsBox').classList.contains('collapsed'));
  ok('「手动输入 / 研究范围」默认收起', $('#manualBox').classList.contains('collapsed'));
  ok('结果明细常驻在 ③ 号区域（不再需要展开）', !hiddenEl($('#results')));
  ok('顶栏只剩：我的手牌 / 公共牌 / 设置',
    [$('#myHandInput'), $('#boardInput'), $('#settingsBtn')].every((e) => !hiddenEl(e)));
  ok('「下一手」搬到了 ① 号选牌区（常驻可见）',
    !hiddenEl($('#nextHandBtn')) && $('#nextHandBtn').closest('.area') === $('#cardPanel').closest('.area'));
  ok('开始计算、人数、我坐都藏进了设置里',
    hiddenEl($('#runBtn')) && hiddenEl($('#playerCountSel')) && hiddenEl($('#myPosSel')));

  // 展开设置
  $('#settingsBtn').click();
  ok('点 ⚙ → 设置展开', !$('#settingsBox').classList.contains('collapsed'));
  ok('设置里有 人数 / 我坐 / 自动计算 / 开始计算 / 取消',
    [$('#playerCountSel'), $('#myPosSel'), $('#autoRun'), $('#runBtn'), $('#cancelBtn')].every((e) => !hiddenEl(e)));
  $('#settingsBtn').click();
  ok('再点 ⚙ → 收起', $('#settingsBox').classList.contains('collapsed'));

  // 点「手动输入」展开牌面与范围图
  $('#manualToggle').click();
  ok('展开后能看到 52 张牌面和范围图', !hiddenEl($('#cardPanel')) && !hiddenEl($('#rangeGrid')));
  $('#manualToggle').click();

  // 座位面板：默认 3 个大按钮 + 手牌输入，其余进「更多选项」
  selectSeat(1);
  ok('座位卡片上的动作按钮永远可见（不折叠）',
    ['加注', '弃牌', '跟注'].every((t) => { const b = seatBtn(1, t); return b && !hiddenEl(b); }));
  ok('面板里不再有重复的位置按钮（改到座位右边框点选）', !edBtn('枪口位'));
  ok('手牌输入框默认可见', !hiddenEl(ed().querySelector('input[data-kind="player"]')));
  // 展开「更多选项」
  // 点「改范围」按钮会自动展开范围图（先让他进池变成「范围」）
  selectSeat(1);
  clickEd('加注');
  Array.from(ed().querySelectorAll('button')).find((b) => /改范围/.test(b.textContent)).click();
  ok('点「改范围」→ 自动展开手动输入区', !hiddenEl($('#rangeGrid')));
  $('#manualToggle').click();

  // 状态行可点重算
  setIn($('#myHandInput'), 'AsKs');
  $('#autoRun').checked = false;
  setIn($('#boardInput'), 'A♥7♣2♦');
  ok('参数变化后状态行提示过期', /参数已变化/.test(status()), status());
  $('#statusLine').click();
  await sleep(600);
  ok('点状态行 → 触发重算', /计算完成/.test(status()), status());

  // 底池快捷芯片
  Array.from(doc.querySelectorAll('.chip')).find((c) => /½/.test(c.textContent)).click();
  ok('点「½ 池」→ 需要胜率 25%', /需要胜率 25\.0%/.test($('#decideText').textContent), $('#decideText').textContent);
  Array.from(doc.querySelectorAll('.chip')).find((c) => /满池/.test(c.textContent)).click();
  ok('点「满池」→ 需要胜率 33.3%', /需要胜率 33\.3%/.test($('#decideText').textContent), $('#decideText').textContent);

  // 键盘 P / F / R
  $('#autoRun').checked = false;
  selectSeat(2);
  if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  ok('按 P → 选中座位按「加注」填好范围', /范围组合数：\d+/.test(ed().querySelector('.comboInfo').textContent), ed().querySelector('.comboInfo').textContent);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  ok('按 F → 选中座位弃牌', seatEl(2).classList.contains('folded'));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
  ok('按 R → 选中座位随机', /随机/.test(seatState(2)), seatState(2));
  // 焦点在输入框时不触发（先把座位3 弄成在池状态，才看得出 F 有没有生效）
  selectSeat(3);
  clickEd('加注');
  const inp = ed().querySelector('input[data-kind="player"]');
  inp.focus();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  ok('焦点在输入框里时按 F 不触发（座位还在）', !seatEl(3).classList.contains('folded'));

  // 只剩一个人时的空态文案
  for (let i = 1; i < 6; i++) { selectSeat(i); clickEd('弃牌'); }
  $('#runBtn').click();
  await sleep(200);
  ok('只剩自己时给的是人话提示', /点对手的座位/.test(status() + $('#toast').textContent), status() + ' | ' + $('#toast').textContent);
  $('#autoRun').checked = true;
}

/* ---- 14.5 座位卡片上的动作按钮（一步完成，不用先去右边面板） ---- */
console.log('\n== 14.5 座位上的动作按钮 ==');
{
  $('#autoRun').checked = false;
  setIn($('#myHandInput'), 'AsKs');
  setIn($('#boardInput'), 'A♥7♣2♦');
  selectSeat(0);
  ok('选中座位是我方', /玩家1（我）/.test(ed().querySelector('.seTitle').textContent));

  // 直接点座位2 上的动作按钮——不应该改变当前选中的座位
  seatBtn(1, '加注').click();
  ok('点座位上的「加注」→ 该座位直接用位置范围填好（164 种）', /164 种组合/.test(seatState(1)), seatState(1));
  ok('点按钮不会把选中座位抢过去', /玩家1（我）/.test(ed().querySelector('.seTitle').textContent),
    ed().querySelector('.seTitle').textContent);

  // 打法按钮
  selectSeat(2);
  clickEd('松');
  ok('面板里点「松」→ 该座位变成松的范围', /松/.test(seatState(2)), seatState(2));
  selectSeat(2);
  clickEd('跟注站');
  ok('换点「跟注站」→ 970 种组合', /970/.test(seatState(2)) || /跟注站/.test(seatState(2)), seatState(2));

  // 弃牌按钮
  seatBtn(3, '弃牌').click();
  ok('点座位上的「弃牌」→ 座位变灰、不参与', seatEl(3).classList.contains('folded'));
  selectSeat(3);
  clickEd('随机');
  ok('点「随机」→ 重新进池', !seatEl(3).classList.contains('folded') && /随机/.test(seatState(3)));

  // 我方座位没有弃牌按钮
  ok('我方座位上没有「弃牌」', !seatBtn(0, '弃牌'));
  $('#autoRun').checked = true;
}

/* ---- 14.6 牌桌下方三个区域 ---- */
console.log('\n== 14.6 牌桌下方三区域 ==');
{
  $('#autoRun').checked = false;
  ok('① 号区域：牌库选择器常驻', !hiddenEl($('#cardPanel')) && !hiddenEl($('#myHandSlots')) && !hiddenEl($('#boardSlots2')));
  ok('② 号区域：听牌 Outs 常驻', !hiddenEl($('#outsMain')));
  ok('③ 号区域：胜率 + 该不该跟 + 命中率 常驻',
    !hiddenEl($('#decideText')) && !hiddenEl($('#results')) && !hiddenEl($('#hitBoxWrap')));
  ok('① 区域里有「我的手牌」两个牌位', $$('#myHandSlots .slot').length === 2);
  ok('① 区域里有「公共牌」五个牌位', $$('#boardSlots2 .slot').length === 5);
  ok('① 区域里有 52 张牌可点', $$('#cardPanel .cardBtn').length === 52);

  // 先把手牌清空（点牌位 → Esc）
  setIn($('#myHandInput'), '2c3c');
  selectSeat(0);
  const esc = () => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  $$('#myHandSlots .slot')[0].click(); esc();
  $$('#myHandSlots .slot')[1].click(); esc();
  ok('清空后我的手牌两个牌位都是空的', $$('#myHandSlots .slot.filled').length === 0, $('#myHandSlots').textContent);

  // 点「我的手牌」牌位 → 点牌面 → 填上
  $$('#myHandSlots .slot')[0].click();
  ok('点我的手牌第 1 个牌位 → 焦点指向我方', /玩家1/.test($('#focusHint').textContent), $('#focusHint').textContent);
  $$('#cardPanel .cardBtn').find((b) => b.textContent === 'A♠').click();
  ok('点 A♠ → 第 1 张填上', /A♠/.test($('#myHandSlots').textContent), $('#myHandSlots').textContent);
  $$('#cardPanel .cardBtn').find((b) => b.textContent === 'K♠').click();
  ok('再点 K♠ → 自动跳到第 2 个牌位并填满', /A♠/.test($('#myHandSlots').textContent) && /K♠/.test($('#myHandSlots').textContent),
    $('#myHandSlots').textContent);
  ok('顶栏「我的手牌」也同步了', $('#myHandInput').value === 'A♠K♠', $('#myHandInput').value);

  // 选完两张手牌：焦点自动去公共牌，再点牌不会覆盖手牌
  setIn($('#boardInput'), '清空');
  $$('#myHandSlots .slot')[0].click(); esc();
  $$('#myHandSlots .slot')[1].click(); esc();
  $$('#myHandSlots .slot')[0].click();
  $$('#cardPanel .cardBtn').find((b) => b.textContent === 'A♠').click();
  $$('#cardPanel .cardBtn').find((b) => b.textContent === 'K♠').click();
  ok('两张手牌选完 → 焦点自动到公共牌第 1 张', /公共牌第 1 张/.test($('#focusHint').textContent), $('#focusHint').textContent);
  $$('#cardPanel .cardBtn').find((b) => b.textContent === '7♥').click();
  ok('这时再点牌填的是公共牌，不会覆盖手牌', /7♥/.test($('#boardInput').value) && $('#myHandInput').value === 'A♠K♠',
    $('#boardInput').value + ' / ' + $('#myHandInput').value);
  ok('焦点继续停在公共牌（不跳回手牌）', /公共牌/.test($('#focusHint').textContent), $('#focusHint').textContent);
  $$('#myHandSlots .slot')[0].click();
  ok('只有主动点手牌框才回到手牌', /玩家1 的第 1 张/.test($('#focusHint').textContent), $('#focusHint').textContent);

  // 点公共牌位 → 点牌面 → 填上
  setIn($('#boardInput'), '清空');
  $$('#boardSlots2 .slot')[0].click();
  $$('#cardPanel .cardBtn').find((b) => b.textContent === '7♥').click();
  ok('点公共牌位 → 点 7♥ → 牌桌中央和 ① 区域都显示', /7♥/.test($('#boardSlots2').textContent) && /7♥/.test($('#boardSlots').textContent));
  ok('顶栏「公共牌」也同步', /7♥/.test($('#boardInput').value), $('#boardInput').value);
  $$('#boardSlots2 .slot')[0].click(); esc();
  ok('点回那个牌位按 Esc → 清掉', !/7♥/.test($('#boardSlots2').textContent), $('#boardSlots2').textContent);
  setIn($('#boardInput'), '清空');
  $('#autoRun').checked = true;
}

/* ---- 14.7 座位三段式：左动作 / 中角色框 / 右胜率 ---- */
console.log('\n== 14.7 座位三段式 ==');
{
  $('#autoRun').checked = false;
  selectSeat(0);
  setIn($('#myHandInput'), 'AsKs');
  setIn($('#boardInput'), 'A♥7♣2♦');
  selectSeat(1); clickEd('加注');
  $('#runBtn').click();
  await sleep(400);
  const s1 = seatEl(1);
  ok('座位分成三块：左(动作) 中(角色框) 右(胜率)',
    !!s1.querySelector('.actGrid') && !!s1.querySelector('.seatBox') && !!s1.querySelector('.seatEqBox'));
  ok('角色框里有玩家号码', /玩家2/.test(s1.querySelector('.seatBox').textContent), s1.querySelector('.seatBox').textContent);
  ok('位置有独立的框（右框）', !!s1.querySelector('.posBox .posBadge'));
  ok('四个框齐了：上胜率 / 左下注 / 中角色 / 右位置',
    !!s1.querySelector('.seatEqBox') && !!s1.querySelector('.actGrid') && !!s1.querySelector('.seatBox') && !!s1.querySelector('.posBox'));
  ok('角色框里是号码 + 状态', /玩家2/.test(s1.querySelector('.seatBox').textContent) && !!s1.querySelector('.seatBox .seatState'));
  ok('角色框里有「是否弃牌」状态', /进池|弃牌|还没|种组合|随机|手牌/.test(s1.querySelector('.seatState').textContent),
    s1.querySelector('.seatState').textContent);
  ok('右边框里是胜率数字', /%/.test(s1.querySelector('.seatEqBox .seatEq').textContent), s1.querySelector('.seatEqBox').textContent);
  ok('左边框里是真的动作按钮（跟注/加注/底池/3bet/全下/弃牌）',
    ['跟注', '加注', '底池', '3bet', '全下', '弃牌'].every((t) => !!seatBtn(1, t)));
  ok('胜率不再放在角色框里', !s1.querySelector('.seatBox .seatEq'));
  // 点角色框能选中座位
  selectSeat(0);
  s1.querySelector('.seatBox').click();
  ok('点角色框 → 选中该座位', seatEl(1).classList.contains('selected'));
  $('#autoRun').checked = true;
}

/* ---- 14.8 一行话粘贴 ---- */
console.log('\n== 14.8 一行话粘贴 ==');
{
  selectSeat(0);
  $('#autoRun').checked = false;
  const si = $('#situationInput');
  ok('① 号区域里有一行话输入框', !!si && !hiddenEl(si));
  setIn(si, '我 BTN A♠K♠ | 公共牌 A♥7♣2♦ | CO 加注');
  await sleep(60);
  ok('我的位置被设成按钮位', seatPos(0) === '按钮位', seatPos(0));
  ok('我的手牌填好了', $('#myHandInput').value === 'A♠K♠', $('#myHandInput').value);
  ok('公共牌填好了', /A♥7♣2♦/.test($('#boardInput').value), $('#boardInput').value);
  const coSeat = seats().findIndex((s) => s.querySelector('.posBadge').textContent === '关煞位');
  ok('关煞位那个座位被标成「加注」（填了范围）', /种组合/.test(seatState(coSeat)), seatState(coSeat));
  const idle = seats().filter((s) => /还没进池/.test(s.querySelector('.seatState').textContent));
  ok('没提到的座位都算「还没进池」', idle.length >= 3, idle.length + ' 个');
  ok('提示里说明了填了什么', /已填好/.test($('#toast').textContent), $('#toast').textContent);
  // 换一种写法：不写关键词 + 中文动作
  setIn(si, '我大盲 KsQs | JsTs2h | 按钮位 全下');
  await sleep(60);
  ok('中文位置/动作写法也生效', seatPos(0) === '大盲' && $('#myHandInput').value === 'K♠Q♠',
    seatPos(0) + ' / ' + $('#myHandInput').value);
  const btnSeat2 = seats().findIndex((s) => s.querySelector('.posBadge').textContent === '按钮位');
  ok('按钮位被标成「全下」', /全下/.test(seatState(btnSeat2)), seatState(btnSeat2));
  // 乱写会提示
  setIn(si, '今天天气不错');
  await sleep(30);
  ok('乱写会给出中文提示', /没读懂/.test($('#toast').textContent), $('#toast').textContent);
  si.value = '';
  $('#autoRun').checked = true;
}

/* ---- 14.9 位置框点击切换（选一个，全桌跟着转） ---- */
console.log('\n== 14.9 位置框切换 ==');
{
  $('#autoRun').checked = false;
  const mp = $('#myPosSel'); mp.value = 'BB'; mp.dispatchEvent(new win.Event('change'));   // 先复位
  selectSeat(0);
  ok('位置框里有可点的位置徽标', !!seatEl(1).querySelector('.posBox .posBadge'));
  ok('位置菜单默认收起', !seatEl(1).querySelector('.posMenu').classList.contains('open'));
  ok('默认：玩家2 = 枪口位', seatPos(1) === '枪口位', seatPos(1));
  seatEl(1).querySelector('.posBox').click();
  ok('点位置框 → 菜单展开', seatEl(1).querySelector('.posMenu').classList.contains('open'));
  ok('菜单里是 6 个位置', seatEl(1).querySelectorAll('.posMenuItem').length === 6,
    seatEl(1).querySelectorAll('.posMenuItem').length);
  ok('点位置框不会把选中座位抢过去', /玩家1/.test(ed().querySelector('.seTitle').textContent),
    ed().querySelector('.seTitle').textContent);
  // 指定「玩家2 = 按钮位」→ 全桌跟着转
  Array.from(seatEl(1).querySelectorAll('.posMenuItem')).find((b) => /按钮位/.test(b.textContent)).click();
  ok('玩家2 变成按钮位', seatPos(1) === '按钮位', seatPos(1));
  ok('其他座位跟着转：玩家1(我) = 关煞位', seatPos(0) === '关煞位', seatPos(0));
  ok('玩家3 = 小盲 / 玩家4 = 大盲', seatPos(2) === '小盲' && seatPos(3) === '大盲', seatPos(2) + '/' + seatPos(3));
  ok('玩家5 = 枪口位 / 玩家6 = 中位', seatPos(4) === '枪口位' && seatPos(5) === '中位', seatPos(4) + '/' + seatPos(5));
  ok('顶栏「我坐」也跟着更新成关煞位', $('#myPosSel').value === 'CO', $('#myPosSel').value);
  ok('选完菜单自动收起', !seatEl(1).querySelector('.posMenu').classList.contains('open'));
  ok('给了中文提示', /其他座位按顺序跟着排好了/.test($('#toast').textContent), $('#toast').textContent);
  // 再指定「玩家4 = 中位」→ 又一次全桌重排
  seatEl(3).querySelector('.posBox').click();
  Array.from(seatEl(3).querySelectorAll('.posMenuItem')).find((b) => /中位/.test(b.textContent)).click();
  ok('玩家4 = 中位，玩家5 跟着变成关煞位', seatPos(3) === '中位' && seatPos(4) === '关煞位', seatPos(3) + '/' + seatPos(4));
  // 范围跟着位置换
  mp.value = 'BB'; mp.dispatchEvent(new win.Event('change'));
  selectSeat(1); clickEd('加注');
  ok('座位2 = 枪口位范围（164 种）', /164/.test(seatState(1)), seatState(1));
  seatEl(1).querySelector('.posBox').click();
  Array.from(seatEl(1).querySelectorAll('.posMenuItem')).find((b) => /关煞位/.test(b.textContent)).click();
  ok('改位置后它的范围跟着换成关煞位的（328 种）', /328/.test(seatState(1)), seatState(1));
  $('#autoRun').checked = true;
}

/* ---- 15. 运行期错误 ---- */
console.log('\n== 15. 运行期错误 ==');
ok('全程没有 JS 报错', errors.length === 0, errors.join(' | '));

console.log('\n========================================');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
dom.window.close();
if (fail) process.exit(1);
console.log('全部通过 ✓');
