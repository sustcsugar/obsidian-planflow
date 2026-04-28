import { Setting, SettingGroup, Notice, requestUrl } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import { FeishuOAuth } from '../../data-layer/sources/api/providers/feishu/FeishuOAuth';
import { FeishuHttpClient } from '../../data-layer/sources/api/providers/feishu/FeishuHttpClient';
import { FeishuUserApi } from '../../data-layer/sources/api/providers/feishu/FeishuUserApi';
import { FeishuCalendarApi } from '../../data-layer/sources/api/providers/feishu/FeishuCalendarApi';
import { FeishuTaskApi } from '../../data-layer/sources/api/providers/feishu/FeishuTaskApi';
import type { FeishuCalendar, FeishuTaskList } from '../../data-layer/sources/api/providers/feishu/FeishuTypes';
import { FeishuProvider } from '../../data-layer/sources/api/providers/FeishuProvider';
import { FeishuTaskSync } from '../../data-layer/feishu-sync/FeishuTaskSync';
import { SyncStateManager } from '../../data-layer/feishu-sync/syncState';
import { Logger } from '../../utils/logger';

/**
 * 同步设置构建器
 * 提供 API 同步和 CalDAV 同步的配置界面
 */
export class SyncSettingsBuilder extends BaseBuilder {
	// 临时存储待处理的授权码
	private pendingAuthCode: string = '';

	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 获取同步配置（如果不存在则初始化）
		const syncConfig = this.getSyncConfiguration();

