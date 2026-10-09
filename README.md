# 德州扑克范围查询 & 胜率计算器

**一个单文件网页版的德州扑克胜率/范围工具**：双击 HTML 用浏览器打开就能用，零安装、零依赖、纯离线（不联网、不上传任何数据）。

界面是**牌桌形态**：6-9 个座位围一圈，每个座位直接显示位置、状态和胜率，动作按钮就在座位上——**填完牌点一下动作，胜率立刻出来**。

> 面向中文新手玩家。所有术语都有中文解释（不懂 UTG/BTN 这些缩写也能用）。

```
┌ 我的手牌 [A♠K♠]   公共牌 [A♥7♣2♦]                    [⚙设置] ┐
│                                                                │
│         ┌─ 15.8% ─┐        ┌─ 84.2% ─┐                        │
│  ┌───────┐┌────────┐┌──────┐ ┌───────┐┌────────┐┌──────┐      │
│  │跟注 加注││  玩家2  ││枪口位│ │跟注 加注││  玩家1  ││ 大盲 │      │
│  │底池 3bet││还没进池 │└──────┘ │底池 3bet││（我）   │└──────┘      │
│  │全下 弃牌│└────────┘        │全下 弃牌││ A♠ K♠  │               │
│  └───────┘                   └───────┘└────────┘               │
├──── ① 选牌 [下一手 →] ────┬──── ② 听牌 Outs ────┬──── ③ 胜率/该不该跟 ────┤
│ 我的手牌 [A♠][K♠]          │ 同花听 9 张 → 35%    │ 他下注 [½池][⅔池][满池]   │
│ 公共牌 [A♥][7♣][2♦][?][?] │ 顺子听 8 张 → 31%    │ 需要 25% · 你 84%         │
│ A♠ K♠ Q♠ J♠ T♠ ...        │                     │ → 建议跟注 ✅             │
└───────────────────────────┴─────────────────────┴─────────────────────────┘
```

## 功能

| 功能 | 说明 |
|---|---|
| **牌桌 + 座位** | 6-9 人，每个座位 4 个框：上=胜率 · 左=下注情况 · 中=角色框 · 右=位置 |
| **真实动作按钮** | 跟注 / 加注 / 底池 / 3bet / 全下 / 弃牌 —— 每个动作对应一个范围，点一下就算 |
| **跟不跟决策条** | 点「他下注 ½池 / ⅔池 / 满池」→ 直接告诉你**需要多少胜率、你够不够、该跟还是该弃** |
| **范围命中率** | 对手范围在这个牌面「中了什么」：强牌 / 顶对 / 中小对子 / 听牌 / 什么都没中 |
| **位置自动匹配** | 点任意座位的「位置」→ 选一个（如按钮位）→ **全桌按顺序跟着转**，不用一个个改 |
| **一行话粘贴** | 粘一行 `我 BTN A♠K♠ \| 公共牌 A♥7♣2♦ \| CO 加注` → 全桌自动填好 |
| **听牌 Outs** | 同花听 / 两头顺 / 卡顺的 outs 张数 + 成牌概率 |
| **复盘记录** | 打牌时点「我跟了 / 我弃了」，打完看「亏钱跟注几次、弃错几次」 |
| **双引擎** | 局面小自动用**精确枚举**（零误差），局面大用**蒙特卡洛模拟**（显示误差范围），可中途取消 |
| **一键换手** | 「下一手」自动轮转全桌位置、清空手牌和公共牌、保留对手范围 |

## 快速开始

```bash
# 方式一：直接下载 poker-calculator.html，双击用浏览器打开
# 方式二：clone 下来打开
git clone https://github.com/ckunfeng1314-dev/poker-equity-calculator.git
# 然后双击 poker-calculator.html
```

完全没有构建步骤——`poker-calculator.html` 里内联了全部 CSS 和 JS，拷到任何电脑都能跑。

**最快的一条路**：填我的手牌 → 点对手座位上的动作按钮 → 看胜率。全程 3 步。

## 技术细节

