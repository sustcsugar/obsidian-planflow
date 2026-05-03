import { SettingsStatusCardClasses } from '../../utils/bem';
import { rgbToHex } from '../utils/color';
import { MACARON_COLORS } from '../../tasks/taskStatus';

export interface MacaronColorPickerConfig {
	container: HTMLElement;
	currentColor: string;
	onColorChange: (color: string) => Promise<void> | void;
	colors?: string[];
	limit?: number;
	rows?: number;
	columns?: number;
}

export class MacaronColorPicker {
	private config: MacaronColorPickerConfig;

	constructor(config: MacaronColorPickerConfig) {
		this.config = config;
	}

	render(): void {
		const cls = SettingsStatusCardClasses.elements;
		const grid = this.config.container.createDiv(cls.macaron);

		const sourceColors = this.config.colors || MACARON_COLORS;
		const colors = this.config.limit
			? sourceColors.slice(0, this.config.limit)
			: sourceColors;

		const rows = this.config.rows || 1;
		const columns = this.config.columns || Math.ceil(colors.length / rows);

		grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

		colors.forEach(color => {
			const swatch = grid.createDiv(cls.macaronSwatch);
			swatch.style.backgroundColor = color;
			if (color === this.config.currentColor) {
				swatch.style.outline = `2px solid var(--interactive-accent)`;
				swatch.style.outlineOffset = '1px';
			}
			swatch.addEventListener('click', async () => {
				await this.config.onColorChange(color);
				this.updateDisplay(color);
			});
		});
	}

	private updateDisplay(selectedColor: string): void {
		const swatches = this.config.container.querySelectorAll(`.${SettingsStatusCardClasses.elements.macaronSwatch}`);
		swatches.forEach(swatch => {
			const bgColor = (swatch as HTMLElement).style.backgroundColor;
			const isSelected = bgColor === selectedColor || rgbToHex(bgColor) === selectedColor;

			if (isSelected) {
				(swatch as HTMLElement).style.outline = '2px solid var(--interactive-accent)';
				(swatch as HTMLElement).style.outlineOffset = '1px';
			} else {
				(swatch as HTMLElement).style.outline = 'none';
			}
		});
	}
}
