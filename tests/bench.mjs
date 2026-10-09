/* 性能基准：评估器速度 + 各人数下的模拟耗时。
   用法：node tests/bench.mjs       */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'poker-calculator.html'), 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
const sandbox = { console, module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox, { filename: 'core.js' });
const C = sandbox.PokerCore;

const mk = (s) => C.makeCard('23456789TJQKA'.indexOf(s[0].toUpperCase()), 'SHDC'.indexOf(s[1].toUpperCase()));
const hand = (a, b) => ({ type: 'hand', cards: [mk(a), mk(b)] });
const range = (t) => ({ type: 'range', combos: C.parseRange(t).combos });
const rnd = () => ({ type: 'random' });

console.log('== 7 张牌评估器 ==');
{
  let st = 99;
  const ri = (n) => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st % n; };
  const N = 2000000;
  const batches = new Int32Array(N * 7);
  for (let t = 0; t < N; t++) {
    const p = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 0; i < 7; i++) { const j = i + ri(52 - i); const x = p[i]; p[i] = p[j]; p[j] = x; batches[t * 7 + i] = p[i]; }
  }
  const tmp = new Int32Array(7);
  const t0 = performance.now();
  let sum = 0;
  for (let t = 0; t < N; t++) {
    for (let i = 0; i < 7; i++) tmp[i] = batches[t * 7 + i];
    sum += C.evaluateN(tmp, 7);
  }
  const dt = performance.now() - t0;
  console.log(`  ${N.toLocaleString()} 次：${dt.toFixed(0)} ms → ${(N / dt * 1000 / 1e6).toFixed(2)} 百万次/秒（校验和 ${sum % 1000}）`);
}

function timeIt(label, fn) {
  const t0 = performance.now();
  const r = fn();
  const dt = performance.now() - t0;
  console.log(`  ${label}：${dt.toFixed(0)} ms` + (r && r.equity ? `  （玩家1 胜率 ${r.equity[0].toFixed(2)}%）` : ''));
  return dt;
}

console.log('\n== 蒙特卡洛模拟 ==');
timeIt('2 人 · 10 万次（翻前 AA vs KK）', () => C.runMonteCarloSync([hand('As', 'Ah'), hand('Ks', 'Kh')], [], 100000, 1));
timeIt('2 人 · 10 万次（翻前 AA vs 随机）', () => C.runMonteCarloSync([hand('As', 'Ah'), rnd()], [], 100000, 1));
timeIt('2 人 · 10 万次（翻牌 AKs vs JJ+范围）', () => C.runMonteCarloSync([hand('As', 'Ks'), range('JJ+, AQs+, AKo')], [mk('Ah'), mk('7c'), mk('2d')], 100000, 1));
timeIt('5 人 · 5 万次（全随机）', () => C.runMonteCarloSync([rnd(), rnd(), rnd(), rnd(), rnd()], [], 50000, 1));
timeIt('9 人 · 2 万次（全随机）', () => C.runMonteCarloSync([rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()], [], 20000, 1));
timeIt('9 人 · 2 万次（1 固定 + 8 范围）', () => C.runMonteCarloSync(
  [hand('As', 'Ks'), range('22+'), range('A2s+, KTs+'), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()], [], 20000, 1));

console.log('\n== 精确枚举 ==');
timeIt('2 人 · 翻牌 990 种牌面', () => C.runExactSync([hand('As', 'Ks'), hand('Qh', 'Qd')], [mk('Ah'), mk('7c'), mk('2d')]));
timeIt('2 人 · 转牌 44 种牌面', () => C.runExactSync([hand('As', 'Ks'), hand('Qh', 'Qd')], [mk('Ah'), mk('7c'), mk('2d'), mk('9s')]));
timeIt('3 人 · 翻牌（两个范围）', () => C.runExactSync([range('JJ+, AKo'), range('AQs+, 22-77'), hand('As', 'Ks')], [mk('Ah'), mk('7c'), mk('2d')]));
timeIt('2 人 · 翻前 171 万种牌面（最慢的精确用例）', () => C.runExactSync([hand('As', 'Ah'), hand('Ks', 'Kh')], []));

console.log('\n== 范围解析 ==');
timeIt('解析 2000 次复杂范围文字', () => {
  for (let i = 0; i < 2000; i++) C.parseRange('22+, A2s+, KTs+, QTs+, JTs, ATo+, KJo+, 99-77, T9s-54s');
});