- **纯 JS 自研牌力评估器**：位运算 + 预计算顺子查找表（8KB），约 **570 万次/秒**
- **精确枚举**：把每种发牌都算一遍（河牌/转牌/翻牌都是毫秒级，翻前两人单挑 171 万种牌面约 0.6 秒）
- **蒙特卡洛**：分块执行（`setTimeout` 让出主线程），有进度条、实时结果、可取消；2 人 10 万次约 30ms
- **无任何第三方运行时依赖**，不用框架、不引用 CDN、不联网

## 测试

```bash
npm install     # 只装 jsdom（用于跑界面测试）
npm test        # 364 项：149 项引擎 + 215 项界面
node tests/bench.mjs    # 性能基准
```

- `tests/run-tests.mjs` — 从 HTML 里抽出 `<script id="core">` 用 `vm` 执行，测评估器、范围解析、胜率基准（AA vs KK ≈ 82%、AA vs 随机 ≈ 85.2%）、精确枚举与模拟交叉验证
- `tests/ui-smoke.mjs` — 用 jsdom 把真页面跑起来，模拟点击/输入，测牌桌、座位、按钮、一行话解析、复盘记录等

## 项目结构

```
poker-calculator.html    ← 唯一交付物（core 引擎 + UI + CSS 全内联）
使用说明.md               ← 中文小白向文档（术语速查 + 12 个实战场景）
tests/run-tests.mjs      ← 引擎测试
tests/ui-smoke.mjs       ← 界面测试（jsdom）
tests/bench.mjs          ← 性能基准
```

`poker-calculator.html` 里分三个区块，改代码时按区块找：

| 区块 | 内容 |
|---|---|
| `<style>` | 全部样式 |
| `<script id="core">` | 引擎：牌力评估、范围解析、胜率引擎、一行话解析、Outs 计算（**不碰 DOM，可单独测试**） |
| `<script id="ui">` | 界面：牌桌渲染、座位、按钮、状态管理 |

## 欢迎改进 👋

这个项目就是**给人改的**，任何改进都欢迎：

- 🐛 **发现 bug** → 提 Issue（最好附上：你输入了什么、期望是什么、实际是什么）
- ✨ **新功能** → 提 PR。几个我自己觉得有价值的方向：
  - 英文界面 / 多语言
  - 权重范围（同一手牌按比例分配频率）
  - Outs 速查支持转牌→河牌的多街计算
  - 数据可视化（胜率随公共牌变化的曲线）
  - 移动端适配
- 📖 **文档/翻译** → 尤其欢迎英文文档的完善

**改引擎（`<script id="core">`）之后请跑 `npm test`**，364 项测试会告诉你有没有把胜率算错。

## 已知不足（避免误用）

- **范围是入门参考值，不是 GTO 精确解**。位置范围表来自常见打法总结，和 solver 输出有差距。
- **只算牌力概率，不模拟下注策略**。它回答「这手牌现在胜率多少、按底池赔率该不该跟」，不回答「该怎么下注」、不含诈唬频率、不考虑筹码深度和 ICM。
- **对手动作到范围的映射是简化的**（比如「加注」统一按该位置的开牌范围估），真实对手的范围取决于他的水平和历史。
- 部分线上平台禁止使用任何实时辅助工具，**使用前请自行确认你所在平台的规则**。

## License

[MIT](LICENSE) — 随便用、随便改、随便发，保留版权声明即可。

---

## English Summary

A **single-file, offline Texas Hold'em equity calculator with a Chinese UI**, built for beginner players.

Open `poker-calculator.html` in any browser — no install, no build, no network. The UI is a poker-table layout: 6–9 seats, each showing position, state and live equity, with real action buttons (call / raise / pot / 3bet / all-in / fold) mapped to hand ranges. Includes a pot-odds decision bar, range-vs-board hit distribution, position auto-rotation, one-line situation parsing, outs lookup and a decision-review log.

Engine: self-written bitmask 7-card evaluator (~5.7M evals/sec), exact enumeration for small trees, chunked Monte-Carlo otherwise. No runtime dependencies.

Tests: `npm test` runs 364 checks (149 engine + 215 jsdom UI). Contributions welcome — see the Chinese section above for ideas.
