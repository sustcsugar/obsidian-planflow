/**
 * 飞书任务双向同步引擎
 *
 * 实现 Obsidian ↔ 飞书任务的自动匹配、变更检测和双向同步。
 *
 * 核心流程: fetch → match → detect → apply
 */

import { App, TFile } from 'obsidian';
import type { GCTask } from '../../types';
import type { FeishuTaskRaw } from '../sources/api/providers/feishu/FeishuTypes';
import type { FeishuProvider } from '../sources/api/providers/FeishuProvider';
import { SyncStateManager, SyncRecord } from './syncState';
import {
    toFeishuTaskPayload,
    toFeishuCompleted,
    fromFeishuTask,
    GCTaskUpdates,
} from './taskMapper';
import { parseTasksFromFile } from '../../tasks/taskParser/main';
import { serializeTask, TaskUpdates } from '../../tasks/taskSerializer';
import { Logger } from '../../utils/logger';

/** 冲突解决策略 */
export type ConflictStrategy = 'newest-win' | 'local-win' | 'remote-win';

/** 同步选项 */
export interface FeishuSyncOptions {
    /** 冲突解决策略 */
    conflictStrategy: ConflictStrategy;
    /** 新任务写入的目标文件路径（默认 'Tasks.md'） */
    targetFile: string;
    /** 启用的任务格式 */
    enabledFormats: ('tasks' | 'dataview')[];
    /** 全局任务过滤器 */
    globalFilter?: string;
    /** 任务清单 GUID（可选，用于限定同步到特定任务清单） */
    tasklistGuid?: string;
}

/** 同步结果 */
export interface SyncResult {
    pushed: number;
    pulled: number;
    conflicted: number;
    skipped: number;
    errors: string[];
}

/** 任务匹配对 */
interface TaskMatch {
    feishuTask?: FeishuTaskRaw;
    obsidianTask?: GCTask;
    /** 匹配类型 */
    matchType: 'guid' | 'fuzzy' | 'feishu-only' | 'obsidian-only';
}

/** 单条变更 */
interface PendingChange {
    type: 'push-create' | 'push-update' | 'pull-create' | 'pull-update' | 'conflict';
    feishuTask?: FeishuTaskRaw;
    obsidianTask?: GCTask;
}

// ==================== 同步引擎 ====================

export class FeishuTaskSync {
    private app: App;
    private provider: FeishuProvider;
    private state: SyncStateManager;
    private options: FeishuSyncOptions;

    constructor(
        app: App,
        provider: FeishuProvider,
        state: SyncStateManager,
        options: FeishuSyncOptions
    ) {
        this.app = app;
        this.provider = provider;
        this.state = state;
        this.options = options;
    }

    // ==================== 主入口 ====================

