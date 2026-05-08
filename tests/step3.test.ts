/**
 * Step3: 格式检测 — 单元测试
 * 对应测试用例: TP-16 ~ TP-18
 */

import {
	detectFormat,
	detectFormatDetailed,
	hasTasksFormat,
	hasDataviewFormat,
	isMixedFormat,
} from '../src/tasks/taskParser/step3';
import type { TaskFormatType } from '../src/tasks/taskSerializerSymbols';

const ALL_FORMATS: TaskFormatType[] = ['tasks', 'dataview'];
const TASKS_ONLY: TaskFormatType[] = ['tasks'];
const DV_ONLY: TaskFormatType[] = ['dataview'];

describe('Step3: 格式检测', () => {
	describe('detectFormat', () => {
		it('TP-16: 检测 Tasks 格式', () => {
			expect(detectFormat('任务 ⏳ 2024-01-15 🔼', ALL_FORMATS)).toBe('tasks');
		});

		it('TP-17: 检测 Dataview 格式', () => {
			expect(detectFormat('任务 [due:: 2024-01-15]', ALL_FORMATS)).toBe('dataview');
		});

		it('TP-18: 检测混合格式', () => {
			expect(detectFormat('任务 ⏳ 2024-01-15 [priority:: high]', ALL_FORMATS)).toBe('mixed');
		});

		it('TP-16a: 无格式标记时返回 undefined', () => {
			expect(detectFormat('普通任务', ALL_FORMATS)).toBeUndefined();
		});

		it('TP-17a: 仅启用 Tasks 时 Dataview 不识别', () => {
			expect(detectFormat('任务 [priority:: high]', TASKS_ONLY)).toBeUndefined();
		});

		it('TP-16b: 仅启用 Dataview 时 Tasks 不识别', () => {
			expect(detectFormat('任务 ⏫', DV_ONLY)).toBeUndefined();
		});

		it('TP-16c: 空内容返回 undefined', () => {
			expect(detectFormat('', ALL_FORMATS)).toBeUndefined();
		});

		it('TP-16d: 优先级 emoji 识别为 Tasks', () => {
			expect(detectFormat('任务 ⏫', ALL_FORMATS)).toBe('tasks');
		});

		it('TP-16e: 日期 emoji 识别为 Tasks', () => {
			expect(detectFormat('任务 📅 2024-01-15', ALL_FORMATS)).toBe('tasks');
		});
	});

	describe('detectFormatDetailed', () => {
		it('TP-16f: Tasks 格式详细结果', () => {
			const result = detectFormatDetailed('任务 ⏫ 📅 2024-01-15', ALL_FORMATS);
			expect(result.format).toBe('tasks');
			expect(result.isMixed).toBe(false);
			expect(result.hasTasksFormat).toBe(true);
			expect(result.hasDataviewFormat).toBe(false);
		});

		it('TP-17b: Dataview 格式详细结果', () => {
			const result = detectFormatDetailed('任务 [priority:: high] [due:: 2024-01-15]', ALL_FORMATS);
			expect(result.format).toBe('dataview');
			expect(result.isMixed).toBe(false);
			expect(result.hasTasksFormat).toBe(false);
			expect(result.hasDataviewFormat).toBe(true);
		});

		it('TP-18a: 混合格式详细结果', () => {
			const result = detectFormatDetailed('任务 ⏫ [due:: 2024-01-15]', ALL_FORMATS);
			expect(result.format).toBe('tasks'); // 混合时默认 tasks
			expect(result.isMixed).toBe(true);
			expect(result.hasTasksFormat).toBe(true);
			expect(result.hasDataviewFormat).toBe(true);
		});

		it('TP-16g: 无格式标记', () => {
			const result = detectFormatDetailed('普通任务', ALL_FORMATS);
			expect(result.format).toBeUndefined();
			expect(result.isMixed).toBe(false);
			expect(result.hasTasksFormat).toBe(false);
			expect(result.hasDataviewFormat).toBe(false);
		});
	});

	describe('hasTasksFormat', () => {
		it('TP-16h: 含优先级 emoji', () => {
			expect(hasTasksFormat('任务 ⏫')).toBe(true);
		});

		it('TP-16i: 含日期 emoji', () => {
			expect(hasTasksFormat('任务 📅 2024-01-15')).toBe(true);
		});

		it('TP-17c: 纯 Dataview 格式返回 false', () => {
			expect(hasTasksFormat('任务 [priority::]')).toBe(false);
		});
	});

	describe('hasDataviewFormat', () => {
		it('TP-17d: 含 Dataview 字段', () => {
			expect(hasDataviewFormat('任务 [priority:: high]')).toBe(true);
		});

		it('TP-16j: 纯 Tasks 格式返回 false', () => {
			expect(hasDataviewFormat('任务 📅 2024-01-15')).toBe(false);
		});
	});

	describe('isMixedFormat', () => {
		it('TP-18b: 两种格式共存', () => {
			expect(isMixedFormat('任务 ⏫ [due:: 2024-01-15]')).toBe(true);
		});

		it('TP-18c: 仅 Tasks 不算混合', () => {
			expect(isMixedFormat('任务 ⏫ 📅 2024-01-15')).toBe(false);
		});

		it('TP-18d: 仅 Dataview 不算混合', () => {
			expect(isMixedFormat('任务 [priority:: high]')).toBe(false);
		});
	});
});
