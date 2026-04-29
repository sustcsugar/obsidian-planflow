# 飞书任务同步机制说明

## 概述

Gantt Calendar 插件通过飞书开放平台 v2 API 实现 Obsidian 与飞书任务的双向同步。同步引擎核心代码位于 `src/data-layer/feishu-sync/FeishuTaskSync.ts`。

### 相关文件

| 文件 | 职责 |
|------|------|
| `FeishuTaskSync.ts` | 同步引擎主逻辑：匹配、变更检测、冲突处理 |
| `taskMapper.ts` | GCTask ↔ 飞书字段双向映射 |
| `FeishuProvider.ts` | 飞书 API 调用封装（OAuth + HTTP） |
| `syncState.ts` | 同步状态持久化（`.feishu-sync-state.json`） |
| `taskSerializer.ts` | 任务行序列化/反序列化（含 GUID 写回） |

### 同步字段映射

| Obsidian 字段 | 飞书字段 | 说明 |
|---------------|---------|------|
| `description` | `summary` | 任务标题 |
| `feishuDesc` | `description` | 任务描述（独立字段，不与标题混淆） |
| `dueDate` | `due_at` | 截止日期（毫秒时间戳字符串） |
| `startDate` | `start_at` | 开始日期（毫秒时间戳字符串） |
| `completed` + `completionDate` | `completed_at` | 完成状态（毫秒时间戳，空字符串 = 未完成） |
| `priority` | `priority` | 优先级（6 级 → 3 级映射） |

---

## 1. OB → 飞书（单向推送）

### 适用场景

OB 中存在但飞书中不存在的任务（匹配类型为 `obsidian-only`）。

### 处理流程

```
OB 任务（无 feishuGuid）
  → 构建 payload（summary, due_at, start_at, priority, completed_at）
  → 调用飞书 API POST /open-apis/task/v2/tasks 创建任务
  → 将返回的 GUID 写回 OB 任务行（追加 %%[guid:: xxx]%%）
  → 记录同步状态到 .feishu-sync-state.json
```

### GUID 写回机制

创建成功后，飞书返回的 `task.guid` 通过 `serializeTask()` 写入 OB 任务行末尾：

```markdown
# 同步前
- [ ] 手撸UART 📅 2026-04-30

# 同步后
- [ ] 手撸UART 📅 2026-04-30 %%[guid:: abc123def456]%%
```

`%%` 是 Obsidian 的注释语法，阅读模式下不可见，但 Dataview 可解析为 inline field。

### 同步状态记录

每次同步完成后，在 `.feishu-sync-state.json` 中记录：

```json
{
  "abc123def456": {
    "lastSyncAt": "2026-04-29T10:30:00.000Z",
    "obsidianTaskId": "项目/任务.md:12",
    "feishuUpdatedAt": "1769040000000",
    "lastSyncedContent": "手撸UART|0|normal|1769040000000|0|"
  }
}
```

其中 `lastSyncedContent` 是任务关键字段的哈希值，用于后续变更检测。

---

## 2. 飞书 → OB（单向拉取）

### 适用场景

飞书中存在但 OB 中不存在的任务（匹配类型为 `feishu-only`）。

### 处理流程

```
飞书任务（OB 中无对应）
  → 映射飞书字段为 GCTaskUpdates
  → 在目标文件（默认 gantt-calendar-feishu-sync.md）追加新任务行
  → 记录同步状态
```

### 目标文件

拉取的飞书任务默认写入 Vault 根目录的 `gantt-calendar-feishu-sync.md`。如果文件不存在会自动创建。

---

## 3. 双方都有任务但一方有更新

### 变更检测机制

对于已匹配的任务对（通过 GUID 或模糊匹配），同步引擎会比较三方的状态：

```
                ┌─ 飞书任务 update_time
上次同步快照 ────┤
                └─ OB 任务内容哈希（lastSyncedContent）
```

