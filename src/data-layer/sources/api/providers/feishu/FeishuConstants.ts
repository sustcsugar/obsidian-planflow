/**
 * 飞书 API 常量定义
 *
 * 包含 API 端点、Scope 等常量
 */

import { FEISHU_SCOPES } from './FeishuTypes';

// ==================== API 端点常量 ====================

/**
 * 飞书 API 端点
 */
export const API_ENDPOINTS = {
    /** 授权端点 */
    AUTH: 'https://accounts.feishu.cn/open-apis/authen/v1/authorize',
    /** 获取令牌端点（v2端点，使用 form-urlencoded 格式） */
    TOKEN: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
    /** 刷新令牌端点（v2端点，使用 grant_type=refresh_token） */
    REFRESH: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
    /** 获取用户信息端点 */
    USER_INFO: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
    /** 获取日历列表端点 */
    CALENDAR_LIST: 'https://open.feishu.cn/open-apis/calendar/v4/calendars',
    /** 获取任务列表端点（已废弃，使用按清单获取任务） */
    TASK_LIST: 'https://open.feishu.cn/open-apis/task/v2/tasks',
    /** 获取任务清单列表端点 */
    TASK_LISTS: 'https://open.feishu.cn/open-apis/task/v2/tasklists',
} as const;

// ==================== 其他常量 ====================

/** 默认重定向 URI */
export const DEFAULT_REDIRECT_URI = 'https://open.feishu.cn/api-explorer/loading';

/** 默认Scope组合（包含日历和任务权限） */
export const DEFAULT_SCOPES = [
    FEISHU_SCOPES.OFFLINE_ACCESS,
    FEISHU_SCOPES.CALENDAR_READONLY,
    FEISHU_SCOPES.TASK_READ,
    FEISHU_SCOPES.TASK_WRITE,
    FEISHU_SCOPES.TASK_LIST_READ,
    FEISHU_SCOPES.TASK_LIST_WRITE,
].join(' ');
