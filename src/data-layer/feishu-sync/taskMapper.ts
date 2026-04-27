/**
 * 字段映射模块
 *
 * 实现 GCTask ↔ FeishuTask 的双向字段映射。
 * 用于同步引擎的 push（Obsidian→飞书）和 pull（飞书→Obsidian）操作。
 */

import type { GCTask } from '../../types';
import type { FeishuTask, FeishuTaskTime } from '../sources/api/providers/feishu/FeishuTypes';

/** 飞书任务 API 的 create/update 请求体 */
export interface FeishuTaskPayload {
    summary?: string;
    description?: string;
    due?: { timestamp?: string; is_all_day?: boolean };
    start?: { timestamp?: string; is_all_day?: boolean };
    priority?: string;
    completed?: boolean;
}

// ==================== GCTask → 飞书 ====================

/**
 * 将 Obsidian 任务映射为飞书 API 请求体
 *
 * @param task - Obsidian 任务对象
 * @returns 飞书 API create/update 请求体
 */
export function toFeishuTaskPayload(task: GCTask): FeishuTaskPayload {
    const payload: FeishuTaskPayload = {};

    // summary ↔ description (1:1 clean mapping)
    if (task.description) {
        payload.summary = task.description;
    }

    // feishuDesc → description (separate field, no infinite iteration)
    if (task.feishuDesc) {
        payload.description = task.feishuDesc;
    }

    // dueDate → due
    if (task.dueDate) {
        payload.due = {
            timestamp: String(task.dueDate.getTime()),
        };
    }

    // startDate → start
    if (task.startDate) {
        payload.start = {
            timestamp: String(task.startDate.getTime()),
        };
    }

    // priority mapping
    if (task.priority && task.priority !== 'normal') {
        payload.priority = mapObsidianToFeishuPriority(task.priority);
    }

    return payload;
}

/**
 * 将 Obsidian 任务状态映射为飞书任务完成状态
 */
export function toFeishuCompleted(task: GCTask): boolean {
    return task.completed;
}

// ==================== 飞书 → GCTask ====================

/**
 * 飞书任务 → GCTask 字段映射结果
 */
export interface GCTaskUpdates {
    description?: string;
    feishuGuid?: string;
    feishuDesc?: string;
    completed?: boolean;
    priority?: string;
    dueDate?: Date;
    startDate?: Date;
}

/**
 * 将飞书任务映射为 GCTask 更新字段
 *
 * @param feishu - 飞书任务对象
 * @returns GCTask 更新字段
 */
export function fromFeishuTask(feishu: FeishuTask): GCTaskUpdates {
    const updates: GCTaskUpdates = {};

    // task_guid → feishuGuid (association key)
    if (feishu.task_guid) {
        updates.feishuGuid = feishu.task_guid;
    }

    // summary → description
    if (feishu.summary) {
        updates.description = feishu.summary;
    }

    // description → feishuDesc (rename to avoid merging with summary)
    if (feishu.description) {
        updates.feishuDesc = feishu.description;
    }

    // completed
    if (feishu.completed !== undefined) {
        updates.completed = feishu.completed;
    }

    // due_time → dueDate
    if (feishu.due_time?.timestamp) {
        const millis = parseInt(feishu.due_time.timestamp, 10);
        if (!isNaN(millis)) {
            updates.dueDate = new Date(millis);
        }
    }

    // start_time → startDate
    if (feishu.start_time?.timestamp) {
        const millis = parseInt(feishu.start_time.timestamp, 10);
        if (!isNaN(millis)) {
            updates.startDate = new Date(millis);
        }
    }

    // priority
    if (feishu.priority) {
        updates.priority = mapFeishuToObsidianPriority(feishu.priority);
    }

    return updates;
}

// ==================== 优先级映射 ====================

/**
 * Obsidian 优先级 → 飞书优先级
 *
 * 6 级 → 3 级映射（有损）：
 * - highest/high → high
 * - medium/normal → normal
 * - low/lowest → low
 */
export function mapObsidianToFeishuPriority(priority: string): string {
    switch (priority) {
        case 'highest':
        case 'high':
            return 'high';
        case 'low':
        case 'lowest':
            return 'low';
        case 'medium':
        case 'normal':
        default:
            return 'normal';
    }
}

/**
 * 飞书优先级 → Obsidian 优先级
 *
 * 3 级 → 6 级映射：
 * - high → high
 * - normal → normal
 * - low → low
 */
export function mapFeishuToObsidianPriority(priority: string): string {
    switch (priority) {
        case 'high':
            return 'high';
        case 'low':
            return 'low';
        case 'normal':
        default:
            return 'normal';
    }
}

// ==================== 日期工具 ====================

/**
 * Date → 飞书时间戳字符串（毫秒）
 */
export function dateToFeishuTimestamp(date: Date): string {
    return String(date.getTime());
}

/**
 * 飞书时间戳字符串 → Date
 */
export function feishuTimestampToDate(timestamp: string): Date | undefined {
    const millis = parseInt(timestamp, 10);
    if (isNaN(millis)) return undefined;
    return new Date(millis);
}

/**
 * FeishuTaskTime → Date
 */
export function feishuTimeToDate(time?: FeishuTaskTime): Date | undefined {
    if (!time?.timestamp) return undefined;
    return feishuTimestampToDate(time.timestamp);
}