具体逻辑（`detectMatchedChange`）：

| 条件 | 动作 | 说明 |
|------|------|------|
| 飞书 changed 且 OB 未 changed | `pull-update` | 飞书 → OB |
| OB changed 且飞书未 changed | `push-update` | OB → 飞书 |
| 双方都 changed | `conflict` | 按冲突策略处理（见下文） |
| 双方都未 changed | 跳过 | 无操作 |

### 变更判定方式

- **飞书侧**：比较飞书任务的 `update_time` 与同步记录中的 `feishuUpdatedAt`
- **OB 侧**：计算当前任务关键字段的内容哈希，与同步记录中的 `lastSyncedContent` 比较

哈希由以下字段拼接生成：

```
description | completed | priority | dueDate | startDate | feishuDesc
```

### 冲突解决策略

当双方都有变更时，根据用户配置的 `conflictStrategy` 处理：

| 策略 | 行为 |
|------|------|
| `local-win` | 以 OB 为准，覆盖飞书 |
| `remote-win` | 以飞书为准，覆盖 OB |
| `newest-win`（默认） | 比较飞书 `update_time` 与上次同步时间，更新时间更近的一方获胜 |

---

## 4. 双方相同任务的判断逻辑

任务匹配按优先级递减，一旦命中即停止：

### 第一优先级：GUID 精确匹配

```
条件：obsidianTask.feishuGuid === feishuTask.guid
```

- 最可靠的匹配方式
- 前提：任务至少经过一次完整同步，GUID 已写回 OB

### 第二优先级：标题模糊匹配

```
条件：
  1. OB 任务没有 feishuGuid（未同步过）
  2. 标题最长公共子串相似度 ≥ 0.6
```

- 用于处理"两边都有同名任务但尚未建立 GUID 关联"的情况
- 已有 GUID 的任务不参与模糊匹配（避免误匹配）
- 相似度算法基于最长公共子串长度 / 较长字符串长度

### 未匹配归类

| 类型 | 条件 | 处理 |
|------|------|------|
| `feishu-only` | 飞书有、OB 无、无匹配 | 拉取到 OB |
| `obsidian-only` | OB 有、飞书无、无 GUID | 推送到飞书 |
| `orphaned` | OB 有 GUID、飞书无对应 | 清理 GUID（见下文） |

---

## 5. 任一方删除任务的处理

### 场景 A：飞书侧删除了任务

当 OB 任务带有 `feishuGuid` 但在飞书中找不到对应任务时：

```
OB 任务: - [ ] 测试任务1 %%[guid:: abc123]%%
飞书: （无 guid=abc123 的任务）

→ 匹配类型: orphaned
→ 变更类型: clear-guid
```

**处理流程**：

1. 从 OB 任务行中移除 `%%[guid:: abc123]%%`
2. 从 OB 任务行中移除 `%%[desc:: ...]%%`（如有）
3. 从 `.feishu-sync-state.json` 中删除该 GUID 的记录

结果：

```markdown
# 处理前
- [ ] 测试任务1 📅 2026-04-30 %%[guid:: abc123]%%

# 处理后
- [ ] 测试任务1 📅 2026-04-30
```

下次同步时，该任务被视为 `obsidian-only`，将重新推送到飞书。

### 场景 B：OB 侧删除了任务

OB 中删除任务行后，该任务不再出现在任务解析结果中。同步引擎无法感知"删除"事件，只会发现该 OB 任务不存在了。

**处理方式**：

- 如果飞书中该任务仍在，但没有其他 OB 任务匹配到它 → 标记为 `feishu-only`
- 当前同步引擎**不会**自动删除飞书侧的任务（保守策略，避免数据丢失）
- 飞书侧的孤立任务会保留，需用户手动在飞书中清理

> **注意**：当前实现不会将 OB 侧的删除操作同步到飞书。这是有意的设计选择——删除是不可逆操作，自动传播可能导致意外数据丢失。
