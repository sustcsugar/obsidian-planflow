import { App, Modal } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import { MacaronColorPicker } from '../components';
import { SettingsStatusModalClasses } from '../../utils/bem';
import { TaskStatus, validateStatusSymbol } from '../../tasks/taskStatus';

/**
 * 添加自定义状态模态框
 * 支持设置亮色和暗色主题的颜色
 */
export class AddCustomStatusModal extends Modal {
	private plugin: GanttCalendarPlugin;
	private nameInput: HTMLInputElement;
	private keyInput: HTMLInputElement;
	private symbolInput: HTMLInputElement;
	private descInput: HTMLTextAreaElement;

	private lightBgColorInput: HTMLInputElement;
	private lightTextColorInput: HTMLInputElement;
	private lightBgSwatch?: HTMLElement;
	private lightTextSwatch?: HTMLElement;

	private darkBgColorInput: HTMLInputElement;
	private darkTextColorInput: HTMLInputElement;
	private darkBgSwatch?: HTMLElement;
	private darkTextSwatch?: HTMLElement;

	private nameError?: HTMLElement;
	private symbolError: HTMLElement;
	private onStatusAdded?: () => void;

	constructor(app: App, plugin: GanttCalendarPlugin, onStatusAdded?: () => void) {
		super(app);
		this.plugin = plugin;
		this.onStatusAdded = onStatusAdded;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const cls = SettingsStatusModalClasses.elements;

		contentEl.createEl('h2', { text: '添加自定义状态', cls: cls.title });

		// 状态名称
		const nameField = contentEl.createDiv(cls.field);
		nameField.createEl('label', { text: '状态名称', cls: cls.label });
		this.nameInput = nameField.createEl('input', {
			type: 'text',
			placeholder: '例如：等待审核',
			cls: cls.input,
		});

		// 状态 Key
		const keyField = contentEl.createDiv(cls.field);
		keyField.createEl('label', { text: '状态标识（英文）', cls: cls.label });
		this.keyInput = keyField.createEl('input', {
			type: 'text',
			placeholder: '例如：pending_review',
			cls: cls.input,
		});

		// 状态符号
		const symbolField = contentEl.createDiv(cls.field);
		symbolField.createEl('label', { text: '复选框符号（单个字符）', cls: cls.label });
		symbolField.createDiv(cls.hint)
			.setText('只能使用字母或数字，不能使用默认状态的符号（空格, x, !, -, /, ?, n）');
		this.symbolInput = symbolField.createEl('input', {
			type: 'text',
			placeholder: '例如：p',
			cls: cls.input,
		});
		this.symbolInput.maxLength = 1;
		this.symbolError = symbolField.createDiv(cls.error);

		// 状态描述
		const descField = contentEl.createDiv(cls.field);
		descField.createEl('label', { text: '状态描述', cls: cls.label });
		this.descInput = descField.createEl('textarea', {
			placeholder: '描述此状态的用途',
			cls: cls.textarea,
		});
		this.descInput.rows = 2;

		// 亮色主题
		this.renderThemeSection(contentEl, 'light');
		// 暗色主题
		this.renderThemeSection(contentEl, 'dark');

		// 马卡龙配色（仅用于亮色背景）
		const macaronField = contentEl.createDiv(cls.field);
		macaronField.createEl('label', { text: '快速选择亮色背景颜色', cls: cls.label });
		const macaronContainer = macaronField.createDiv();
		new MacaronColorPicker({
			container: macaronContainer,
			currentColor: this.lightBgColorInput.value,
			onColorChange: (color) => {
				this.lightBgColorInput.value = color;
				if (this.lightBgSwatch) {
					this.lightBgSwatch.style.backgroundColor = color;
				}
			},
		}).render();

		// 按钮容器
		const footer = contentEl.createDiv(cls.footer);
		const cancelBtn = footer.createEl('button', { text: '取消', cls: cls.btn });
		cancelBtn.addEventListener('click', () => this.close());

		const addBtn = footer.createEl('button', {
			text: '添加',
			cls: `${cls.btn} ${SettingsStatusModalClasses.modifiers.btnPrimary}`,
		});
		addBtn.addEventListener('click', () => this.addCustomStatus());
	}

