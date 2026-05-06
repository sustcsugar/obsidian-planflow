/**
 * 飞书相关命令
 *
 * 提供从飞书获取任务等功能的命令
 */

import { Notice, requestUrl } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { FeishuHttpClient } from '../data-layer/sources/api/providers/feishu/FeishuHttpClient';
import { FeishuTaskApi } from '../data-layer/sources/api/providers/feishu/FeishuTaskApi';
import { FeishuTaskStorage } from '../data-layer/sources/api/providers/FeishuTaskStorage';
import { FeishuProvider } from '../data-layer/sources/api/providers/FeishuProvider';
import { FeishuTaskSync } from '../data-layer/feishu-sync/FeishuTaskSync';
import { SyncStateManager } from '../data-layer/feishu-sync/syncState';
import { Logger } from '../utils/logger';

/**
 * 注册飞书相关命令
 * @param plugin 插件实例
 */
export function registerFeishuCommands(plugin: GanttCalendarPlugin): void {
    // 从飞书获取任务命令
    plugin.addCommand({
        id: 'fetch-feishu-tasks',
        name: '从飞书获取任务',
        callback: async () => {
            await fetchFeishuTasks(plugin);
        }
    });

    // 飞书双向同步命令
    plugin.addCommand({
        id: 'feishu-sync-tasks',
        name: '飞书任务双向同步',
        callback: async () => {
            await syncFeishuTasks(plugin);
        }
    });
}

/**
 * 从飞书获取任务并存储到Markdown文件
 * @param plugin 插件实例
 */
async function fetchFeishuTasks(plugin: GanttCalendarPlugin): Promise<void> {
    try {
        new Notice('正在从飞书获取任务...');

        // 获取同步配置中的访问令牌
        const syncConfig = plugin.settings.syncConfiguration;
        const apiConfig = syncConfig?.api;

        if (!apiConfig?.accessToken) {
            new Notice('请先完成飞书授权');
            Logger.warn('FeishuCommands', 'No access token found');
            return;
        }

        // 检查令牌是否过期
        const tokenExpireAt = apiConfig.tokenExpireAt;
        if (tokenExpireAt && Date.now() > tokenExpireAt) {
            new Notice('访问令牌已过期，请重新授权');
            Logger.warn('FeishuCommands', 'Access token expired');
            return;
        }

        // 创建兼容Obsidian的fetch函数
        const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);

        // 获取所有任务
        Logger.info('FeishuCommands', 'Fetching tasks from Feishu');
        const tasks = await FeishuTaskApi.getAllTasks(apiConfig.accessToken, requestFetch);

        if (tasks.length === 0) {
            new Notice('未获取到任何任务');
            Logger.info('FeishuCommands', 'No tasks found');
            return;
        }

        // 存储任务到Markdown文件
        const result = await FeishuTaskStorage.saveTasks(plugin.app, tasks, {
            fileName: '飞书任务',
            overwrite: true,
        });

        new Notice(`成功获取 ${tasks.length} 个任务，已保存到 ${result.file?.path}`);

        Logger.info('FeishuCommands', `Successfully fetched ${tasks.length} tasks`);

        // 尝试打开任务文件
        const taskFile = plugin.app.vault.getAbstractFileByPath('/飞书任务.md');
        if (taskFile) {
            await plugin.app.workspace.openLinkText(taskFile.path, '/', false);
        }

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error('FeishuCommands', 'Failed to fetch tasks', error);
        new Notice(`获取任务失败: ${errorMsg}`);
    }
}

/**
 * 执行飞书任务双向同步
 * @param plugin 插件实例
 */
