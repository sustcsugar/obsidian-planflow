/**
 * 日期工具 — 单元测试
 * 对应测试用例: UT-11 ~ UT-16
 */

import { getDaysInMonth, getFirstDayOfMonth, formatDate, formatMonth } from '../src/dateUtils/format';
import { startOfWeek, getWeekNumber, isThisWeek } from '../src/dateUtils/week';
import { isToday, isThisMonth } from '../src/dateUtils/dateCompare';

describe('日期工具', () => {
	describe('format', () => {
		describe('getDaysInMonth', () => {
			it('UT-11a: 1月有31天', () => expect(getDaysInMonth(2024, 1)).toBe(31));
			it('UT-11b: 2月平年28天', () => expect(getDaysInMonth(2023, 2)).toBe(28));
			it('UT-11c: 2月闰年29天', () => expect(getDaysInMonth(2024, 2)).toBe(29));
			it('UT-11d: 4月有30天', () => expect(getDaysInMonth(2024, 4)).toBe(30));
		});

		describe('getFirstDayOfMonth', () => {
			it('UT-11e: 2024年3月1日是周五', () => expect(getFirstDayOfMonth(2024, 3)).toBe(5));
			it('UT-11f: 2024年9月1日是周日', () => expect(getFirstDayOfMonth(2024, 9)).toBe(0));
		});

		describe('formatDate', () => {
			it('UT-11g: 默认格式 yyyy-MM-dd', () => {
				const date = new Date(2024, 0, 15);
				expect(formatDate(date)).toBe('2024-01-15');
			});

			it('UT-11h: 自定义格式 yyyy/MM/dd', () => {
				const date = new Date(2024, 5, 3);
				expect(formatDate(date, 'yyyy/MM/dd')).toBe('2024/06/03');
			});

			it('UT-11i: 含时间格式', () => {
				const date = new Date(2024, 0, 15, 14, 30);
				expect(formatDate(date, 'yyyy-MM-dd HH:mm')).toBe('2024-01-15 14:30');
			});

			it('UT-11j: 含星期缩写', () => {
				const date = new Date(2024, 0, 15); // 2024-01-15 是周一
				const result = formatDate(date, 'yyyy-MM-dd ddd');
				expect(result).toContain('Mon');
			});

			it('UT-11k: 补零', () => {
				const date = new Date(2024, 0, 5);
				expect(formatDate(date, 'dd')).toBe('05');
			});
		});

		describe('formatMonth', () => {
			it('UT-11l: 返回月份名称', () => {
				expect(formatMonth(2024, 1)).toBe('January 2024');
				expect(formatMonth(2024, 6)).toBe('June 2024');
				expect(formatMonth(2024, 12)).toBe('December 2024');
			});
		});
	});

	describe('week', () => {
		describe('startOfWeek', () => {
			it('UT-14a: 周一开始: 周三 → 本周一', () => {
				const wed = new Date(2024, 0, 17); // 周三
				const result = startOfWeek(wed, true);
				expect(result.getDay()).toBe(1); // 周一
				expect(result.getDate()).toBe(15);
			});

			it('UT-14b: 周一开始: 周日 → 上一周一', () => {
				const sun = new Date(2024, 0, 14); // 周日
				const result = startOfWeek(sun, true);
				expect(result.getDay()).toBe(1);
				expect(result.getDate()).toBe(8);
			});

			it('UT-14c: 周日开始: 周三 → 本周日', () => {
				const wed = new Date(2024, 0, 17);
				const result = startOfWeek(wed, false);
				expect(result.getDay()).toBe(0); // 周日
			});
		});

		describe('getWeekNumber', () => {
			it('UT-16a: 1月1日所在周为第1周', () => {
				const jan1 = new Date(2024, 0, 1);
				const week = getWeekNumber(jan1, 2024);
				expect(week).toBe(1);
			});

			it('UT-16b: 连续日期的周号递增', () => {
				const week1 = getWeekNumber(new Date(2024, 0, 8), 2024);
				const week2 = getWeekNumber(new Date(2024, 0, 15), 2024);
				expect(week2).toBeGreaterThan(week1);
			});
		});

		describe('isThisWeek', () => {
			it('UT-14d: 今天的日期返回 true', () => {
				const now = new Date();
				expect(isThisWeek(now)).toBe(true);
			});
		});
	});

	describe('dateCompare', () => {
		describe('isToday', () => {
			it('UT-13: 今天的日期返回 true', () => {
				expect(isToday(new Date())).toBe(true);
			});
		});

		describe('isThisMonth', () => {
			it('UT-15: 本月日期返回 true', () => {
				const now = new Date();
				expect(isThisMonth(now)).toBe(true);
			});
		});
	});
});
