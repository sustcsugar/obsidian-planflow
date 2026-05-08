/**
 * Step2: 全局过滤器 — 单元测试
 * 对应测试用例: TP-13 ~ TP-15
 */

import { passesGlobalFilter, removeGlobalFilter, applyFilter, filterTasks } from '../src/tasks/taskParser/step2';

describe('Step2: 全局过滤器', () => {
	describe('passesGlobalFilter', () => {
		it('TP-13: 内容以过滤器开头 → 通过', () => {
			expect(passesGlobalFilter('🎯 任务', '🎯')).toBe(true);
		});

		it('TP-13: 内容以过滤器+空格开头 → 通过', () => {
			expect(passesGlobalFilter('🎯 任务', '🎯 ')).toBe(true);
		});

		it('TP-14: 内容不以过滤器开头 → 不通过', () => {
			expect(passesGlobalFilter('普通任务', '🎯')).toBe(false);
		});

		it('TP-15: 未设置过滤器 → 全部通过', () => {
			expect(passesGlobalFilter('任何任务')).toBe(true);
			expect(passesGlobalFilter('任何任务', undefined)).toBe(true);
			expect(passesGlobalFilter('任何任务', '')).toBe(true);
		});

		it('TP-13a: 内容有前导空格仍能匹配', () => {
			expect(passesGlobalFilter('  🎯 任务', '🎯')).toBe(true);
		});
	});

	describe('removeGlobalFilter', () => {
		it('TP-13b: 正确移除过滤器前缀', () => {
			expect(removeGlobalFilter('🎯 完成项目 ⏫', '🎯 ')).toBe('完成项目 ⏫');
		});

		it('TP-13c: 只移除一次', () => {
			expect(removeGlobalFilter('🎯🎯 任务', '🎯 ')).toBe('🎯 任务');
		});

		it('TP-15a: 无过滤器时原样返回', () => {
			expect(removeGlobalFilter('普通任务', '🎯 ')).toBe('普通任务');
		});

		it('TP-15b: 未设置过滤器时原样返回', () => {
			expect(removeGlobalFilter('任何任务')).toBe('任何任务');
		});
	});

	describe('applyFilter', () => {
		it('TP-13d: 通过过滤器时返回清洁内容', () => {
			const result = applyFilter('🎯 重要任务 📅 2024-01-15', '🎯 ');
			expect(result.passes).toBe(true);
			expect(result.contentWithoutFilter).toBe('重要任务 📅 2024-01-15');
		});

		it('TP-14a: 未通过时保留原文', () => {
			const result = applyFilter('普通任务', '🎯 ');
			expect(result.passes).toBe(false);
			expect(result.contentWithoutFilter).toBe('普通任务');
		});

		it('TP-15c: 无过滤器时全部通过', () => {
			const result = applyFilter('任何任务');
			expect(result.passes).toBe(true);
			expect(result.contentWithoutFilter).toBe('任何任务');
		});
	});

	describe('filterTasks', () => {
		it('TP-13e: 批量过滤并移除前缀', () => {
			const tasks = ['🎯 任务1', '普通任务', '🎯 任务2'];
			const result = filterTasks(tasks, '🎯 ');
			expect(result).toEqual(['任务1', '任务2']);
		});

		it('TP-15d: 无过滤器时返回全部', () => {
			const tasks = ['任务1', '任务2'];
			expect(filterTasks(tasks)).toEqual(tasks);
		});

		it('TP-13f: 全部通过时全部保留', () => {
			const tasks = ['🎯 任务1', '🎯 任务2'];
			const result = filterTasks(tasks, '🎯 ');
			expect(result).toEqual(['任务1', '任务2']);
		});

		it('TP-14b: 全部不通过时返回空', () => {
			const tasks = ['普通任务1', '普通任务2'];
			const result = filterTasks(tasks, '🎯 ');
			expect(result).toEqual([]);
		});
	});
});
