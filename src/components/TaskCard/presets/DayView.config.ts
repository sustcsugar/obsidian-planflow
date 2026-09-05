import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 日视图预设配置
 * 连续画布（timeline 变体）；卡片元素开关由 dayViewShow* 用户设置驱动
 */
export const DayViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'day',

	// 元素显示控制（checkbox/tags/priority/ticktick 由视图层按用户设置覆盖）
	showCheckbox: true,
	showTags: true,
	showPriority: true,
	showTicktick: true,
	showDescription: true,
	showFileLocation: false,    // 日视图不显示文件位置
	showWarning: true,
	showGlobalFilter: false,

	// 时间属性配置（块右上角已有时刻标签，卡片内不再显示时间徽章）
	showTimes: false,

	// 交互功能（画布块信息密度高，tooltip/drag 与其他时间线视图一致开启）
	enableTooltip: true,
	enableDrag: true,
	clickable: true,

	// 样式配置
	compact: true,
};