	private renderThemeSection(
		parent: HTMLElement,
		theme: 'light' | 'dark'
	): void {
		const cls = SettingsStatusModalClasses.elements;
		const section = parent.createDiv(cls.themeSection);

		const header = section.createDiv(cls.themeHeader);
		header.setText(theme === 'light' ? '☀️ 亮色' : '🌙 暗色');

		const colorRow = section.createDiv(cls.colorRow);

		const defaultBg = theme === 'dark' ? '#2d333b' : '#FFFFFF';
		const defaultText = theme === 'dark' ? '#adbac7' : '#333333';

		const bgInput = this.createColorField(colorRow, '背景', defaultBg);
		const textInput = this.createColorField(colorRow, '文字', defaultText);

		if (theme === 'light') {
			this.lightBgColorInput = bgInput.input;
			this.lightBgSwatch = bgInput.swatch;
			this.lightTextColorInput = textInput.input;
			this.lightTextSwatch = textInput.swatch;
		} else {
			this.darkBgColorInput = bgInput.input;
			this.darkBgSwatch = bgInput.swatch;
			this.darkTextColorInput = textInput.input;
			this.darkTextSwatch = textInput.swatch;
		}
	}

	private createColorField(
		parent: HTMLElement,
		label: string,
		defaultColor: string
	): { input: HTMLInputElement; swatch: HTMLElement } {
		const cls = SettingsStatusModalClasses.elements;
		const field = parent.createDiv(cls.colorField);
		field.createEl('span', { text: label, cls: cls.colorLabel });

		const wrapper = field.createDiv(cls.swatchWrapper);
		const input = wrapper.createEl('input', {
			type: 'color',
			cls: cls.hiddenInput,
		}) as HTMLInputElement;
		input.value = defaultColor;

		const swatch = wrapper.createDiv(cls.swatch);
		swatch.style.backgroundColor = defaultColor;

		swatch.addEventListener('click', () => input.click());
		input.addEventListener('input', () => {
			swatch.style.backgroundColor = input.value;
		});

		return { input, swatch };
	}

	private addCustomStatus() {
		const name = this.nameInput.value.trim();
		const key = this.keyInput.value.trim();
		const symbol = this.symbolInput.value.trim();
		const description = this.descInput.value.trim();

		if (!name) {
			this.showFieldError(this.nameInput, '请输入状态名称');
			return;
		}

		if (!key) {
			this.showFieldError(this.keyInput, '请输入状态标识');
			return;
		}

		if (!symbol) {
			this.symbolError.textContent = '请输入复选框符号';
			return;
		}

		const validation = validateStatusSymbol(symbol, true);
		if (!validation.valid) {
			this.symbolError.textContent = validation.error || '符号无效';
			return;
		}

		if (this.plugin.settings.taskStatuses.some((s: TaskStatus) => s.key === key)) {
			this.showFieldError(this.keyInput, '状态标识已存在');
			return;
		}

		const newStatus: TaskStatus = {
			key,
			symbol,
			name,
			description: description || '自定义状态',
			lightColors: {
				backgroundColor: this.lightBgColorInput.value,
				textColor: this.lightTextColorInput.value,
			},
			darkColors: {
				backgroundColor: this.darkBgColorInput.value,
				textColor: this.darkTextColorInput.value,
			},
			isDefault: false,
		};

		this.plugin.settings.taskStatuses.push(newStatus);
		this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
		this.close();

		if (this.onStatusAdded) {
			this.onStatusAdded();
		}
	}

	private showFieldError(inputEl: HTMLInputElement, message: string): void {
		const cls = SettingsStatusModalClasses.elements;
		const field = inputEl.closest(`.${cls.field}`) as HTMLElement;
		if (!field) return;
		const existing = field.querySelector(`.${cls.error}`);
		if (existing) existing.remove();
		field.createDiv(cls.error).setText(message);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
