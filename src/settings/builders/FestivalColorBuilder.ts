import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { MacaronColorPicker } from '../components';
import { PRESET_FESTIVAL_COLORS } from '../constants';
import type { BuilderConfig } from '../types';

/**
 * 节日颜色设置构建器
 */
export class FestivalColorBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('节日颜色', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 阳历节日颜色
			addSetting(setting => {
				setting.setName('阳历节日颜色')
					.setDesc('自定义阳历节日显示颜色');
				setting.controlEl.empty();
				new MacaronColorPicker({
					container: setting.controlEl,
					currentColor: this.plugin.settings.solarFestivalColor,
					colors: PRESET_FESTIVAL_COLORS,
					columns: 7,
					onColorChange: async (color) => {
						this.plugin.settings.solarFestivalColor = color;
						await this.saveAndRefreshViews();
					},
				}).render();
			});

			// 农历节日颜色
			addSetting(setting => {
				setting.setName('农历节日颜色')
					.setDesc('自定义农历节日显示颜色');
				setting.controlEl.empty();
				new MacaronColorPicker({
					container: setting.controlEl,
					currentColor: this.plugin.settings.lunarFestivalColor,
					colors: PRESET_FESTIVAL_COLORS,
					columns: 7,
					onColorChange: async (color) => {
						this.plugin.settings.lunarFestivalColor = color;
						await this.saveAndRefreshViews();
					},
				}).render();
			});

			// 节气颜色
			addSetting(setting => {
				setting.setName('节气颜色')
					.setDesc('自定义节气显示颜色');
				setting.controlEl.empty();
				new MacaronColorPicker({
					container: setting.controlEl,
					currentColor: this.plugin.settings.solarTermColor,
					colors: PRESET_FESTIVAL_COLORS,
					columns: 7,
					onColorChange: async (color) => {
						this.plugin.settings.solarTermColor = color;
						await this.saveAndRefreshViews();
					},
				}).render();
			});
		});
	}
}
