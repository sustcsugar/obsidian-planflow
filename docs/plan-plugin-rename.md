# 插件改名方案（存档待修订）

> 状态：草案存档，未实施。生成于 2026-09-04。
> 背景：原名 Gantt Calendar 与实际功能面（任务管理/日历/甘特/时间线/多源同步）不匹配，
> 用户按名称把插件 pass 掉。用户自述插件已上架社区市场。

## 一、调研结论（2026-09-04 核查）

### Obsidian 插件的四个"名称"

| 名称 | 位置 | 能否改 | 官方规则 |
|---|---|---|---|
| 显示名 name | manifest.json | ✅ 随时能改，上架后也能（目录随 release 自动跟随；主题反而不能） | 英文 Basic Latin、简短、全局唯一、不含 Obsidian/Plugin、不单独用核心功能名、无标点（连字符/加号/括号除外） |
| 插件 id | manifest.json | ⚠️ 上架后改 = 换身份证（旧条目孤儿、用户双实例、统计清零） | 小写字母+连字符、不以 plugin 结尾、不含 obsidian、与安装目录同名 |
| GitHub 仓库名 | github.com | ✅ 重定向保留 star/issue；上架后需官方更新目录 repo 字段 | 惯例含 obsidian- 前缀；仓库名≠id，可不一致 |
| 本地目录名 | .obsidian/plugins/ | ✅ 跟 id 走 | 规范要求与 id 一致 |

官方文档依据：docs.obsidian.md/Reference/Manifest——"You can update your plugin names in the
community directory by changing the `name` field in `manifest.json`. If the new name is invalid,
the directory removes the plugin until the problem is resolved."

### 本插件现状

- 四名并存：目录 `obsidian-gantt-calendar` / id `gantt-calendar` / name "Gantt Calendar" / 视图显示 "Gantt calendar"（大小写不一）
- ⚠️ **上架状态存疑**：用户自述已上架，但 2026-09-04 三重核查未命中
  （obsidian.md/plugin/gantt-calendar 与 /planflow 均 404；community-plugins.json 无条目；
  obsidian-releases 无 sustcsugar 的 PR/issue）。后续修订前需先确认上架载体
  （可能：其他账号提交 / PR 审核中 / 信息滞后）
- remote 里已有 planflow → obsidian-planflow 仓库，若新名方向是 PlanFlow 需澄清两仓库关系

### 代码耦合清单（仅当改 id 时才需动）

7 处字符串反查 `'gantt-calendar'`：

- `src/ui/components/Toolbar.tsx:110`（设置 Tab id）
- `src/tasks/taskUpdater.ts:64,88`（taskCache/globalTaskFilter）
- `src/tasks/taskSerializer.ts:167`
- `src/ui/modals/TaskFormModal.tsx:274`
- `src/utils/dailyNoteHelper.ts:303`
- `src/data-layer/MarkdownDataSource.ts:608`（`__dev_mode__`）

与名字无关（永不用动）：CSS 全部 `gc-` 前缀（966 处）、view type ×2、localStorage 键
`gantt-calendar-view-filters`、飞书默认文件名、CalDAV UID 后缀、versions.json、release.sh

## 二、主方案（已上架前提：只改显示名，id 永不动）

### 第 0 步：定名（阻塞项）

- 候选方向待定（用户已有名字 / PlanFlow / 重新提候选）
- 硬规则校验（违规 = 目录下架）：与全部插件+主题查重（下载 community-plugins.json 全量 grep）、
  禁词检查（Obsidian/Plugin/核心功能名）、字符集检查
- README 保留"原名 Gantt Calendar"过渡说明，照顾搜索旧名的老用户

### 第 1 步：纯展示层改动（分支 chore/rename-display，基于 master）

1. `manifest.json`：name（**id 绝对不动**）+ 顺带打磨 description（同为目录搜索索引）
2. `GCMainView.ts:36`、`GCSidebarView.ts:35` 的 `getDisplayText()`（顺带修大小写不一致）
3. i18n en/zh 的 ribbonTooltip、virtualTaskDesc（文本级插入，勿 json.dumps 全量回写，避免整文件重排 diff）
4. `README.md` / `README_zh.md` 标题与首段定位
5. `package.json`：name、description（纯元数据）

### 第 2 步：发布与目录同步

- 版本 bump 2.0.0，`scripts/release.sh` 发布（main.js/manifest.json/styles.css）
- 社区目录随新 release 的 manifest 自动更新 name（官方机制，无需 PR）
- 老用户正常更新即见新名，无需重装

### 明确不做

- id/目录名/view type/localStorage 键/CSS gc- 前缀/飞书默认文件名/CalDAV UID——全部保留
- 70 处 `GanttCalendar*` TS 标识符（内部代码，与品牌无关，留待以后）

### 可选独立决策：GitHub 仓库改名

- GitHub 重定向保留 star/issue/release，BRAT 用户无感；需向 obsidian-releases 申请更新目录 repo 字段
- 不改也不影响功能（大量已上架插件仓库名与 id 不一致）

### 验证清单

- 构建零 warning（构建 warning 是真实错误）；重载后：插件列表新名、命令面板视图名、ribbon tooltip、设置 Tab 标题
- 发布后核对 obsidian.md 插件页名称更新、目录搜索命中新名；eslint obsidianmd 规则通过

## 三、条件步骤（仅当确认提交 PR 尚未合并）

- 趁合并前把 PR 条目与 manifest id 一并改新名——唯一能连 id 一起改的零成本窗口
- 此时需同步：7 处代码反查字符串 + 插件目录改名（data.json 随目录走，设置保留）

## 四、待办

- [ ] 确认上架状态（PR 链接 / 插件页链接 / 提交账号）
- [ ] 定名
- [ ] 查重校验
