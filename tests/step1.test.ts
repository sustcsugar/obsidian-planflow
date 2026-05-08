/**
 * Step1: 任务行识别 — 单元测试
 * 对应测试用例: TP-01 ~ TP-12
 */

import { isTaskLine, parseTaskLine, extractTaskLines } from '../src/tasks/taskParser/step1';

describe('Step1: 任务行识别', () => {
	describe('isTaskLine', () => {
		it('TP-01: 识别 todo 任务', () => {
			expect(isTaskLine('- [ ] 任务内容')).toBe(true);
		});

		it('TP-02: 识别 done 任务', () => {
			expect(isTaskLine('- [x] 已完成')).toBe(true);
		});

		it('TP-03: 识别 important 状态', () => {
			expect(isTaskLine('- [!] 紧急')).toBe(true);
		});

		it('TP-04: 识别 canceled 状态', () => {
			expect(isTaskLine('- [-] 已取消')).toBe(true);
		});

		it('TP-05: 识别 in_progress 状态', () => {
			expect(isTaskLine('- [/] 进行中')).toBe(true);
		});

		it('TP-06: 识别 question 状态', () => {
			expect(isTaskLine('- [?] 有疑问')).toBe(true);
		});

		it('TP-07: 识别 start 状态', () => {
			expect(isTaskLine('- [n] 已启动')).toBe(true);
		});

		it('TP-08: 排除非任务行', () => {
			expect(isTaskLine('普通文本行')).toBe(false);
			expect(isTaskLine('# 标题')).toBe(false);
			expect(isTaskLine('')).toBe(false);
			expect(isTaskLine('- 普通列表项')).toBe(false);
		});

		it('TP-09: 识别含 tab 缩进的任务', () => {
			expect(isTaskLine('\t- [ ] 子任务')).toBe(true);
		});

		it('TP-10: 识别含空格缩进的任务', () => {
			expect(isTaskLine('    - [ ] 子任务')).toBe(true);
		});

		it('TP-11: 识别有序列表任务', () => {
			expect(isTaskLine('1. [ ] 有序列表任务')).toBe(true);
		});

		it('TP-12: 识别星号列表任务', () => {
			expect(isTaskLine('* [x] 星号列表任务')).toBe(true);
		});

		it('TP-12a: 识别加号列表任务', () => {
			expect(isTaskLine('+ [ ] 加号列表')).toBe(true);
		});

		it('TP-02a: 识别大写 X 完成状态', () => {
			expect(isTaskLine('- [X] 大写X完成')).toBe(true);
		});

		it('TP-01a: 识别引用块中的任务', () => {
			expect(isTaskLine('> - [ ] 引用任务')).toBe(true);
		});
	});

	describe('parseTaskLine', () => {
		it('TP-01b: 正确解析 todo 任务', () => {
			const result = parseTaskLine('- [ ] 任务内容');
			expect(result).not.toBeNull();
			expect(result!.indent).toBe('');
			expect(result!.listMarker).toBe('-');
			expect(result!.checkboxStatus).toBe(' ');
			expect(result!.content).toBe('任务内容');
		});

		it('TP-02b: 正确解析 done 任务', () => {
			const result = parseTaskLine('- [x] 已完成');
			expect(result).not.toBeNull();
			expect(result!.checkboxStatus).toBe('x');
			expect(result!.content).toBe('已完成');
		});

		it('TP-10a: 正确解析含缩进的任务', () => {
			const result = parseTaskLine('  - [ ] 子任务');
			expect(result).not.toBeNull();
			expect(result!.indent).toBe('  ');
			expect(result!.listMarker).toBe('-');
			expect(result!.checkboxStatus).toBe(' ');
		});

		it('TP-09a: 正确解析含 tab 缩进的任务', () => {
			const result = parseTaskLine('\t- [ ] tab缩进');
			expect(result).not.toBeNull();
			expect(result!.indent).toBe('\t');
		});

		it('TP-11a: 正确解析有序列表任务', () => {
			const result = parseTaskLine('1. [ ] 数字列表');
			expect(result).not.toBeNull();
			expect(result!.listMarker).toBe('1.');
		});

		it('TP-08a: 对非任务行返回 null', () => {
			expect(parseTaskLine('普通文本')).toBeNull();
			expect(parseTaskLine('# 标题')).toBeNull();
			expect(parseTaskLine('- 无复选框')).toBeNull();
		});

		it('TP-01c: 保留任务内容的所有属性', () => {
			const result = parseTaskLine('- [ ] 🎯 完成项目 ⏫ 📅 2024-01-15');
			expect(result).not.toBeNull();
			expect(result!.content).toBe('🎯 完成项目 ⏫ 📅 2024-01-15');
		});
	});

	describe('extractTaskLines', () => {
		it('TP-01d: 从多行文本中提取所有任务行', () => {
			const lines = [
				'# 标题',
				'- [ ] 任务1',
				'普通文本',
				'- [x] 任务2',
			];
			const results = extractTaskLines(lines);
			expect(results).toHaveLength(2);
			expect(results[0].lineNumber).toBe(1);
			expect(results[0].match.content).toBe('任务1');
			expect(results[1].lineNumber).toBe(3);
			expect(results[1].match.content).toBe('任务2');
		});

		it('TP-08b: 无任务行时返回空数组', () => {
			const lines = ['# 标题', '普通文本', ''];
			expect(extractTaskLines(lines)).toHaveLength(0);
		});

		it('TP-01e: 所有行都是任务行', () => {
			const lines = [
				'- [ ] 任务1',
				'- [x] 任务2',
				'- [/] 任务3',
			];
			expect(extractTaskLines(lines)).toHaveLength(3);
		});
	});
});
