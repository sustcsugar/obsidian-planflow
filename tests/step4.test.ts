/**
 * Step4: 任务属性解析 — 单元测试
 * 对应测试用例: TP-19 ~ TP-32
 */

import {
	parseCheckboxStatus,
	isIncomplete,
	isCompleted,
	isCancelled,
	parseTasksPriority,
	parseTasksDates,
	parseTasksAttributes,
	parseDataviewPriority,
	parseDataviewDates,
	parseDataviewAttributes,
	parseTaskAttributes,
	parseDateField,
	parseTasksRepeat,
	parseDataviewRepeat,
	parseRepeat,
	validateRepeatRule,
} from '../src/tasks/taskParser/step4';

describe('Step4: 任务属性解析', () => {
	// ==================== 复选框状态 ====================
	describe('parseCheckboxStatus', () => {
		it('TP-01: [ ] → todo', () => {
			const r = parseCheckboxStatus(' ');
			expect(r.completed).toBe(false);
			expect(r.cancelled).toBe(false);
			expect(r.status).toBe('todo');
		});

		it('TP-02: [x] → done', () => {
			const r = parseCheckboxStatus('x');
			expect(r.completed).toBe(true);
			expect(r.cancelled).toBe(false);
			expect(r.status).toBe('done');
		});

		it('TP-03: [!] → important', () => {
			const r = parseCheckboxStatus('!');
			expect(r.completed).toBe(false);
			expect(r.status).toBe('important');
		});

		it('TP-04: [-] → canceled', () => {
			const r = parseCheckboxStatus('-');
			expect(r.completed).toBe(false);
			expect(r.cancelled).toBe(true);
			expect(r.status).toBe('canceled');
		});

		it('TP-05: [/] → in_progress', () => {
			const r = parseCheckboxStatus('/');
			expect(r.completed).toBe(false);
			expect(r.status).toBe('in_progress');
		});

		it('TP-06: [?] → question', () => {
			const r = parseCheckboxStatus('?');
			expect(r.completed).toBe(false);
			expect(r.status).toBe('question');
		});

		it('TP-07: [n] → start', () => {
			const r = parseCheckboxStatus('n');
			expect(r.completed).toBe(false);
			expect(r.status).toBe('start');
		});

		it('TP-02a: 大写 X → done (completed=true, 但 DEFAULT_STATUSES 无大写X符号)', () => {
			const r = parseCheckboxStatus('X');
			// normalized='x' → completed=true, 但 parseStatusFromCheckbox 查符号表
			// DEFAULT_TASK_STATUSES 中 symbol='x'(小写), 大写X查不到 → status='todo'
			expect(r.completed).toBe(true);
			expect(r.originalStatus).toBe('X');
		});
	});

	describe('isIncomplete / isCompleted / isCancelled', () => {
		it('TP-19a: isIncomplete: 仅 [ ] 为 true', () => {
			expect(isIncomplete(' ')).toBe(true);
			expect(isIncomplete('x')).toBe(false);
			expect(isIncomplete('/')).toBe(false);
		});

		it('TP-19b: isCompleted: x/X 为 true', () => {
			expect(isCompleted('x')).toBe(true);
			expect(isCompleted('X')).toBe(true);
			expect(isCompleted(' ')).toBe(false);
		});

		it('TP-19c: isCancelled: 仅 - 为 true', () => {
			expect(isCancelled('-')).toBe(true);
			expect(isCancelled('/')).toBe(false);
			expect(isCancelled(' ')).toBe(false);
		});
	});

	// ==================== Tasks 格式解析 ====================
	describe('parseTasksPriority', () => {
		it('TP-19: ⏫ → high', () => {
			expect(parseTasksPriority('任务 ⏫ 内容')).toBe('high');
		});

		it('TP-19: 🔺 → highest', () => {
			expect(parseTasksPriority('🔺 重要任务')).toBe('highest');
		});

		it('TP-19: 🔼 → medium', () => {
			expect(parseTasksPriority('任务 🔼')).toBe('medium');
		});

		it('TP-19: 🔽 → low', () => {
			expect(parseTasksPriority('任务 🔽')).toBe('low');
		});

		it('TP-19: ⏬ → lowest', () => {
			expect(parseTasksPriority('任务 ⏬')).toBe('lowest');
		});

		it('TP-19d: 无优先级 → undefined', () => {
			expect(parseTasksPriority('普通任务')).toBeUndefined();
		});
	});

	describe('parseTasksDates', () => {
		it('TP-21: ➕ → createdDate', () => {
			const { dates } = parseTasksDates('任务 ➕ 2024-01-15');
			expect(dates.createdDate).toBeInstanceOf(Date);
			expect(dates.createdDate!.getFullYear()).toBe(2024);
		});

		it('TP-22: 🛫 → startDate', () => {
			const { dates } = parseTasksDates('任务 🛫 2024-01-15');
			expect(dates.startDate).toBeInstanceOf(Date);
		});

		it('TP-23: ⏳ → scheduledDate', () => {
			const { dates } = parseTasksDates('任务 ⏳ 2024-01-15');
			expect(dates.scheduledDate).toBeInstanceOf(Date);
		});

		it('TP-24: 📅 → dueDate', () => {
			const { dates } = parseTasksDates('任务 📅 2024-01-15');
			expect(dates.dueDate).toBeInstanceOf(Date);
		});

		it('TP-25: ❌ → cancelledDate', () => {
			const { dates } = parseTasksDates('任务 ❌ 2024-01-15');
			expect(dates.cancelledDate).toBeInstanceOf(Date);
		});

		it('TP-26: ✅ → completionDate', () => {
			const { dates } = parseTasksDates('任务 ✅ 2024-01-15');
			expect(dates.completionDate).toBeInstanceOf(Date);
		});

		it('TP-27: 含时间的日期精度', () => {
			const { precisions } = parseTasksDates('任务 📅 2024-01-15 14:30');
			expect(precisions.dueDate).toBe('time');
		});

		it('TP-27a: 不含时间的日期精度', () => {
			const { precisions } = parseTasksDates('任务 📅 2024-01-15');
			expect(precisions.dueDate).toBe('day');
		});

		it('TP-27b: 多日期字段同时解析', () => {
			const { dates } = parseTasksDates('任务 ➕ 2024-01-10 📅 2024-01-15');
			expect(dates.createdDate).toBeInstanceOf(Date);
			expect(dates.dueDate).toBeInstanceOf(Date);
		});
	});

	describe('parseTasksAttributes', () => {
		it('TP-19e: 完整属性解析', () => {
			const attrs = parseTasksAttributes('任务 ⏫ ➕ 2024-01-10 📅 2024-01-15');
			expect(attrs.priority).toBe('high');
			expect(attrs.dates.createdDate).toBeInstanceOf(Date);
			expect(attrs.dates.dueDate).toBeInstanceOf(Date);
			expect(attrs.hasCancelledDate).toBe(false);
		});

		it('TP-19f: 无属性时默认 normal 优先级', () => {
			const attrs = parseTasksAttributes('普通任务');
			expect(attrs.priority).toBe('normal');
			expect(Object.keys(attrs.dates)).toHaveLength(0);
		});
	});

	// ==================== Dataview 格式解析 ====================
	describe('parseDataviewPriority', () => {
		it('TP-20: [priority:: high]', () => {
			expect(parseDataviewPriority('任务 [priority:: high]')).toBe('high');
		});

		it('TP-20: 大写 HIGHEST', () => {
			expect(parseDataviewPriority('任务 [priority:: HIGHEST]')).toBe('highest');
		});

		it('TP-20a2: 无优先级 → undefined', () => {
			expect(parseDataviewPriority('普通任务')).toBeUndefined();
		});
	});

	describe('parseDataviewDates', () => {
		it('TP-21a: 解析 [created:: date]', () => {
			const { dates } = parseDataviewDates('任务 [created:: 2024-01-10]');
			expect(dates.createdDate).toBeInstanceOf(Date);
		});

		it('TP-24a: 解析 [due:: date]', () => {
			const { dates } = parseDataviewDates('任务 [due:: 2024-01-15]');
			expect(dates.dueDate).toBeInstanceOf(Date);
		});

		it('TP-27c: 含时间精度', () => {
			const { precisions } = parseDataviewDates('任务 [due:: 2024-01-15 14:30]');
			expect(precisions.dueDate).toBe('time');
		});

		it('TP-27d: 多日期字段', () => {
			const { dates } = parseDataviewDates('任务 [created:: 2024-01-10] [due:: 2024-01-15]');
			expect(dates.createdDate).toBeInstanceOf(Date);
			expect(dates.dueDate).toBeInstanceOf(Date);
		});
	});

	describe('parseDataviewAttributes', () => {
		it('TP-20a3: 完整属性解析', () => {
			const attrs = parseDataviewAttributes('任务 [priority:: high] [created:: 2024-01-10] [due:: 2024-01-15]');
			expect(attrs.priority).toBe('high');
			expect(attrs.dates.createdDate).toBeInstanceOf(Date);
			expect(attrs.dates.dueDate).toBeInstanceOf(Date);
		});
	});

	// ==================== 统一接口 ====================
	describe('parseTaskAttributes', () => {
		it('TP-19g: Tasks 格式统一接口', () => {
			const attrs = parseTaskAttributes('任务 ⏫ 📅 2024-01-15', 'tasks');
			expect(attrs.priority).toBe('high');
			expect(attrs.dates.dueDate).toBeInstanceOf(Date);
		});

		it('TP-20a: Dataview 格式统一接口', () => {
			const attrs = parseTaskAttributes('任务 [priority:: high] [due:: 2024-01-15]', 'dataview');
			expect(attrs.priority).toBe('high');
			expect(attrs.dates.dueDate).toBeInstanceOf(Date);
		});
	});

	describe('parseDateField', () => {
		it('TP-24b: Tasks 格式 dueDate', () => {
			const d = parseDateField('任务 📅 2024-01-15', 'dueDate', 'tasks');
			expect(d).toBeInstanceOf(Date);
			expect(d!.getFullYear()).toBe(2024);
		});

		it('TP-24c: Dataview 格式 dueDate', () => {
			const d = parseDateField('任务 [due:: 2024-01-15]', 'dueDate', 'dataview');
			expect(d).toBeInstanceOf(Date);
		});

		it('TP-24d: 无匹配返回 undefined', () => {
			expect(parseDateField('普通任务', 'dueDate', 'tasks')).toBeUndefined();
		});
	});

	// ==================== 重复规则 ====================
	describe('parseTasksRepeat', () => {
		it('TP-28: every week on Monday', () => {
			expect(parseTasksRepeat('任务 🔁 every week on Monday')).toBe('every week on Monday');
		});

		it('TP-29: every month when done', () => {
			expect(parseTasksRepeat('任务 🔁every month when done')).toBe('every month when done');
		});

		it('TP-30: every day', () => {
			expect(parseTasksRepeat('任务 🔁 every day')).toBe('every day');
		});

		it('TP-28a: 无重复规则 → undefined', () => {
			expect(parseTasksRepeat('普通任务')).toBeUndefined();
		});
	});

	describe('parseDataviewRepeat', () => {
		it('TP-30a: [repeat:: every day]', () => {
			expect(parseDataviewRepeat('任务 [repeat:: every day]')).toBe('every day');
		});

		it('TP-29a: [repeat::every week when done]', () => {
			expect(parseDataviewRepeat('任务 [repeat::every week when done]')).toBe('every week when done');
		});
	});

	describe('parseRepeat', () => {
		it('Tasks 格式', () => {
			expect(parseRepeat('任务 🔁 every day', 'tasks')).toBe('every day');
		});

		it('Dataview 格式', () => {
			expect(parseRepeat('任务 [repeat:: every week]', 'dataview')).toBe('every week');
		});
	});

	describe('validateRepeatRule', () => {
		it('TP-30b: 有效: every day', () => {
			expect(validateRepeatRule('every day')).toBe(true);
		});

		it('TP-28b: 有效: every week on Monday when done', () => {
			expect(validateRepeatRule('every week on Monday when done')).toBe(true);
		});

		it('TP-28c: 有效: every 2 weeks', () => {
			expect(validateRepeatRule('every 2 weeks')).toBe(true);
		});

		it('TP-29b: 有效: every month on the 15th', () => {
			expect(validateRepeatRule('every month on the 15th')).toBe(true);
		});

		it('TP-28d: 无效: 不以 every 开头', () => {
			expect(validateRepeatRule('invalid rule')).toBe(false);
		});

		it('TP-28e: 无效: 空字符串', () => {
			expect(validateRepeatRule('')).toBe(false);
		});
	});
});
