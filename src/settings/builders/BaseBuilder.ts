import { Setting, SettingGroup } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import type { BuilderConfig } from '../types';

/**
 * 设置构建器基类
 * 提供所有构建器的通用接口和公共方法
 */
export abstract class BaseBuilder {
	protected containerEl: HTMLElement;
	protected plugin: GanttCalendarPlugin;
	protected onRefreshSettings?: () => void;

	constructor(config: BuilderConfig) {
		this.containerEl = config.containerEl;
		this.plugin = config.plugin;
		this.onRefreshSettings = config.onRefreshSettings;
	}

	/**
	 * 检测 SettingGroup API 是否可用（Obsidian 1.11+）
	 */
	protected isSettingGroupAvailable(): boolean {
		try {
			return typeof SettingGroup === 'function';
		} catch {
			return false;
		}
	}

	/**
	 * 创建设置分组（兼容旧版本）
	 * @param heading 分组标题
	 * @param callback 设置项回调
	 */
	protected createSettingGroup(
		heading: string,
		callback: (group: SettingGroup | HTMLElement) => void
	): void {
		if (this.isSettingGroupAvailable()) {
			const group = new SettingGroup(this.containerEl);
			group.setHeading(heading);
			callback(group);
		} else {
			this.containerEl.createEl('h2', { text: heading, cls: 'setting-item-heading' });
			callback(this.containerEl);
		}
	}

	/**
	 * 渲染设置区域
	 * 子类必须实现此方法
	 */
	abstract render(): void;

	/**
	 * 创建 Setting 实例的便捷方法
	 */
	protected createSetting(name: string, desc: string): Setting {
		return new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc);
	}

	/**
	 * 保存并刷新插件视图（年/月/周/日/任务/甘特图/侧边栏）
	 * 绝大多数设置项应使用此方法
	 */
	protected async saveAndRefreshViews(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
	}

	/**
	 * 保存 + 刷新视图 + 重建设置页 DOM
	 * 仅当设置页结构变化时使用（增删状态、OAuth 状态变更、清单选择）
	 */
	protected async saveAndRefreshAll(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
		if (this.onRefreshSettings) {
			this.onRefreshSettings();
		}
	}
}