async function syncFeishuTasks(plugin: GanttCalendarPlugin): Promise<void> {
    try {
        const syncConfig = plugin.settings.syncConfiguration;
        const apiConfig = syncConfig?.api;

        if (!apiConfig?.accessToken) {
            new Notice('请先在设置中完成飞书授权');
            return;
        }

        const clientId = apiConfig.clientId || apiConfig.appId;
        const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

        if (!clientId || !clientSecret) {
            new Notice('请先在设置中配置飞书 App ID 和 App Secret');
            return;
        }

        // 检查是否选择了目标任务清单
        const tasklistGuid = apiConfig?.tasklistGuid;
        const taskLists = (apiConfig as any)?.taskLists;

        if (!tasklistGuid) {
            if (!taskLists || taskLists.length === 0) {
                new Notice('请先在设置中获取飞书任务清单，然后在飞书中创建任务清单（如有必要），最后选择目标清单');
            } else {
                new Notice('请先在设置中选择同步目标清单，不能同步到默认清单');
            }
            return;
        }

        // 显示当前同步目标清单名称
        const targetTasklistName = taskLists?.find?.((tl: any) => tl.guid === tasklistGuid)?.name || tasklistGuid;
        new Notice(`开始同步 → 目标清单: ${targetTasklistName}`, 5000);

        // 创建 FeishuProvider
        const provider = new FeishuProvider({
            enabled: true,
            syncDirection: syncConfig?.syncDirection || 'bidirectional',
            autoSync: false,
            syncInterval: 0,
            conflictResolution: syncConfig?.conflictResolution || 'newest-win',
            api: {
                provider: 'feishu',
                accessToken: apiConfig.accessToken,
                refreshToken: apiConfig.refreshToken,
                tokenExpireAt: apiConfig.tokenExpireAt,
                clientId,
                clientSecret,
                redirectUri: apiConfig.redirectUri,
            },
        });

        // 创建同步状态管理器
        const stateManager = new SyncStateManager(plugin.app);

        // 创建同步引擎（带进度回调 → 更新状态栏）
        const syncEngine = new FeishuTaskSync(plugin.app, provider, stateManager, {
            conflictStrategy: (syncConfig?.conflictResolution as 'newest-win' | 'local-win' | 'remote-win') || 'newest-win',
            targetFile: syncConfig?.feishuSyncTargetFile || 'gantt-calendar-feishu-sync.md',
            enabledFormats: (plugin.settings.enabledTaskFormats as ('tasks' | 'dataview')[]) || ['tasks', 'dataview'],
            globalFilter: plugin.settings.globalTaskFilter,
            onProgress: (stage: string) => plugin.setSyncStatus(stage),
            tasklistGuid: apiConfig?.tasklistGuid,
            creatorOpenId: apiConfig?.userOpenId,
            creatorUserId: apiConfig?.userId,
        });

        // 执行同步
        const result = await syncEngine.sync();

        // 显示结果
        const parts: string[] = [];
        if (result.pushed > 0) parts.push(`推送 ${result.pushed} 个`);
        if (result.pulled > 0) parts.push(`拉取 ${result.pulled} 个`);
        if (result.conflicted > 0) parts.push(`冲突 ${result.conflicted} 个`);
        if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 个`);

        const summary = parts.length > 0 ? parts.join('，') : '无变更';

        if (result.errors.length > 0) {
            const firstErrors = result.errors.slice(0, 3).join('\n');
            const errorNotice = result.errors.length > 3
                ? `同步完成: ${summary}，${result.errors.length} 个错误\n前3个:\n${firstErrors}`
                : `同步完成: ${summary}，错误:\n${firstErrors}`;
            new Notice(errorNotice, 10000);
            Logger.warn('FeishuCommands', 'Sync errors', result.errors);
        } else if (summary === '无变更') {
            new Notice(`同步完成: 无变更\n清单: ${targetTasklistName}\n本地和飞书任务已一致`, 5000);
        } else {
            new Notice(`同步完成: ${summary}\n清单: ${targetTasklistName}`, 8000);
        }

        Logger.info('FeishuCommands', `Sync result: ${summary}`);

        // 更新同步完成状态到状态栏（不清除，保持显示）
        plugin.setSyncStatus(`✅ ${summary}`);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error('FeishuCommands', 'Sync failed', error);
        new Notice(`同步失败: ${errorMsg}`);
        plugin.setSyncStatus(`❌ 同步失败`);
    }
}
