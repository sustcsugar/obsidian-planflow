# 功能分支合并报告

> 日期：2026-09-05 ｜ 基线：master@147ffd2 → 合并后：master@010e170（领先 origin/master 12 提交，未推送）

本次将三条平行功能分支按依赖关系顺序合入 master，全部验证通过（构建零 warning / jest 341 用例全绿 / eslint 0 错 2 警）。

## 合并顺序与冲突处理

| 顺序 | 分支 | 提交数 | 冲突 | 解决方式 |
|---|---|---|---|---|
| ① | `chore/p2-tech-debt` | 4 | 无 | — |
| ② | `feat/p1-followups` | 3 | Toolbar.tsx 一处 | p1 将工具栏 `useIsPhone` 改为 `useIsNarrow`（桌面窄窗拍板），与 p2 删除的同文件未用导入相邻；按 p1 语义解决（保留 `useIsNarrow`） |
| ③ | `feat/month-timeline` | 1 | styles.css（构建产物） | 取月视图侧后重建 |
| 收尾 | — | 1 | — | 清理月视图合并残留的未用导入（`getTaskDateField`） |

---

## 各分支改动明细

### ① chore/p2-tech-debt —— P2 技术债清偿

**lint 基线**：10 错 / 38 警 → **0 错 / 2 警**

- 甘特拖拽控制器：删除两处冗余 `require('./dateGeometry')`（顶部已有静态导入）；touch-action 改 `setCssProps`
- SVG 渲染器：拖拽回调由 `bind(this)`（any）改为类型化箭头函数；清理未用导入
- 日期时间选择器：删除死代码 `parseTimeText`；portal 容器规范化（`createDiv` + `setCssProps`）
- 约 20 处未使用导入/变量清理（TaskCard / Toolbar / 11 个设置 builder 等）
- 保留 2 警：calendarStore 的 localStorage（迁移 `App#saveLocalStorage` 需改 store 架构，另行处理）

**测试**：timelineModel 26 个 jest 用例正式沉淀（此前只有临时冒烟脚本）

- 覆盖：吸附换算（15min/Alt 5min/钳制）、点任务锚定方向体系（前向/后向、day 精度不虚构时刻、午夜双向钳制）、跨日路由（≥24h 全天条 / <24h 分段）、lane 布局（上限/叠加/全天行无上限）、周/单日模型端到端

**性能基准**：`npm run bench`

- 2500 任务：周模型 4.8ms / 日模型 1.0ms；5000 任务：周模型 9.2ms——均远低于 15ms 预算（单帧内），纯函数层无瓶颈

**防御加固**：EmbeddedNoteEditor 能力检测（WorkspaceSplit 构造器 / createLeafInParent / rootSplit 三项前置检测，未来 Obsidian 移除内部 API 时自动降级只读预览）

**i18n**：状态栏"未同步/同步 HH:mm/昨日 HH:mm"硬编码中文迁入 locale

### ② feat/p1-followups —— P1 交互跟进

- **甘特图与新时间体系对齐**（d382c0c）：粒度正名 DAY（原 WEEK 名不副实）、触屏手柄命中区 12→22px、条尾时刻标注
- **桌面窄窗口形态拍板**（2b23053）：视图形态类（3 日窗/色点等）改设备专属信号（Platform），空间适配类（弹窗堆叠等）保留宽度断点——工具栏 `useIsPhone` → `useIsNarrow`
- **全天行极端场景折叠**（56da036）：可见 3 行横跨条 + `+N` 折叠行，点击展开/收起

### ③ feat/month-timeline —— 月视图时间线语义

- 跨日任务渲染为格内横跨条（timelineModel +150 行）
- ≥24h 定时任务带时刻标注
- 格内锚日卡
- 画布对齐拖放（吸附到日，拖到画布可设时间）

---

## 合并后的完整功能版图

master 现包含（时序累计）：

1. **周视图连续画布**全系列（此前已合）：常驻时间线、分钟定位、点任务锚定方向体系、跨日路由（≥24h 全天条 / <24h 分段+箭头）、WYSIWYG 拖放+落点预览、多行文本（块为主文本为从）、全天行无上限
2. **移动端适配 M0-M3**（此前已合）：isDesktopOnly 解除、布局响应式（工具栏收纳/3 日窗/色点）、Pointer Events 统一输入层、长按菜单+底部操作面板、画布触屏拖动
3. **日视图+侧栏三端同构**（此前已合）：共享 DayTimelineCanvas 组件
4. **P1**（本次合入）：甘特对齐、窄窗拍板、全天行折叠
5. **月视图时间线语义**（本次合入）
6. **P2 技术债**（本次合入）：lint 清零、26 模型测试、性能基准、编辑器加固、i18n 补全

---

## 遗留项

### P0 — 流程

- [ ] **推送**：master 领先 origin/master 12 提交未推送（`git push origin master` + `git push planflow master:main`）
- [ ] **styles.css 行尾幻影 diff 根治**：`.gitattributes` 声明 `styles.css text eol=lf`（本次合并又出现 3 次）
- [ ] **桌面 pointer 手势回归**：M2 的 mouse→pointer 改造波及四类手势（resize/拖选创建/甘特条/分栏），逻辑等价但无系统回归记录
- [ ] **移动端真机测试（M4）**：Android chrome://inspect / iOS Safari / 旋屏 / 大库压测完全未开始

### P1 — 功能交互

- [ ] **触屏三限制**：拖选创建不可用（pan-y 让位滚动）；周↔侧栏跨画布触屏拖动不通；resize 无 5 分钟精调替代（方案已定：气泡切档，未实现）
- [ ] **全天行折叠**已合入但折叠阈值（3 行）不可配置
- [ ] ~~桌面窄窗口形态~~ ✅ 已拍板合入（2b23053）

### P2 — 技术债（本轮清剩尾巴）

- [ ] **calendarStore localStorage ×2 警告**：迁移 `App#saveLocalStorage` 需注入 app 实例到 store（架构改动）
- [ ] **视层两套画布实现**（周 DayColumn vs DayTimelineCanvas）：刻意搁置的长期收敛项

### 存量冻结（会话前即搁置）

- [ ] 飞书同步核心 6 个 P0（冻结中，设置 UI 类可做）
- [ ] 设置面板 UX 审计 3.5/5（视图 Tab 分组过载待重构）
- [ ] 标签系统剩余项（tooltip CSS 重复、双实现合并、死代码）
- [ ] `docs/` 40+ 历史文档未归档；`plan-plugin-rename.md`（插件重命名计划）未跟踪
