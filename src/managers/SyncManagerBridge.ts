/**
 * 同步管理器桥接层
 *
 * 负责桥接 SyncManager 和插件，处理命令注册和自动同步
 */

import type GanttCalendarPlugin from '../../main';
import type { SyncConfiguration } from '../data-layer/sync/syncTypes';
import { SyncManager } from '../data-layer/sync/syncManager';
import { createSyncManager } from '../data-layer/sync/syncFactory';
import { syncFeishuTasks } from '../commands/feishuCommands';
import { Logger } from '../utils/logger';

/**
 * 同步管理器桥接层
 */
export class SyncManagerBridge {
	private plugin: GanttCalendarPlugin;
	private syncManager?: SyncManager | null;
	private autoSyncTimer?: number;

	constructor(plugin: GanttCalendarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 初始化同步管理器
	 */
	initialize(config?: SyncConfiguration): void {
		if (!config) {
			return;
		}

		// 检查是否启用了任何同步源
		if (!config.enabledSources?.api && !config.enabledSources?.caldav) {
			Logger.info('SyncManagerBridge', 'No sync sources enabled');
			return;
		}

		try {
			this.syncManager = createSyncManager(config);

			if (this.syncManager) {
				Logger.info('SyncManagerBridge', 'Sync manager initialized');
			}
		} catch (error) {
			Logger.error('SyncManagerBridge', 'Failed to initialize sync manager', error);
		}

		// 自动同步不依赖 syncManager，直接使用 syncFeishuTasks
		if (config.syncInterval > 0) {
			this.startAutoSync(config.syncInterval);
		}
	}

	/**
	 * 更新配置（当设置变化时调用）
	 */
	async updateConfiguration(config?: SyncConfiguration): Promise<void> {
		// 始终先停止现有定时器
		this.stopAutoSync();

		if (!config) {
			this.destroySyncManager();
			return;
		}

		const hasEnabledSources = config.enabledSources?.api || config.enabledSources?.caldav;

		if (!hasEnabledSources) {
			this.destroySyncManager();
		} else if (!this.syncManager) {
			// syncManager 不存在，重新初始化
			try {
				this.syncManager = createSyncManager(config);
				if (this.syncManager) {
					Logger.info('SyncManagerBridge', 'Sync manager re-initialized');
				}
			} catch (error) {
				Logger.error('SyncManagerBridge', 'Failed to re-initialize sync manager', error);
			}
		} else {
			// 更新现有配置（不再调用 SyncManager 的 startAutoSync）
			this.syncManager.updateConfiguration(config);
		}

		// 自动同步不依赖 syncManager
		if (config.syncInterval > 0 && hasEnabledSources) {
			this.startAutoSync(config.syncInterval);
		}
	}

	/**
	 * 启动自动同步
	 */
	private startAutoSync(intervalMinutes: number): void {
		// 清除现有定时器
		this.stopAutoSync();

		const intervalMs = intervalMinutes * 60 * 1000;

		this.autoSyncTimer = window.setInterval(async () => {
			Logger.info('SyncManagerBridge', 'Running auto sync...');
			try {
				await syncFeishuTasks(this.plugin, { isAutoSync: true });
			} catch (error) {
				Logger.error('SyncManagerBridge', 'Auto sync failed', error);
			}
		}, intervalMs);

		Logger.info('SyncManagerBridge', `Auto sync started (interval: ${intervalMinutes} minutes)`);
	}

	/**
	 * 停止自动同步
	 */
	private stopAutoSync(): void {
		if (this.autoSyncTimer) {
			clearInterval(this.autoSyncTimer);
			this.autoSyncTimer = undefined;
			Logger.info('SyncManagerBridge', 'Auto sync stopped');
		}
	}

	/**
	 * 销毁同步管理器（不含定时器）
	 */
	private destroySyncManager(): void {
		if (this.syncManager) {
			this.syncManager.destroy();
			this.syncManager = null;
		}
	}

	/**
	 * 销毁同步管理器
	 */
	destroy(): void {
		this.stopAutoSync();
		this.destroySyncManager();
	}
}