    /**
     * 执行双向同步
     */
    async sync(): Promise<SyncResult> {
        const result: SyncResult = { pushed: 0, pulled: 0, conflicted: 0, skipped: 0, errors: [] };

        try {
            await this.state.load();

            // 1. 获取双方任务
            const feishuTasks = await this.fetchFeishuTasks();
            const obsidianTasks = await this.fetchObsidianTasks();

            // 2. 匹配
            const matches = this.matchTasks(feishuTasks, obsidianTasks);

            // 3. 检测变更
            const changes = this.detectChanges(matches);

            // 4. 应用变更
            for (const change of changes) {
                try {
                    await this.applyChange(change, result);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    result.errors.push(msg);
                    Logger.error('FeishuTaskSync', 'Apply change failed', error);
                }
            }

            // 5. 保存状态
            await this.state.save();

            Logger.info('FeishuTaskSync', `Sync complete: pushed=${result.pushed}, pulled=${result.pulled}, conflicted=${result.conflicted}, skipped=${result.skipped}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(msg);
            Logger.error('FeishuTaskSync', 'Sync failed', error);
        }

        return result;
    }

    // ==================== 数据获取 ====================

    private async fetchFeishuTasks(): Promise<FeishuTaskRaw[]> {
        return this.provider.fetchAllFeishuTasks();
    }

    private async fetchObsidianTasks(): Promise<GCTask[]> {
        const tasks: GCTask[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const fileCache = this.app.metadataCache.getFileCache(file);
            const listItems = fileCache?.listItems || [];
            if (listItems.length === 0) continue;

            try {
                const fileTasks = await this.parseObsidianFile(file, listItems);
                tasks.push(...fileTasks);
            } catch {
                // 跳过读取失败的文件
            }
        }

        return tasks;
    }

    /**
     * 从单个文件解析任务
     */
    private async parseObsidianFile(file: TFile, listItems: any[]): Promise<GCTask[]> {
        if (listItems.length === 0) return [];

        try {
            const content = await this.app.vault.cachedRead(file);
            return parseTasksFromFile(
                file,
                content,
                listItems,
                this.options.enabledFormats,
                this.options.globalFilter
            );
        } catch {
            return [];
        }
    }

    // ==================== 任务匹配 ====================

    /**
     * 匹配飞书任务与 Obsidian 任务
     *
     * 匹配优先级:
     * 1. GUID 精确匹配: feishuTask.guid === obsidianTask.feishuGuid
     * 2. 标题模糊匹配: 标题相似度 >= 0.6 + 日期相同
     * 3. 未匹配的各自归类为单侧任务
     */
    private matchTasks(feishuTasks: FeishuTaskRaw[], obsidianTasks: GCTask[]): TaskMatch[] {
        const matches: TaskMatch[] = [];
        const matchedObsidian = new Set<GCTask>();

        // 建立 feishuGuid → obsidianTask 索引
        const obsidianByGuid = new Map<string, GCTask>();
        for (const task of obsidianTasks) {
            if (task.feishuGuid) {
                obsidianByGuid.set(task.feishuGuid, task);
            }
        }

        for (const feishu of feishuTasks) {
            // 1. GUID 精确匹配
            const guidMatch = obsidianByGuid.get(feishu.guid);
            if (guidMatch) {
                matches.push({ feishuTask: feishu, obsidianTask: guidMatch, matchType: 'guid' });
                matchedObsidian.add(guidMatch);
                continue;
            }

            // 2. 标题模糊匹配（仅在无 GUID 匹配时尝试）
            const fuzzyMatch = this.findFuzzyMatch(feishu, obsidianTasks, matchedObsidian);
            if (fuzzyMatch) {
                matches.push({ feishuTask: feishu, obsidianTask: fuzzyMatch, matchType: 'fuzzy' });
                matchedObsidian.add(fuzzyMatch);
                continue;
            }

            // 3. 仅在飞书存在的任务
            matches.push({ feishuTask: feishu, obsidianTask: undefined, matchType: 'feishu-only' });
        }

        // 4. 仅在 Obsidian 存在的任务
        for (const task of obsidianTasks) {
            if (!matchedObsidian.has(task)) {
                matches.push({ obsidianTask: task, matchType: 'obsidian-only' });
            }
        }

        return matches;
    }

    /**
     * 标题模糊匹配
     */
    private findFuzzyMatch(
        feishu: FeishuTaskRaw,
        obsidianTasks: GCTask[],
        exclude: Set<GCTask>
    ): GCTask | null {
        for (const task of obsidianTasks) {
            if (exclude.has(task)) continue;
            if (task.feishuGuid) continue; // 已有 GUID 的不做模糊匹配

            const similarity = this.titleSimilarity(feishu.summary, task.description);
            if (similarity >= 0.6) {
                return task;
            }
        }
        return null;
    }

    /**
     * 标题相似度（基于公共子串）
     */
    private titleSimilarity(a: string, b: string): number {
        if (!a || !b) return 0;
        if (a === b) return 1;

        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;

        // 最长公共子串
        let maxLen = 0;
        for (let i = 0; i < shorter.length; i++) {
            for (let j = i + 1; j <= shorter.length; j++) {
                const sub = shorter.substring(i, j);
                if (longer.includes(sub)) {
                    maxLen = Math.max(maxLen, sub.length);
                }
            }
        }

        return maxLen / Math.max(a.length, b.length);
    }

    // ==================== 变更检测 ====================

    /**
     * 检测每个匹配对需要的变更
     */
    private detectChanges(matches: TaskMatch[]): PendingChange[] {
        const changes: PendingChange[] = [];

        for (const match of matches) {
            let change: PendingChange | null = null;

            switch (match.matchType) {
                case 'guid':
                case 'fuzzy':
                    change = this.detectMatchedChange(match);
                    break;
                case 'feishu-only':
                    change = { type: 'pull-create', feishuTask: match.feishuTask };
                    break;
                case 'obsidian-only':
                    if (match.obsidianTask) {
                        change = { type: 'push-create', obsidianTask: match.obsidianTask };
                    }
                    break;
            }

            if (change) {
                changes.push(change);
            }
        }

        return changes;
    }

    /**
     * 检测已匹配任务的变更方向
     */
    private detectMatchedChange(match: TaskMatch): PendingChange | null {
        const feishu = match.feishuTask!;
        const obsidian = match.obsidianTask!;
        const guid = feishu.guid;

        const record = this.state.getRecord(guid);

        if (!record) {
            // 首次同步：双向都有数据，以飞书为准（pull）
            return { type: 'pull-update', feishuTask: feishu, obsidianTask: obsidian };
        }

        const feishuChanged = feishu.update_time !== record.feishuUpdatedAt;
        const obsidianChanged = this.hasObsidianChanged(obsidian, record);

        if (feishuChanged && obsidianChanged) {
            return { type: 'conflict', feishuTask: feishu, obsidianTask: obsidian };
        } else if (feishuChanged) {
            return { type: 'pull-update', feishuTask: feishu, obsidianTask: obsidian };
        } else if (obsidianChanged) {
            return { type: 'push-update', feishuTask: feishu, obsidianTask: obsidian };
        }

        // 无变更，跳过
        return null;
    }

    /**
     * 判断 Obsidian 任务是否变更（比较内容哈希）
     */
    private hasObsidianChanged(task: GCTask, record: SyncRecord): boolean {
        const currentHash = this.hashTask(task);
        return currentHash !== record.lastSyncedContent;
    }

    /**
     * 计算任务关键字段的内容哈希
     */
    private hashTask(task: GCTask): string {
        const parts = [
            task.description || '',
            task.completed ? '1' : '0',
            task.priority || 'normal',
            task.dueDate?.getTime() || '0',
            task.startDate?.getTime() || '0',
            task.feishuDesc || '',
        ];
        return parts.join('|');
    }

    // ==================== 变更应用 ====================

    private async applyChange(change: PendingChange, result: SyncResult): Promise<void> {
        switch (change.type) {
            case 'push-create':
                await this.pushCreate(change.obsidianTask!, result);
                break;
            case 'push-update':
                await this.pushUpdate(change.feishuTask!, change.obsidianTask!, result);
                break;
            case 'pull-create':
                await this.pullCreate(change.feishuTask!, result);
                break;
            case 'pull-update':
                await this.pullUpdate(change.feishuTask!, change.obsidianTask!, result);
                break;
            case 'conflict':
                await this.resolveConflict(change, result);
                break;
            default:
                result.skipped++;
        }
    }

    /** Push: Obsidian → 飞书 (新建) */
    private async pushCreate(task: GCTask, result: SyncResult): Promise<void> {
        const payload = toFeishuTaskPayload(task);
        payload.completed = toFeishuCompleted(task);
        const guid = await this.provider.createFeishuTask(payload);

        // 写回 GUID 到 Obsidian
        await this.writeGuidToObsidian(task, guid);

        // 记录同步状态
        this.state.setRecord(guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(task.filePath, task.lineNumber),
            feishuUpdatedAt: String(Date.now()),
            lastSyncedContent: this.hashTask(task),
        });

        result.pushed++;
        Logger.info('FeishuTaskSync', `Push created: ${task.description} → ${guid}`);
    }

    /** Push: Obsidian → 飞书 (更新) */
    private async pushUpdate(
        feishu: FeishuTaskRaw,
        task: GCTask,
        result: SyncResult
    ): Promise<void> {
        const payload = toFeishuTaskPayload(task);

        // 同步完成状态
        if (feishu.completed !== task.completed) {
            payload.completed = task.completed;
        }

        if (Object.keys(payload).length === 0) {
            // 无有效字段变更
            const record = this.state.getRecord(feishu.guid);
            if (record) {
                record.lastSyncedContent = this.hashTask(task);
                record.lastSyncAt = new Date().toISOString();
            }
            result.skipped++;
            return;
        }

        await this.provider.updateFeishuTask(feishu.guid, payload);

        this.state.setRecord(feishu.guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(task.filePath, task.lineNumber),
            feishuUpdatedAt: feishu.update_time || String(Date.now()),
            lastSyncedContent: this.hashTask(task),
        });

        result.pushed++;
        Logger.info('FeishuTaskSync', `Push updated: ${task.description}`);
    }

    /** Pull: 飞书 → Obsidian (新建) */
    private async pullCreate(feishu: FeishuTaskRaw, result: SyncResult): Promise<void> {
        const updates = fromFeishuTask({
            task_guid: feishu.guid,
            summary: feishu.summary,
            description: feishu.description,
            completed: feishu.completed,
            due_time: feishu.due,
            start_time: feishu.start,
            priority: feishu.priority,
        });

        const line = this.buildTaskLine(updates);
        const file = await this.getOrCreateTargetFile();

        await this.app.vault.process(file, (content: string) => {
            return content.trimEnd() + '\n' + line + '\n';
        });

        // 获取新行号
        const newContent = await this.app.vault.cachedRead(file);
        const lineNumber = newContent.split('\n').length - 1; // 最后一行（0-based 转 1-based）

        this.state.setRecord(feishu.guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(file.path, lineNumber),
            feishuUpdatedAt: feishu.update_time || String(Date.now()),
            lastSyncedContent: '',
        });

        result.pulled++;
        Logger.info('FeishuTaskSync', `Pull created: ${feishu.summary}`);
    }

    /** Pull: 飞书 → Obsidian (更新) */
    private async pullUpdate(
        feishu: FeishuTaskRaw,
        task: GCTask,
        result: SyncResult
    ): Promise<void> {
        const updates = fromFeishuTask({
            task_guid: feishu.guid,
            summary: feishu.summary,
            description: feishu.description,
            completed: feishu.completed,
            due_time: feishu.due,
            start_time: feishu.start,
            priority: feishu.priority,
        });

        await this.updateObsidianTaskLine(task, updates);

        const updatedTask = { ...task, ...updates };
        this.state.setRecord(feishu.guid, {
            lastSyncAt: new Date().toISOString(),
            obsidianTaskId: SyncStateManager.makeTaskId(task.filePath, task.lineNumber),
            feishuUpdatedAt: feishu.update_time || String(Date.now()),
            lastSyncedContent: this.hashTask(updatedTask as GCTask),
        });

        result.pulled++;
        Logger.info('FeishuTaskSync', `Pull updated: ${feishu.summary}`);
    }

    /** 处理冲突 */
    private async resolveConflict(change: PendingChange, result: SyncResult): Promise<void> {
        const { feishuTask: feishu, obsidianTask: task } = change;
        if (!feishu || !task) return;

        switch (this.options.conflictStrategy) {
            case 'local-win':
                await this.pushUpdate(feishu, task, result);
                break;
            case 'remote-win':
                await this.pullUpdate(feishu, task, result);
                break;
            case 'newest-win':
            default: {
                // 比较时间戳
                const feishuTime = parseInt(feishu.update_time || '0', 10);
                // 从同步记录获取上次同步时间作为参考
                const record = this.state.getRecord(feishu.guid);
                const lastSync = record ? new Date(record.lastSyncAt).getTime() : 0;

                if (feishuTime > lastSync && lastSync > 0) {
                    await this.pullUpdate(feishu, task, result);
                } else {
                    await this.pushUpdate(feishu, task, result);
                }
                break;
            }
        }

        result.conflicted++;
        Logger.info('FeishuTaskSync', `Conflict resolved via ${this.options.conflictStrategy}: ${task.description}`);
    }

    // ==================== Obsidian 文件操作 ====================

    /**
     * 生成任务行文本
     */
    private buildTaskLine(updates: GCTaskUpdates): string {
        // 使用一个模拟任务对象来调用序列化器
        const mockTask: GCTask = {
            filePath: '',
            fileName: '',
            lineNumber: 0,
            content: updates.description || '',
            description: updates.description || '',
            completed: updates.completed || false,
            priority: updates.priority || 'normal',
            dueDate: updates.dueDate,
            startDate: updates.startDate,
            feishuGuid: updates.feishuGuid,
            feishuDesc: updates.feishuDesc,
        };

        const taskUpdates: TaskUpdates = {
            completed: updates.completed,
            content: updates.description,
            feishuGuid: updates.feishuGuid,
            feishuDesc: updates.feishuDesc,
            dueDate: updates.dueDate,
            startDate: updates.startDate,
            priority: updates.priority as any,
        };

        // 使用 dataview 格式以兼容性更好
        return serializeTask(this.app, mockTask, taskUpdates, 'dataview');
    }

    /**
     * 更新 Obsidian 文件中的单行任务
     */
    private async updateObsidianTaskLine(task: GCTask, updates: GCTaskUpdates): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(task.filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${task.filePath}`);
        }

        await this.app.vault.process(file, (content: string) => {
            const lines = content.split('\n');
            const idx = task.lineNumber - 1; // 1-based → 0-based

            if (idx < 0 || idx >= lines.length) {
                throw new Error(`Line ${task.lineNumber} out of range in ${task.filePath}`);
            }

            // 构建更新后的任务行
            const taskUpdates: TaskUpdates = {
                completed: updates.completed !== undefined ? updates.completed : task.completed,
                content: updates.description,
                feishuGuid: updates.feishuGuid,
                feishuDesc: updates.feishuDesc,
                dueDate: updates.dueDate !== undefined ? updates.dueDate : task.dueDate,
                startDate: updates.startDate !== undefined ? updates.startDate : task.startDate,
                priority: updates.priority as any,
            };

            const newLine = serializeTask(this.app, task, taskUpdates, task.format || 'dataview');
            lines[idx] = newLine;

            return lines.join('\n');
        });
    }

    /**
     * 将飞书 GUID 写回 Obsidian 任务行
     *
     * 在 push-create 后调用，将飞书返回的 GUID 写入对应任务行。
     */
    private async writeGuidToObsidian(task: GCTask, guid: string): Promise<void> {
        await this.updateObsidianTaskLine(task, { feishuGuid: guid });
    }

    /**
     * 获取新任务的目标文件
     */
    private async getOrCreateTargetFile(): Promise<TFile> {
        const path = this.options.targetFile || 'gantt-calendar-feishu-sync.md';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) return file;

        // 自动创建目标文件
        await this.app.vault.create(path, '');
        const created = this.app.vault.getAbstractFileByPath(path);
        if (created instanceof TFile) return created;

        throw new Error(`Failed to create target file: ${path}`);
    }

    private getTargetFile(): TFile {
        const path = this.options.targetFile || 'gantt-calendar-feishu-sync.md';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) return file;

        throw new Error(`Target file not found: ${path}. Please create it first.`);
    }
}