		this.createSettingGroup('第三方同步(此功能尚未开发,请不要使用,防止数据丢失)', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// ===== 同步方向 =====
			addSetting(setting =>
				setting.setName('同步方向')
					.setDesc('选择任务同步的方向')
					.addDropdown(drop => drop
						.addOptions({
							'bidirectional': '双向同步',
							'import-only': '仅导入（从远程）',
							'export-only': '仅导出（到远程）'
						})
						.setValue(syncConfig.syncDirection)
						.onChange(async (value) => {
							this.updateSyncConfig({ syncDirection: value as 'bidirectional' | 'import-only' | 'export-only' });
							await this.saveAndRefresh();
						}))
			);

			// ===== 冲突解决策略 =====
			addSetting(setting =>
				setting.setName('冲突解决策略')
					.setDesc('当本地和远程任务同时修改时的处理方式')
					.addDropdown(drop => drop
						.addOptions({
							'local-win': '本地优先',
							'remote-win': '远程优先',
							'newest-win': '最新修改优先',
							'manual': '手动处理'
						})
						.setValue(syncConfig.conflictResolution)
						.onChange(async (value) => {
							this.updateSyncConfig({ conflictResolution: value as 'local-win' | 'remote-win' | 'newest-win' | 'manual' });
							await this.saveAndRefresh();
						}))
			);

			// ===== 自动同步间隔 =====
			addSetting(setting =>
				setting.setName('自动同步间隔')
					.setDesc('自动同步的时间间隔（分钟），设为 0 关闭自动同步')
					.addSlider(slider => slider
						.setLimits(0, 120, 5)
						.setValue(syncConfig.syncInterval)
						.setDynamicTooltip()
						.onChange(async (value: number) => {
							this.updateSyncConfig({ syncInterval: value });
							await this.saveAndRefresh();
						}))
			);

			// ===== 手动同步按钮 =====
			addSetting(setting =>
				setting.setName('手动同步')
					.setDesc('立即执行一次同步操作')
					.addButton(button => button
						.setButtonText('立即同步')
						.setClass('mod-cta')
						.onClick(async () => {
							await this.runManualSync();
						}))
			);

				// ===== 飞书同步目标文件 =====
				addSetting(setting =>
					setting.setName("飞书同步目标文件")
						.setDesc("飞书新任务将同步到此文件（不存在时自动创建，默认 gantt-calendar-feishu-sync.md）")
						.addText(text => text
							.setPlaceholder("gantt-calendar-feishu-sync.md")
							.setValue(syncConfig.feishuSyncTargetFile || "gantt-calendar-feishu-sync.md")
							.onChange(async (value: string) => {
								this.updateSyncConfig({ feishuSyncTargetFile: value || "gantt-calendar-feishu-sync.md" });
								await this.saveAndRefresh();
							}))
				);
		});

		// ===== API 同步设置 =====
		this.createSettingGroup('任务同步(此功能尚未开发,请不要使用,防止数据丢失)', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// API 同步开关
			addSetting(setting =>
				setting.setName('启用 API 同步')
					.setDesc('开启后将与第三方任务管理服务同步')
					.addToggle(toggle => toggle
						.setValue(syncConfig.enabledSources?.api || false)
						.onChange(async (value: boolean) => {
							this.updateSyncConfig({
								enabledSources: { ...syncConfig.enabledSources, api: value }
							});
							await this.saveAndRefresh();
						}))
			);

			// API 服务商选择
			const provider = syncConfig.api?.provider || 'feishu';
			addSetting(setting =>
				setting.setName('任务服务提供商')
					.setDesc('选择要同步的任务管理服务')
					.addDropdown(drop => drop
						.addOptions({
							'feishu': '飞书 (Lark)',
							'microsoft-todo': 'Microsoft To Do',
							'custom': '自定义'
						})
						.setValue(provider)
						.onChange(async (value: string) => {
							this.updateSyncConfig({
								api: { ...syncConfig.api, provider: value as 'feishu' | 'microsoft-todo' | 'custom' }
							});
							await this.saveAndRefresh();
							// 刷新整个设置面板以更新服务商配置
							this.refreshSettingsPanel();
						}))
			);

			// 服务商特定配置 - 直接渲染到 group 中
			if (provider === 'feishu') {
				this.renderFeishuSettings(group, syncConfig);
			} else if (provider === 'microsoft-todo') {
				this.renderMicrosoftTodoSettings(group, syncConfig);
			}

			// 测试连接按钮
			addSetting(setting =>
				setting.setName('测试连接')
					.setDesc('验证配置是否正确')
					.addButton(button => button
						.setButtonText('测试连接')
						.onClick(async () => {
							await this.testConnection();
						}))
			);

			// 获取日历列表按钮（仅飞书）
			if (provider === 'feishu') {
				addSetting(setting =>
					setting.setName('获取日历列表')
						.setDesc('获取飞书账号中的所有日历')
						.addButton(button => button
							.setButtonText('获取日历列表')
							.onClick(async () => {
								await this.fetchFeishuCalendarList();
							}))
				);
			}

				// 获取任务清单按钮（仅飞书）
				if (provider === "feishu") {
					addSetting(setting =>
						setting.setName("获取任务清单")
							.setDesc("获取飞书账号中可操作的任务清单")
							.addButton(button => button
								.setButtonText("获取任务清单")
								.onClick(async () => {
									await this.fetchFeishuTaskLists();
								}))
					);
				}

			// 日历列表展示区域（仅飞书，直接添加到容器中）
			if (provider === 'feishu') {
				const calendarList = syncConfig.api?.calendarList as Array<{
					summary: string;
					summary_alias?: string;
					calendar_id: string;
					type?: string;
					description?: string;
				}> || [];

				if (calendarList.length > 0) {
					const calendarListEl = document.createElement('div');
					calendarListEl.className = 'feishu-calendar-list';
					calendarListEl.style.marginTop = '18px';
					calendarListEl.style.marginBottom = '18px';
					calendarListEl.style.padding = '0';

					const headerEl = document.createElement('div');
					headerEl.style.fontWeight = 'bold';
					headerEl.style.marginBottom = '12px';
					headerEl.style.fontSize = '14px';
					headerEl.textContent = `飞书日历列表 (${calendarList.length} 个)`;
					calendarListEl.appendChild(headerEl);

					const listEl = document.createElement('div');
					listEl.style.display = 'flex';
					listEl.style.flexWrap = 'wrap';
					listEl.style.gap = '12px';
					listEl.style.maxHeight = '300px';
					listEl.style.overflowY = 'auto';

					calendarList.forEach((cal) => {
						const itemEl = document.createElement('div');
						itemEl.style.padding = '12px';
						itemEl.style.border = '1px solid var(--background-modifier-border)';
						itemEl.style.borderRadius = '6px';
						itemEl.style.backgroundColor = 'var(--background-secondary)';
						itemEl.style.minWidth = '220px';
						itemEl.style.flex = '0 0 auto';

						const isPrimary = cal.type === 'primary';
						const typeLabel = isPrimary ? '主日历' : (cal.type || '共享');
						const typeColor = isPrimary ? 'var(--text-accent)' : 'var(--text-muted)';

						// 标题行
						const titleDiv = itemEl.createDiv();
						titleDiv.style.fontWeight = '500';
						titleDiv.setText(cal.summary);
						if (isPrimary) {
							const starSpan = titleDiv.createSpan();
							starSpan.style.color = 'var(--text-accent)';
							starSpan.setText(' ★');
						}

						// 类型行
						const typeDiv = itemEl.createDiv();
						typeDiv.style.fontSize = '12px';
						typeDiv.style.color = 'var(--text-muted)';
						typeDiv.style.marginTop = '6px';
						const typeSpan = typeDiv.createSpan();
						typeSpan.style.color = typeColor;
						typeSpan.setText(`[${typeLabel}]`);

						// ID 行
						const idDiv = itemEl.createDiv();
						idDiv.style.fontSize = '11px';
						idDiv.style.fontFamily = 'monospace';
						idDiv.style.color = 'var(--text-muted)';
						idDiv.style.marginTop = '4px';
						idDiv.style.wordBreak = 'break-all';
						idDiv.setText(`${cal.calendar_id.substring(0, 30)}...`);

						// 描述行（可选）
						if (cal.description) {
							const descDiv = itemEl.createDiv();
							descDiv.style.fontSize = '12px';
							descDiv.style.color = 'var(--text-muted)';
							descDiv.style.marginTop = '6px';
							descDiv.setText(cal.description);
						}

						// 添加选择按钮
						const selectBtn = document.createElement('button');
						selectBtn.textContent = '选择';
						selectBtn.style.marginTop = '10px';
						selectBtn.style.padding = '6px 16px';
						selectBtn.style.fontSize = '12px';
						selectBtn.className = 'mod-cta';
						selectBtn.onclick = () => {
							// TODO: 实现选择日历的逻辑
							new Notice(`已选择日历：${cal.summary}`);
						};
						itemEl.appendChild(selectBtn);

						listEl.appendChild(itemEl);
					});

					calendarListEl.appendChild(listEl);
					this.containerEl.appendChild(calendarListEl);
				}
			}
		});

				// 任务清单展示区域（仅飞书）
				{
					const taskLists = syncConfig.api?.taskLists as FeishuTaskList[] || [];
					const selectedGuid = syncConfig.api?.tasklistGuid || '';

					if (taskLists.length === 0) {
						const hintEl = document.createElement("div");
						hintEl.style.marginTop = "12px";
						hintEl.style.padding = "10px 14px";
						hintEl.style.borderRadius = "6px";
						hintEl.style.backgroundColor = "var(--background-secondary)";
						hintEl.style.color = "var(--text-muted)";
						hintEl.style.fontSize = "13px";
						hintEl.setText("\u2191 \u8bf7\u5148\u70b9\u51fb\u4e0a\u65b9\u300c\u83b7\u53d6\u4efb\u52a1\u6e05\u5355\u300d\u6309\u94ae\u83b7\u53d6\u6e05\u5355\u5217\u8868\uff0c\u7136\u540e\u9009\u62e9\u540c\u6b65\u76ee\u6807\u6e05\u5355\u3002\u672a\u9009\u62e9\u6e05\u5355\u65f6\u65e0\u6cd5\u4f7f\u7528\u540c\u6b65\u529f\u80fd\u3002");
						this.containerEl.appendChild(hintEl);
					} else if (!selectedGuid) {
						const hintEl = document.createElement("div");
						hintEl.style.marginTop = "12px";
						hintEl.style.padding = "10px 14px";
						hintEl.style.borderRadius = "6px";
						hintEl.style.border = "1px solid var(--interactive-accent)";
						hintEl.style.backgroundColor = "var(--interactive-accent-hover)";
						hintEl.style.color = "var(--text-on-accent)";
						hintEl.style.fontSize = "13px";
						hintEl.style.fontWeight = "500";
						hintEl.setText("\u26a0 \u8bf7\u5728\u4e0b\u65b9\u9009\u62e9\u4e00\u4e2a\u4efb\u52a1\u6e05\u5355\u4f5c\u4e3a\u540c\u6b65\u76ee\u6807\u3002\u672a\u9009\u62e9\u6e05\u5355\u65f6\u65e0\u6cd5\u4f7f\u7528\u540c\u6b65\u529f\u80fd\uff0c\u4e0d\u5141\u8bb8\u540c\u6b65\u5230\u9ed8\u8ba4\u6e05\u5355\u3002");
						this.containerEl.appendChild(hintEl);
					}

					if (taskLists.length > 0) {
						const taskListEl = document.createElement("div");
						taskListEl.className = "feishu-task-list";
						taskListEl.style.marginTop = "18px";
						taskListEl.style.marginBottom = "18px";
						taskListEl.style.padding = "0";

						const headerEl = document.createElement("div");
						headerEl.style.fontWeight = "bold";
						headerEl.style.marginBottom = "12px";
						headerEl.style.fontSize = "14px";
						headerEl.textContent = "\u98de\u4e66\u4efb\u52a1\u6e05\u5355\u5217\u8868 (" + taskLists.length + " \u4e2a)";
						taskListEl.appendChild(headerEl);

						const listEl = document.createElement("div");
						listEl.style.display = "flex";
						listEl.style.flexWrap = "wrap";
						listEl.style.gap = "12px";
						listEl.style.maxHeight = "300px";
						listEl.style.overflowY = "auto";

						taskLists.forEach((tl) => {
							const isSelected = tl.guid === selectedGuid;
							const itemEl = document.createElement("div");
							itemEl.style.padding = "12px";
							itemEl.style.border = isSelected
								? "2px solid var(--interactive-accent)"
								: "1px solid var(--background-modifier-border)";
							itemEl.style.borderRadius = "6px";
							itemEl.style.backgroundColor = isSelected
								? "var(--interactive-accent-hover)"
								: "var(--background-secondary)";
							itemEl.style.minWidth = "220px";
							itemEl.style.flex = "0 0 auto";

							const titleDiv = itemEl.createDiv();
							titleDiv.style.fontWeight = "500";
							titleDiv.setText((isSelected ? "\u2713 " : "") + tl.name);

							const idDiv = itemEl.createDiv();
							idDiv.style.fontSize = "11px";
							idDiv.style.fontFamily = "monospace";
							idDiv.style.color = "var(--text-muted)";
							idDiv.style.marginTop = "4px";
							idDiv.style.wordBreak = "break-all";
							idDiv.setText(tl.guid);

							if (tl.creator) {
								const creatorDiv = itemEl.createDiv();
								creatorDiv.style.fontSize = "12px";
								creatorDiv.style.color = "var(--text-muted)";
								creatorDiv.style.marginTop = "4px";
								creatorDiv.setText("\u521b\u5efa\u8005: " + tl.creator.id);
							}

							if (tl.members && tl.members.length > 0) {
								const memberDiv = itemEl.createDiv();
								memberDiv.style.fontSize = "12px";
								memberDiv.style.color = "var(--text-muted)";
								memberDiv.style.marginTop = "4px";
								memberDiv.setText("\u6210\u5458: " + tl.members.length + " \u4eba");
							}

							const selectBtn = document.createElement("button");
							selectBtn.textContent = isSelected ? "\u5df2\u9009\u62e9" : "\u9009\u62e9";
							selectBtn.style.padding = "6px 16px";
							selectBtn.style.fontSize = "12px";
							selectBtn.className = isSelected ? "mod-cta" : "";
							selectBtn.onclick = async () => {
								if (!syncConfig.api) syncConfig.api = {} as any;
								syncConfig.api.tasklistGuid = tl.guid;
								await this.plugin.saveSettings();
								new Notice("\u5df2\u9009\u62e9\u4efb\u52a1\u6e05\u5355\uff1a" + tl.name);
								this.refreshSettingsPanel();
							};
							itemEl.appendChild(selectBtn);

							const testBtn = document.createElement("button");
							testBtn.textContent = "测试同步";
							testBtn.style.padding = "6px 16px";
							testBtn.style.fontSize = "12px";
							testBtn.style.marginLeft = "8px";
							testBtn.onclick = async () => {
								await this.testSyncToTasklist(tl.guid, tl.name);
							};
							itemEl.appendChild(testBtn);

							listEl.appendChild(itemEl);
						});

						taskListEl.appendChild(listEl);
						this.containerEl.appendChild(taskListEl);
					}
				}

				// 清除清单任务（仅飞书）
				{
					const taskLists = syncConfig.api?.taskLists as FeishuTaskList[] || [];
					if (taskLists.length > 0) {
						const clearSetting = new Setting(this.containerEl)
							.setName("\u6e05\u9664\u6e05\u5355\u4efb\u52a1")
							.setDesc("\u5220\u9664\u6307\u5b9a\u6e05\u5355\u4e2d\u7684\u6240\u6709\u98de\u4e66\u4efb\u52a1\uff08\u4e0d\u53ef\u6062\u590d\uff0c\u8bf7\u8c28\u614e\u64cd\u4f5c\uff09");

						const selectEl = document.createElement("select") as HTMLSelectElement;
						selectEl.className = "dropdown";
						selectEl.style.marginRight = "8px";
						selectEl.style.minWidth = "160px";
						taskLists.forEach((tl) => {
							const opt = document.createElement("option");
							opt.value = tl.guid;
							opt.textContent = tl.name;
							if (tl.guid === syncConfig.api?.tasklistGuid) opt.selected = true;
							selectEl.appendChild(opt);
						});

						const clearBtn = document.createElement("button");
						clearBtn.textContent = "\u6e05\u9664\u4efb\u52a1";
						clearBtn.className = "mod-warning";
						clearBtn.style.padding = "6px 16px";
						clearBtn.style.fontSize = "12px";
						clearBtn.onclick = async () => {
							const selectedTasklistGuid = selectEl.value;
							const selectedName = taskLists.find(t => t.guid === selectedTasklistGuid)?.name || selectedTasklistGuid;
							const confirmed = confirm(`确定要清除清单「${selectedName}」中的所有任务吗？

此操作将删除该清单下的所有飞书任务，不可恢复！`);
							if (!confirmed) return;
							await this.clearFeishuTasklistTasks(selectedTasklistGuid, selectedName);
						};

						clearSetting.controlEl.appendChild(selectEl);
						clearSetting.controlEl.appendChild(clearBtn);
					}
				}

		// ===== CalDAV 日历同步设置 =====
		this.createSettingGroup('日历同步(此功能尚未开发,请不要使用,防止数据丢失)', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// CalDAV 同步开关
			addSetting(setting =>
				setting.setName('启用日历同步')
					.setDesc('与 Google Calendar、Outlook、Apple Calendar 同步任务和事件')
					.addToggle(toggle => toggle
						.setValue(syncConfig.enabledSources?.caldav || false)
						.onChange(async (value: boolean) => {
							this.updateSyncConfig({
								enabledSources: { ...syncConfig.enabledSources, caldav: value }
							});
							await this.saveAndRefresh();
						}))
			);

			// 日历服务提供商选择
			const caldavProvider = syncConfig.caldav?.provider || 'google';
			addSetting(setting =>
				setting.setName('日历服务提供商')
					.setDesc('选择要同步的日历服务')
					.addDropdown(drop => drop
						.addOptions({
							'google': 'Google Calendar',
							'outlook': 'Outlook Calendar',
							'apple': 'Apple Calendar (iCloud)',
							'custom': '自定义 CalDAV'
						})
						.setValue(caldavProvider)
						.onChange(async (value: string) => {
							this.updateSyncConfig({
								caldav: { ...syncConfig.caldav, provider: value as 'google' | 'outlook' | 'apple' | 'custom' }
							});
							await this.saveAndRefresh();
							// 刷新整个设置面板以更新服务商配置
							this.refreshSettingsPanel();
						}))
			);

			// 服务商特定配置 - 直接渲染到 group 中
			if (caldavProvider === 'google') {
				this.renderGoogleSettings(group, syncConfig);
			} else if (caldavProvider === 'outlook') {
				this.renderOutlookSettings(group, syncConfig);
			} else if (caldavProvider === 'apple') {
				this.renderAppleSettings(group, syncConfig);
			} else if (caldavProvider === 'custom') {
				this.renderCustomCalDAVSettings(group, syncConfig);
			}

			// 测试 CalDAV 连接
			addSetting(setting =>
				setting.setName('测试日历连接')
					.setDesc('验证 CalDAV 配置是否正确')
					.addButton(button => button
						.setButtonText('测试连接')
						.onClick(async () => {
							await this.testCalDAVConnection();
						}))
			);
		});
	}

	/**
	 * 渲染 Google Calendar 配置
	 */
	private renderGoogleSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Client ID
		addSetting(setting =>
			setting.setName('客户端 ID')
				.setDesc('Google OAuth 2.0 客户端 ID（在 Google Cloud Console 创建）')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxx.apps.googleusercontent.com')
					.setValue(syncConfig.caldav?.clientId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientId: value }
						});
					}))
		);

		// Client Secret
		addSetting(setting =>
			setting.setName('客户端密钥')
				.setDesc('Google OAuth 2.0 客户端密钥')
				.addText(text => text
					.setPlaceholder('GOCSPX-xxxxxxxxxx')
					.setValue(syncConfig.caldav?.clientSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientSecret: value }
						});
					}))
		);

		// Access Token
		addSetting(setting =>
			setting.setName('访问令牌')
				.setDesc('OAuth 2.0 访问令牌')
				.addText(text => text
					.setPlaceholder('ya29.a0AfH6SMBx...')
					.setValue(syncConfig.caldav?.accessToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, accessToken: value }
						});
					}))
		);

		// Refresh Token
		addSetting(setting =>
			setting.setName('刷新令牌')
				.setDesc('用于自动刷新访问令牌')
				.addText(text => text
					.setPlaceholder('1//0gxxxxxxxxxx')
					.setValue(syncConfig.caldav?.refreshToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, refreshToken: value }
						});
					}))
		);

		// OAuth 授权按钮
		addSetting(setting =>
			setting.setName('获取授权')
				.setDesc('首次使用需要通过 Google OAuth 授权')
				.addButton(button => button
					.setButtonText('打开 Google 授权页面')
					.setClass('mod-cta')
					.onClick(() => {
						this.openGoogleOAuthPage();
					}))
		);
	}

	/**
	 * 渲染 Outlook Calendar 配置
	 */
	private renderOutlookSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Client ID
		addSetting(setting =>
			setting.setName('客户端 ID')
				.setDesc('Microsoft Azure 应用程序 ID')
				.addText(text => text
					.setPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
					.setValue(syncConfig.caldav?.clientId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientId: value }
						});
					}))
		);

		// Client Secret
		addSetting(setting =>
			setting.setName('客户端密钥')
				.setDesc('Microsoft Azure 应用程序密钥')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
					.setValue(syncConfig.caldav?.clientSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientSecret: value }
						});
					}))
		);

		// Access Token
		addSetting(setting =>
			setting.setName('访问令牌')
				.setDesc('Microsoft Graph API 访问令牌')
				.addText(text => text
					.setPlaceholder('EwBgA8l6BAAU...')
					.setValue(syncConfig.caldav?.accessToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, accessToken: value }
						});
					}))
		);

		// Refresh Token
		addSetting(setting =>
			setting.setName('刷新令牌')
				.setDesc('用于自动刷新访问令牌')
				.addText(text => text
					.setPlaceholder('M.R3_BAY...')
					.setValue(syncConfig.caldav?.refreshToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, refreshToken: value }
						});
					}))
		);

		// OAuth 授权按钮
		addSetting(setting =>
			setting.setName('获取授权')
				.setDesc('首次使用需要通过 Microsoft OAuth 授权')
				.addButton(button => button
					.setButtonText('打开 Microsoft 授权页面')
					.setClass('mod-cta')
					.onClick(() => {
						this.openMicrosoftOAuthPage();
					}))
		);
	}

	/**
	 * 渲染 Apple Calendar 配置
	 */
	private renderAppleSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Apple ID / 用户名
		addSetting(setting =>
			setting.setName('Apple ID')
				.setDesc('您的 Apple ID 邮箱')
				.addText(text => text
					.setPlaceholder('your-email@example.com')
					.setValue(syncConfig.caldav?.username || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, username: value }
						});
					}))
		);

		// 应用专用密码
		addSetting(setting =>
			setting.setName('应用专用密码')
				.setDesc('在 appleid.apple.com 生成的应用专用密码（非主密码）')
				.addText(text => text
					.setPlaceholder('xxxx-xxxx-xxxx-xxxx')
					.setValue(syncConfig.caldav?.password || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, password: value }
						});
					}))
		);

		// 帮助提示
		addSetting(setting =>
			setting.setName('如何获取应用专用密码')
				.setDesc('需要生成应用专用密码才能使用 Apple Calendar 同步')
				.addButton(button => button
					.setButtonText('查看帮助')
					.onClick(() => {
						this.showApplePasswordHelp();
					}))
		);
	}

	/**
	 * 渲染自定义 CalDAV 配置
	 */
	private renderCustomCalDAVSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// CalDAV URL
		addSetting(setting =>
			setting.setName('CalDAV 服务器 URL')
				.setDesc('CalDAV 服务器地址')
				.addText(text => text
					.setPlaceholder('https://caldav.example.com/')
					.setValue(syncConfig.caldav?.url || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, url: value }
						});
					}))
		);

		// 用户名
		addSetting(setting =>
			setting.setName('用户名')
				.setDesc('CalDAV 服务器用户名')
				.addText(text => text
					.setPlaceholder('username')
					.setValue(syncConfig.caldav?.username || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, username: value }
						});
					}))
		);

		// 密码
		addSetting(setting =>
			setting.setName('密码')
				.setDesc('CalDAV 服务器密码')
				.addText(text => text
					.setPlaceholder('password')
					.setValue(syncConfig.caldav?.password || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, password: value }
						});
					}))
		);
	}

	/**
	 * 显示 Apple 密码帮助
	 */
	private showApplePasswordHelp(): void {
		const helpText = `
如何获取 Apple 应用专用密码：

1. 访问 appleid.apple.com 并登录
2. 进入"安全"部分
3. 点击"生成密码"（在应用专用密码下）
4. 输入标签（例如：Obsidian Gantt Calendar）
5. 复制生成的密码并粘贴到上方

注意：您需要在 Apple ID 上启用双重认证才能生成应用专用密码。
		`;
		new Notice(helpText.replace(/\n/g, ' '), 15000);
	}

	/**
	 * 打开 Google OAuth 授权页面
	 */
	private openGoogleOAuthPage(): void {
		const clientId = this.plugin.settings.syncConfiguration?.caldav?.clientId || '';
		const redirectUri = encodeURIComponent('obsidian://callback');
		const scopes = [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events'
		].join(' ');

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
			`client_id=${encodeURIComponent(clientId)}` +
			`&redirect_uri=${redirectUri}` +
			`&response_type=code` +
			`&scope=${encodeURIComponent(scopes)}` +
			`&access_type=offline` +
			`&prompt=consent`;

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成授权');
	}

	/**
	 * 打开 Microsoft OAuth 授权页面
	 */
	private openMicrosoftOAuthPage(): void {
		const clientId = this.plugin.settings.syncConfiguration?.caldav?.clientId || '';
		const redirectUri = encodeURIComponent('obsidian://callback');
		const scopes = ['Calendars.ReadWrite', 'User.Read'].join(' ');

		const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
			`client_id=${encodeURIComponent(clientId)}` +
			`&redirect_uri=${redirectUri}` +
			`&response_type=code` +
			`&scope=${encodeURIComponent(scopes)}` +
			`&response_mode=query` +
			`&prompt=consent`;

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成授权');
	}

	/**
	 * 测试 CalDAV 连接
	 */
	private async testCalDAVConnection(): Promise<void> {
		new Notice('正在测试 CalDAV 连接...');

		try {
			const config = this.getSyncConfiguration();

			if (!config.enabledSources?.caldav) {
				new Notice('请先启用日历同步');
				return;
			}

			const provider = config.caldav?.provider;

			// 基本配置验证
			if (provider === 'apple' || provider === 'custom') {
				if (!config.caldav?.username || !config.caldav?.password) {
					new Notice('请先配置用户名和密码');
					return;
				}
			} else if (provider === 'google' || provider === 'outlook') {
				if (!config.caldav?.accessToken) {
					new Notice('请先配置访问令牌或完成 OAuth 授权');
					return;
				}
			}

			// 实际连接测试需要初始化相应的数据源
			new Notice(`${provider} 连接测试功能开发中...`);
		} catch (error) {
			new Notice(`连接测试失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 渲染飞书特定配置
	 */
	private renderFeishuSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// 检查连接状态
		const isConnected = !!(syncConfig.api?.accessToken);

		// ===== 连接状态 + 授权按钮 =====
		addSetting(setting =>
			setting.setName('飞书账号')
				.setDesc(isConnected ? `已连接` : '未连接')
				.addButton(button => button
					.setButtonText(isConnected ? '重新授权' : '连接飞书账号')
					.setClass('mod-cta')
					.onClick(() => {
						this.initiateFeishuOAuth(syncConfig);
					}))
		);

		// ===== Client ID (App ID) =====
		addSetting(setting =>
			setting.setName('App ID (Client ID)')
				.setDesc('飞书开放平台应用的 App ID')
				.addText(text => text
					.setPlaceholder('cli_xxxxxxxxxxxxx')
					.setValue(syncConfig.api?.clientId || syncConfig.api?.appId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, clientId: value, appId: value }
						});
						await this.saveAndRefresh();
					}))
		);

		// ===== Client Secret (App Secret) =====
		addSetting(setting =>
			setting.setName('App Secret (Client Secret)')
				.setDesc('飞书开放平台应用的 App Secret，用于刷新令牌')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxxxxxxxx')
					.setValue(syncConfig.api?.clientSecret || syncConfig.api?.appSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, clientSecret: value, appSecret: value }
						});
						await this.saveAndRefresh();
					}))
				// 设置为密码类型
				.then(setting => {
					const inputEl = setting.controlEl.querySelector('input');
					if (inputEl) {
						inputEl.type = 'password';
					}
				})
		);

		// ===== 重定向 URL =====
		addSetting(setting =>
			setting.setName('重定向 URL')
				.setDesc('OAuth 授权完成后的回调地址')
				.addText(text => text
					.setPlaceholder('https://open.feishu.cn/api-explorer/loading')
					.setValue(syncConfig.api?.redirectUri || FeishuOAuth.getDefaultRedirectUri())
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, redirectUri: value }
						});
						await this.saveAndRefresh();
					}))
		);

		// ===== 授权码输入框 =====
		addSetting(setting =>
			setting.setName('授权码')
				.setDesc('从浏览器回调URL中复制 code 参数值并粘贴，然后点击下方按钮获取令牌')
				.addText(text => text
					.setPlaceholder('粘贴授权码...')
					.onChange((value: string) => {
						// 保存授权码到临时变量，供按钮使用
						this.pendingAuthCode = value.trim();
					}))
				.addButton(button => button
					.setButtonText('获取令牌')
					.setClass('mod-cta')
					.onClick(async () => {
						if (!this.pendingAuthCode || this.pendingAuthCode.length < 10) {
							new Notice('请先输入有效的授权码');
							return;
						}
						await this.exchangeFeishuAuthCode(syncConfig, this.pendingAuthCode);
						// 清空输入框和临时变量
						this.pendingAuthCode = '';
						// 使用 setting.name 找到输入框（Setting 控件的名字属性）
						const nameEl = setting.nameEl;
						const inputEl = nameEl?.parentElement?.querySelector('input');
						if (inputEl) {
							inputEl.value = '';
						}
					})
		));

		// ===== Access Token 显示区域（已授权时显示）=====
		if (isConnected && syncConfig.api?.accessToken) {
			// 显示用户信息
			if (syncConfig.api?.userName || syncConfig.api?.userId) {
				addSetting(setting =>
					setting.setName('已授权用户')
						.setDesc(syncConfig.api.userName ? `${syncConfig.api.userName} (${syncConfig.api.userId || 'Unknown'})` : syncConfig.api.userId || 'Unknown')
						.addExtraButton(button => button
							.setIcon('user')
							.setTooltip('飞书用户')
						)
				);
			}

			// Access Token（部分隐藏）
			addSetting(setting =>
				setting.setName('Access Token')
					.setDesc('⚠️ 请注意保密，不要分享给他人')
					.addText(text => text
						.setValue(this.maskToken(syncConfig.api.accessToken))
						.setDisabled(true))
					.addExtraButton(button => button
						.setIcon('copy')
						.setTooltip('复制完整 Token')
						.onClick(() => {
							navigator.clipboard.writeText(syncConfig.api.accessToken);
							new Notice('已复制到剪贴板');
						})
					)
			);

			// ===== 令牌过期时间 =====
			if (syncConfig.api?.tokenExpireAt) {
				const expireTime = new Date(syncConfig.api.tokenExpireAt);
				const isExpired = Date.now() > syncConfig.api.tokenExpireAt;
				const remainingText = FeishuOAuth.formatExpireTime(syncConfig.api.tokenExpireAt);

				addSetting(setting =>
					setting.setName('令牌状态')
						.setDesc(isExpired ? '令牌已过期，请重新授权' : `过期时间: ${expireTime.toLocaleString()} (${remainingText})`)
						.addExtraButton(button => button
							.setIcon(isExpired ? 'alert-triangle' : 'check-circle')
							.setTooltip(isExpired ? '已过期' : '有效')
						)
						.addButton(btn => btn
							.setButtonText('刷新')
							.setTooltip(isExpired ? '重新授权' : '尝试刷新令牌')
							.onClick(() => isExpired ? this.initiateFeishuOAuth(syncConfig) : this.refreshFeishuToken(syncConfig))
						)
				);
			}
		}

		// ===== 取消授权按钮 =====
		if (isConnected) {
			addSetting(setting =>
				setting.setName('取消授权')
					.setDesc('清除已保存的飞书授权信息')
					.addButton(button => button
						.setButtonText('取消授权')
						.setWarning()
						.onClick(async () => {
							this.updateSyncConfig({
								api: {
									...syncConfig.api,
									accessToken: undefined,
									refreshToken: undefined,
									tokenExpireAt: undefined,
									userId: undefined,
									userName: undefined,
								}
							});
							await this.saveAndRefresh();
							this.refreshSettingsPanel();
							new Notice('已取消飞书授权');
						}))
			);
		}
	}

	/**
	 * 发起飞书 OAuth 授权
	 */
	private initiateFeishuOAuth(_syncConfig: any): void {
		// 重新获取最新配置（修复配置缓存问题）
		const currentSyncConfig = this.getSyncConfiguration();
		const apiConfig = currentSyncConfig.api;

		// 支持 clientId/appId 两种命名
		const clientId = apiConfig?.clientId || apiConfig?.appId;

		if (!clientId) {
			new Notice('请先配置 App ID');
			return;
		}

		const authUrl = FeishuOAuth.getAuthUrl({
			clientId: clientId,
			clientSecret: apiConfig?.clientSecret || apiConfig?.appSecret || '',
			redirectUri: apiConfig?.redirectUri || FeishuOAuth.getDefaultRedirectUri(),
		});

		// 打开浏览器进行授权
		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成飞书授权，然后从回调URL中复制授权码');
	}

	/**
	 * 交换飞书授权码
	 */
	private async exchangeFeishuAuthCode(_syncConfig: any, code: string): Promise<void> {
		try {
			new Notice('正在交换授权码...');

			// 重新获取最新配置（确保使用最新的 App ID 和 Secret）
			const currentSyncConfig = this.getSyncConfiguration();
			const apiConfig = currentSyncConfig.api;

			const clientId = apiConfig?.clientId || apiConfig?.appId || '';
			const clientSecret = apiConfig?.clientSecret || apiConfig?.appSecret || '';

			if (!clientId) {
				new Notice('请先配置 App ID 和 App Secret');
				return;
			}

			// 使用 FeishuOAuth 的统一方法进行授权码交换
			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tokenResponse = await FeishuOAuth.exchangeCodeForToken({
				clientId,
				clientSecret,
			}, code, requestFetch);

			// v2 API 响应直接包含 token 字段，无 data 包裹层
			if (!tokenResponse.access_token) {
				throw new Error('飞书 API 响应格式错误：缺少 access_token');
			}

			// 计算过期时间
			const expiresIn = tokenResponse.expires_in || 7200;
			const tokenExpireAt = Date.now() + expiresIn * 1000;

			// 更新配置（v2 API 不在响应中返回 user_id 和 name，需要单独获取）
			const updateData: any = {
				...apiConfig,
				accessToken: tokenResponse.access_token,
				refreshToken: tokenResponse.refresh_token,
				tokenExpireAt: tokenExpireAt,
			};

			// 自动获取用户信息
			try {
				const userInfo = await FeishuUserApi.getUserInfo(tokenResponse.access_token, requestFetch);
				if (userInfo) {
					updateData.userId = userInfo.userId;
					updateData.userOpenId = userInfo.openId;
					updateData.userName = userInfo.name;
				}
			} catch (e) {
				Logger.warn('SyncSettingsBuilder', '获取用户信息失败（非致命）', e);
			}

			this.updateSyncConfig({ api: updateData });

			await this.saveAndRefresh();
			new Notice('飞书授权成功！');
			// 重新渲染设置界面以显示 token
			this.refreshSettingsPanel();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error('SyncSettingsBuilder', 'Authorization failed', error);
			new Notice(`授权失败: ${errorMsg}`);
		}
	}

	/**
	 * 刷新飞书令牌
	 */
	private async refreshFeishuToken(_syncConfig: any): Promise<void> {
		try {
			new Notice('正在刷新令牌...');

			// 重新获取最新配置
			const currentSyncConfig = this.getSyncConfiguration();
			const apiConfig = currentSyncConfig.api;

			const clientId = apiConfig?.clientId || apiConfig?.appId || '';
			const clientSecret = apiConfig?.clientSecret || apiConfig?.appSecret || '';
			const refreshToken = apiConfig?.refreshToken;

			if (!clientId) {
				new Notice('请先配置 App ID');
				return;
			}

			if (!refreshToken) {
				new Notice('没有可用的刷新令牌，请重新授权');
				return;
			}

			// 使用 FeishuOAuth 的统一方法进行令牌刷新
			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tokenResponse = await FeishuOAuth.refreshAccessToken({
				clientId,
				clientSecret,
				refreshToken,
			}, requestFetch);

			// v2 API 响应直接包含 token 字段，无 data 包裹层
			if (!tokenResponse.access_token) {
				throw new Error('飞书 API 响应格式错误：缺少 access_token');
			}

			// 计算过期时间
			const expiresIn = tokenResponse.expires_in || 7200;
			const tokenExpireAt = Date.now() + expiresIn * 1000;

			// 更新配置
			this.updateSyncConfig({
				api: {
					...apiConfig,
					accessToken: tokenResponse.access_token,
					refreshToken: tokenResponse.refresh_token || refreshToken,
					tokenExpireAt: tokenExpireAt,
				}
			});

			await this.saveAndRefresh();
			new Notice('令牌刷新成功！');
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`刷新失败: ${errorMsg}，请重新授权`);
		}
	}

	/**
	 * 隐藏 Token 的部分内容
	 * @param token 原始 token
	 * @returns 隐藏后的 token（只显示前8位和后4位）
	 */
	private maskToken(token: string): string {
		if (!token || token.length < 20) {
			return token;
		}
		const prefix = token.substring(0, 8);
		const suffix = token.substring(token.length - 4);
		const maskedLength = Math.min(token.length - 12, 20);
		return `${prefix}${'*'.repeat(maskedLength)}${suffix}`;
	}

	/**
	 * 渲染 Microsoft To Do 特定配置
	 */
	private renderMicrosoftTodoSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Access Token
		addSetting(setting =>
			setting.setName('访问令牌')
				.setDesc('Microsoft Graph API 访问令牌（通过 OAuth 获取）')
				.addText(text => text
					.setPlaceholder('EwBgA8l6BAAU...')
					.setValue(syncConfig.api?.accessToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, accessToken: value }
						});
					}))
		);

		// Refresh Token (可选)
		addSetting(setting =>
			setting.setName('刷新令牌 (可选)')
				.setDesc('用于自动刷新访问令牌')
				.addText(text => text
					.setPlaceholder('M.R3_BAY...')
					.setValue(syncConfig.api?.refreshToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, refreshToken: value }
						});
					}))
		);

		// OAuth 授权提示
		addSetting(setting =>
			setting.setName('获取授权')
				.setDesc('首次使用需要通过 OAuth 授权，点击下方按钮开始')
				.addButton(button => button
					.setButtonText('打开授权页面')
					.setWarning()
					.onClick(() => {
						this.openOAuthPage();
					}))
		);
	}

	/**
	 * 获取同步配置
	 */
	private getSyncConfiguration(): any {
		if (!this.plugin.settings.syncConfiguration) {
			this.plugin.settings.syncConfiguration = {
				enabledSources: {},
				syncDirection: 'bidirectional',
				syncInterval: 30,
				conflictResolution: 'local-win',
				feishuSyncTargetFile: 'gantt-calendar-feishu-sync.md',
			};
		}
		return this.plugin.settings.syncConfiguration;
	}

	/**
	 * 更新同步配置
	 */
	private updateSyncConfig(updates: any): void {
		const currentConfig = this.getSyncConfiguration();

		// 打印调试信息
		if (updates.api) {
			Logger.debug('SyncSettingsBuilder', 'updateSyncConfig', {
				currentApi: currentConfig.api,
				updatesApi: updates.api,
			});
		}

		this.plugin.settings.syncConfiguration = {
			...currentConfig,
			...updates,
			enabledSources: {
				...currentConfig.enabledSources,
				...(updates.enabledSources || {}),
			},
			api: updates.api !== undefined ? {
				...currentConfig.api,
				...updates.api,
			} : currentConfig.api,
			caldav: updates.caldav !== undefined ? {
				...currentConfig.caldav,
				...updates.caldav,
			} : currentConfig.caldav,
		};

		// 打印合并后的结果
		if (updates.api) {
			Logger.debug('SyncSettingsBuilder', 'Merged syncConfiguration.api', this.plugin.settings.syncConfiguration?.api ?? 'undefined');
		}
	}

	/**
	 * 手动同步
	 */
	private async runManualSync(): Promise<void> {
		try {
			const syncConfig = this.getSyncConfiguration();
			const apiConfig = syncConfig.api;

			if (!apiConfig?.accessToken) {
				new Notice('请先在设置中完成飞书授权');
				return;
			}

			const clientId = apiConfig.clientId || apiConfig.appId;
			const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

			if (!clientId || !clientSecret) {
				new Notice('请先配置飞书 App ID 和 App Secret');
				return;
			}

			new Notice('正在同步飞书任务...');

			const provider = new FeishuProvider({
				enabled: true,
				syncDirection: syncConfig.syncDirection,
				autoSync: false,
				syncInterval: 0,
				conflictResolution: syncConfig.conflictResolution,
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

			const stateManager = new SyncStateManager(this.plugin.app);
			const syncEngine = new FeishuTaskSync(this.plugin.app, provider, stateManager, {
				conflictStrategy: syncConfig.conflictResolution as 'newest-win' | 'local-win' | 'remote-win' || 'newest-win',
				targetFile: syncConfig.feishuSyncTargetFile || 'gantt-calendar-feishu-sync.md',
				enabledFormats: (this.plugin.settings.enabledTaskFormats as ('tasks' | 'dataview')[]) || ['tasks', 'dataview'],
				globalFilter: this.plugin.settings.globalTaskFilter,
			});

			const result = await syncEngine.sync();

			const parts: string[] = [];
			if (result.pushed > 0) parts.push('推送 ' + result.pushed + ' 个');
			if (result.pulled > 0) parts.push('拉取 ' + result.pulled + ' 个');
			if (result.conflicted > 0) parts.push('冲突 ' + result.conflicted + ' 个');
			if (result.skipped > 0) parts.push('跳过 ' + result.skipped + ' 个');
			const summary = parts.length > 0 ? parts.join('，') : '无变更';

			if (result.errors.length > 0) {
				new Notice('同步完成: ' + summary + '，' + result.errors.length + ' 个错误', 8000);
			} else {
				new Notice('同步完成: ' + summary);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice('同步出错: ' + errorMsg);
		}
	}

	/**
	 * 测试连接
	 */
	private async testConnection(): Promise<void> {
		new Notice('正在测试飞书连接...');

		try {
			const config = this.getSyncConfiguration();

			if (!config.enabledSources?.api) {
				new Notice('请先启用同步功能');
				return;
			}

			const provider = config.api?.provider;

			if (provider === 'feishu') {
				await this.testFeishuConnection();
			} else if (provider === 'microsoft-todo') {
				new Notice('Microsoft To Do 连接测试功能开发中...');
			}
		} catch (error) {
			new Notice(`连接测试失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 测试飞书连接
	 */
	private async testFeishuConnection(): Promise<void> {
		const config = this.getSyncConfiguration();
		const accessToken = config.api?.accessToken;

		// 检查是否已授权
		if (!accessToken) {
			new Notice('请先完成飞书授权');
			return;
		}

		try {
			// 使用 FeishuOAuth 的统一方法创建 request fetch
			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);

			// 调用飞书 API 获取用户信息
			const userInfo = await FeishuUserApi.getUserInfo(accessToken, requestFetch);

			// 显示成功信息
			new Notice(`✅ 飞书连接成功！用户: ${userInfo.name} (${userInfo.userId})`);

			// 打印详细信息到控制台
			Logger.info('SyncSettingsBuilder', 'Feishu connection test successful', {
				userId: userInfo.userId,
				name: userInfo.name,
				enName: userInfo.enName,
				email: userInfo.email,
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			// 区分错误类型
			if (errorMsg.includes('401') || errorMsg.includes('403')) {
				new Notice('❌ 认证失败：Access Token 无效或已过期，请重新授权');
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				new Notice('❌ 网络错误：请检查网络连接');
			} else {
				new Notice(`❌ 连接失败: ${errorMsg}`);
			}

			Logger.error('SyncSettingsBuilder', 'Feishu connection test failed', error);
		}
	}

	/**
	 * 获取飞书日历列表
	 */
	private async fetchFeishuCalendarList(): Promise<void> {
		new Notice('正在获取飞书日历列表...');

		try {
			const config = this.getSyncConfiguration();
			const accessToken = config.api?.accessToken;

			// 检查是否已授权
			if (!accessToken) {
				new Notice('请先完成飞书授权');
				return;
			}

			// 使用 FeishuOAuth 的统一方法创建 request fetch
			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);

			// 调用飞书 API 获取日历列表
			const calendarList = await FeishuCalendarApi.getCalendarList(accessToken, requestFetch);

			// 保存日历列表到配置
			this.updateSyncConfig({
				api: {
					...config.api,
					calendarList: calendarList,
					calendarListFetchedAt: Date.now(),
				}
			});
			await this.saveAndRefresh();
			// 刷新设置面板以显示日历列表
			this.refreshSettingsPanel();

			// 显示成功信息
			new Notice(`✅ 成功获取 ${calendarList.length} 个日历`);

			// 打印详细信息到控制台
			Logger.debug('SyncSettingsBuilder', 'Feishu calendar list details',
				calendarList.map((cal, index) => {
					const isPrimary = cal.type === 'primary';
					return {
						index: index + 1,
						summary: cal.summary + (isPrimary ? ' (主日历)' : ''),
						id: cal.calendar_id,
						type: cal.type || 'unknown',
						alias: cal.summary_alias,
						description: cal.description,
						permissions: cal.permissions,
						role: cal.role,
						color: cal.color,
						timezone: cal.timezone,
					};
				})
			);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			// 区分错误类型
			if (errorMsg.includes('401') || errorMsg.includes('403')) {
				new Notice('❌ 认证失败：Access Token 无效或已过期，请重新授权');
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				new Notice('❌ 网络错误：请检查网络连接');
			} else {
				new Notice(`❌ 获取日历列表失败: ${errorMsg}`);
			}

			Logger.error('SyncSettingsBuilder', 'Failed to fetch Feishu calendar list', error);
		}
	}

	/**
	 * 获取飞书任务清单列表
	 */
	private async fetchFeishuTaskLists(): Promise<void> {
		new Notice('正在获取飞书任务清单...');

		try {
			const config = this.getSyncConfiguration();
			const accessToken = config.api?.accessToken;

			// 检查是否已授权
			if (!accessToken) {
				new Notice('请先完成飞书授权');
				return;
			}

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const taskLists = await FeishuTaskApi.getAllTaskLists(accessToken, requestFetch);

			// 保存到配置
			this.updateSyncConfig({
				api: {
					...config.api,
					taskLists: taskLists,
					taskListsFetchedAt: Date.now(),
				}
			});
			await this.saveAndRefresh();
			this.refreshSettingsPanel();

			if (taskLists.length === 0) {
    new Notice('未找到任务清单，请先在飞书中创建至少一个任务清单，然后重新获取');
} else {
    new Notice('✅ 成功获取 ' + taskLists.length + ' 个任务清单');
}

			Logger.debug('SyncSettingsBuilder', 'Feishu task lists',
				taskLists.map((tl, index) => ({
					index: index + 1,
					name: tl.name,
					guid: tl.guid,
					creator: tl.creator?.id,
					memberCount: tl.members?.length || 0,
				}))
			);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			if (errorMsg.includes('401') || errorMsg.includes('403')) {
				new Notice('❌ 认证失败：Access Token 无效或已过期，请重新授权');
			} else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
				new Notice('❌ 网络错误：请检查网络连接');
			} else {
				new Notice('❌ 获取任务清单失败: ' + errorMsg);
			}

			Logger.error('SyncSettingsBuilder', 'Failed to fetch Feishu task lists', error);
		}
	}

	/**
	 * 测试同步：向指定清单推送 10 个测试任务
	 */
	/**
	 * 测试同步：向指定清单推送 10 个测试任务
	 */
	private async testSyncToTasklist(tasklistGuid: string, tasklistName: string): Promise<void> {
		const syncConfig = this.getSyncConfiguration();
		const apiConfig = syncConfig?.api;

		if (!apiConfig?.accessToken) {
			new Notice("请先完成飞书授权");
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice("请先配置飞书 App ID 和 App Secret");
			return;
		}

		const confirmed = confirm(
			"将向清单「" + tasklistName + "」中创建 10 个测试任务，\n" +
			"用于验证同步功能是否正常。\n\n确定继续？"
		);
		if (!confirmed) return;

		try {
			const provider = new FeishuProvider({
				enabled: true,
				syncDirection: "export-only",
				autoSync: false,
				syncInterval: 0,
				conflictResolution: "local-win",
				api: {
					provider: "feishu",
					accessToken: apiConfig.accessToken,
					refreshToken: apiConfig.refreshToken,
					tokenExpireAt: apiConfig.tokenExpireAt,
					clientId,
					clientSecret,
					redirectUri: apiConfig.redirectUri,
				},
			});

			new Notice("正在向「" + tasklistName + "」创建测试任务...", 5000);

			let created = 0;
			let failed = 0;
			const now = Date.now();

			for (let i = 1; i <= 10; i++) {
				try {
					const payload: any = {
						summary: "测试任务 " + i + "/10 - " + new Date().toLocaleString("zh-CN"),
						description: "由 Gantt Calendar 插件创建的同步测试任务，可安全删除。",
						due: { timestamp: String(now + i * 24 * 60 * 60 * 1000) },
						priority: i <= 3 ? "high" : "normal",
						completed: false,
					};

					if (apiConfig.userOpenId) {
						payload.assignee = { id: apiConfig.userOpenId, type: "open_id" };
					}

					await provider.createFeishuTask(payload, tasklistGuid);
					created++;

					if (i % 3 === 0) {
						new Notice("已创建 " + created + "/10 个测试任务...");
					}
				} catch (err) {
					failed++;
					Logger.warn("SyncSettingsBuilder", "Test task failed: " + i, err);
				}
			}

			const msg = "测试同步完成: 成功 " + created + " 个" +
				(failed > 0 ? "，失败 " + failed + " 个" : "") +
				"\n清单: " + tasklistName;
			new Notice(msg, 8000);
			Logger.info("SyncSettingsBuilder", "Test sync result", { tasklistGuid, created, failed });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error("SyncSettingsBuilder", "Test sync failed", error);
			new Notice("测试同步失败: " + errorMsg);
		}
	}

	private async clearFeishuTasklistTasks(tasklistGuid: string, tasklistName: string): Promise<void> {
		const syncConfig = this.getSyncConfiguration();
		const apiConfig = syncConfig?.api;

		if (!apiConfig?.accessToken) {
			new Notice("请先完成飞书授权");
			return;
		}

		const clientId = apiConfig.clientId || apiConfig.appId;
		const clientSecret = apiConfig.clientSecret || apiConfig.appSecret;

		if (!clientId || !clientSecret) {
			new Notice("请先配置飞书 App ID 和 App Secret");
			return;
		}

		try {
			new Notice("正在获取清单「" + tasklistName + "」中的任务...");

			const requestFetch = FeishuHttpClient.createRequestFetch(requestUrl);
			const tasks = await FeishuTaskApi.getTasksByTaskList(
				apiConfig.accessToken,
				tasklistGuid,
				tasklistName,
				requestFetch
			);

			if (tasks.length === 0) {
				new Notice("清单「" + tasklistName + "」中没有任务");
				return;
			}

			new Notice("找到 " + tasks.length + " 个任务，正在删除...");

			const provider = new FeishuProvider({
				enabled: true,
				syncDirection: "export-only",
				autoSync: false,
				syncInterval: 0,
				conflictResolution: "local-win",
				api: {
					provider: "feishu",
					accessToken: apiConfig.accessToken,
					refreshToken: apiConfig.refreshToken,
					tokenExpireAt: apiConfig.tokenExpireAt,
					clientId,
					clientSecret,
					redirectUri: apiConfig.redirectUri,
				},
			});

			let deleted = 0;
			let failed = 0;

			for (const task of tasks) {
				try {
					await provider.deleteFeishuTask(task.task_guid);
					deleted++;
					if (deleted % 10 === 0) {
						new Notice("已删除 " + deleted + "/" + tasks.length + " 个任务...");
					}
				} catch (err) {
					failed++;
					Logger.warn("SyncSettingsBuilder", "Failed to delete task: " + task.task_guid, err);
				}
			}

			const msg = "清除完成: 删除 " + deleted + " 个" + (failed > 0 ? "，失败 " + failed + " 个" : "");
			new Notice(msg, 8000);
			Logger.info("SyncSettingsBuilder", "Clear tasklist result:", { deleted, failed });
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			Logger.error("SyncSettingsBuilder", "Failed to clear tasklist tasks", error);
			new Notice("清除任务失败: " + errorMsg);
		}
	}

		/**
	 * 打开 OAuth 授权页面
	 */
	private openOAuthPage(): void {
		// Microsoft To Do OAuth URL
		const clientId = 'YOUR_CLIENT_ID'; // 需要替换为实际的 Client ID
		const redirectUri = encodeURIComponent('obsidian://callback');
		const scopes = ['Tasks.ReadWrite', 'User.Read'].join(' ');
		const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}`;

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成授权，然后将访问令牌粘贴回设置页面');
	}
}
