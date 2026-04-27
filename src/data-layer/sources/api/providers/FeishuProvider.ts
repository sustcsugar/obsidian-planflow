/**
 * 飞书（Lark）数据源
 *
 * 实现飞书任务 API 的对接，使用 user_access_token 进行用户级认证。
 * API 文档: https://open.feishu.cn/document/server-docs/docs/task-v1/task-list
 */

import { requestUrl } from 'obsidian';
import { APIDataSource, APIResponse, APITaskDTO } from '../APIDataSource';
import type { DataSourceConfig } from '../../../types';
import { Logger } from '../../../../utils/logger';
import { FeishuOAuth } from './feishu/FeishuOAuth';
import type { FeishuOAuthConfig, FeishuTaskRaw, FeishuTaskResponse } from './feishu/FeishuTypes';
import type { FeishuTaskPayload } from '../../../feishu-sync/taskMapper';

/**
 * 飞书任务 DTO
 */
interface FeishuTaskDTO {
    task_key: string;
    summary: string;
    note?: string;
    status: 'done' | 'in_progress' | 'archived';
    due: {
        timestamp?: number;
    };
    priority: 'high' | 'normal' | 'low';
    completed_time?: number;
    create_time: number;
    modify_time: number;
}

/**
 * 飞书 API 响应
 */
interface FeishuAPIResponse<T> {
    code: number;
    msg: string;
    data?: T;
}

/**
 * 配置更新事件数据
 */
interface ConfigUpdateData {
    accessToken?: string;
    refreshToken?: string;
    tokenExpireAt?: number;
}

/**
 * 飞书数据源
 */
export class FeishuProvider extends APIDataSource {
    readonly sourceId = 'feishu';
    readonly sourceName = 'Feishu (Lark)';

    private oauthConfig: FeishuOAuthConfig;
    private tokenExpireAt?: number;
    private configUpdateCallback?: (data: ConfigUpdateData) => void;

    constructor(config: DataSourceConfig) {
        super(config);

        // 支持 clientId/appId 两种命名
        const clientId = config.api?.clientId || config.api?.appId || '';
        const clientSecret = config.api?.clientSecret || config.api?.appSecret || '';

        if (!clientId) {
            throw new Error('Feishu requires clientId (App ID)');
        }

        this.oauthConfig = {
            clientId,
            clientSecret,
            redirectUri: config.api?.redirectUri || FeishuOAuth.getDefaultRedirectUri(),
            accessToken: config.api?.accessToken,
            refreshToken: config.api?.refreshToken,
            tokenExpireAt: config.api?.tokenExpireAt,
        };

        // 同步初始过期时间
        if (config.api?.tokenExpireAt) {
            this.tokenExpireAt = config.api.tokenExpireAt;
        }
    }

    /**
     * 设置配置更新回调
     * 当 token 刷新时，通过此回调通知外部更新配置
     */
    setConfigUpdateCallback(callback: (data: ConfigUpdateData) => void): void {
        this.configUpdateCallback = callback;
    }

    /**
     * 获取当前配置（用于保存更新后的 token）
     */
    getCurrentConfig(): Partial<DataSourceConfig['api']> {
        return {
            clientId: this.oauthConfig.clientId,
            clientSecret: this.oauthConfig.clientSecret,
            redirectUri: this.oauthConfig.redirectUri,
            accessToken: this.oauthConfig.accessToken,
            refreshToken: this.oauthConfig.refreshToken,
            tokenExpireAt: this.tokenExpireAt,
        };
    }

    /**
     * 验证连接
     */
    protected async validateConnection(): Promise<boolean> {
        try {
            await this.ensureAccessToken();
            const response = await this.getTaskList(1);
            return response.code === 0;
        } catch (error) {
            Logger.error('FeishuProvider', 'Connection validation failed', error);
            return false;
        }
    }

    /**
     * 拉取任务列表
     */
    protected async apiFetchTasks(cursor?: string): Promise<APIResponse<APITaskDTO[]>> {
        await this.ensureAccessToken();

        const pageSize = 100;
        const pageToken = cursor;

        try {
            const response = await this.getTaskList(pageSize, pageToken);

            if (response.code === 0 && response.data) {
                const tasks = response.data.items || [];
                const dtoList: APITaskDTO[] = tasks.map(this.fromFeishuDTO);

                return {
                    success: true,
                    data: dtoList,
                    hasMore: response.data.has_more,
                    cursor: response.data.page_token,
                };
            }

            return {
                success: false,
                error: response.msg || 'Failed to fetch tasks',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Fetch tasks failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 创建任务
     */
    protected async apiCreateTask(dto: APITaskDTO): Promise<APIResponse<string>> {
        await this.ensureAccessToken();

        const feishuTask = this.toFeishuDTO(dto);

        try {
            const response = await this.callAPI<FeishuAPIResponse<{ task_key: string }>>(
                '/open-apis/task/v1/tasks',
                'POST',
                {
                    summary: feishuTask.summary,
                    note: feishuTask.note,
                    due: feishuTask.due,
                    priority: feishuTask.priority,
                }
            );

            if (response.code === 0 && response.data) {
                return {
                    success: true,
                    data: response.data.task_key,
                };
            }

            return {
                success: false,
                error: response.msg || 'Failed to create task',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Create task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 更新任务
     */
    protected async apiUpdateTask(id: string, dto: APITaskDTO): Promise<APIResponse<void>> {
        await this.ensureAccessToken();

        const feishuTask = this.toFeishuDTO(dto);

        try {
            const response = await this.callAPI<FeishuAPIResponse<void>>(
                `/open-apis/task/v1/tasks/${id}`,
                'PATCH',
                {
                    summary: feishuTask.summary,
                    note: feishuTask.note,
                    due: feishuTask.due,
                    priority: feishuTask.priority,
                }
            );

            if (response.code === 0) {
                return { success: true };
            }

            return {
                success: false,
                error: response.msg || 'Failed to update task',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Update task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 删除任务
     */
    protected async apiDeleteTask(id: string): Promise<APIResponse<void>> {
        await this.ensureAccessToken();

        try {
            const response = await this.callAPI<FeishuAPIResponse<void>>(
                `/open-apis/task/v1/tasks/${id}`,
                'DELETE'
            );

            if (response.code === 0) {
                return { success: true };
            }

            return {
                success: false,
                error: response.msg || 'Failed to delete task',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Delete task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // ==================== 飞书同步引擎公开 API ====================

    /**
     * 获取所有飞书任务（原始格式，支持分页）
     *
     * 返回原始 FeishuTaskRaw 对象，保留 update_time 等字段用于同步变更检测。
     */
    async fetchAllFeishuTasks(pageSize: number = 100): Promise<FeishuTaskRaw[]> {
        await this.ensureAccessToken();

        const allTasks: FeishuTaskRaw[] = [];
        let pageToken: string | undefined;

        do {
            const params = new URLSearchParams({ page_size: String(pageSize) });
            if (pageToken) params.append('page_token', pageToken);

            const response = await this.callAPI<FeishuTaskResponse>(
                `/open-apis/task/v1/tasks?${params.toString()}`
            );

            if (response.code === 0 && response.data?.items) {
                allTasks.push(...response.data.items);
            }

            pageToken = response.data?.has_more ? response.data?.page_token : undefined;
        } while (pageToken);

        return allTasks;
    }

    /**
     * 创建飞书任务（同步引擎用）
     */
    async createFeishuTask(payload: FeishuTaskPayload): Promise<string> {
        await this.ensureAccessToken();

        const response = await this.callAPI<FeishuTaskResponse>(
            '/open-apis/task/v1/tasks',
            'POST',
            payload
        );

        if (response.code === 0 && response.data?.items?.[0]?.guid) {
            return response.data.items[0].guid;
        }

        throw new Error(response.msg || 'Failed to create Feishu task');
    }

    /**
     * 更新飞书任务（同步引擎用）
     */
    async updateFeishuTask(guid: string, payload: FeishuTaskPayload): Promise<void> {
        await this.ensureAccessToken();

        const response = await this.callAPI<FeishuTaskResponse>(
            `/open-apis/task/v1/tasks/${guid}`,
            'PATCH',
            payload
        );

        if (response.code !== 0) {
            throw new Error(response.msg || 'Failed to update Feishu task');
        }
    }

    // ==================== 飞书 API 方法 ====================

    /**
     * 确保 access_token 有效
     * 使用 user_access_token 而非 tenant_access_token
     */
    private async ensureAccessToken(): Promise<void> {
        const now = Date.now();

        // 检查现有 token 是否有效
        if (this.oauthConfig.accessToken &&
            this.tokenExpireAt &&
            now < this.tokenExpireAt) {
            return;
        }

        // 尝试使用 refresh_token 刷新
        if (this.oauthConfig.refreshToken) {
            try {
                Logger.info('FeishuProvider', 'Attempting to refresh access token');

                const tokenResponse = await FeishuOAuth.refreshAccessToken(this.oauthConfig);

                // v2 API 响应直接包含 token 字段，无 data 包裹层
                if (tokenResponse?.access_token) {
                    this.oauthConfig.accessToken = tokenResponse.access_token;
                    if (tokenResponse.refresh_token) {
                        this.oauthConfig.refreshToken = tokenResponse.refresh_token;
                    }

                    const expiresIn = tokenResponse.expires_in || 7200;
                    this.tokenExpireAt = now + (expiresIn - 60) * 1000; // 提前1分钟过期

                    Logger.info('FeishuProvider', 'Token refreshed successfully');

                    // 通知外部更新配置
                    this.notifyConfigUpdate();
                    return;
                }
            } catch (error) {
                Logger.warn('FeishuProvider', 'Token refresh failed', error);
            }
        }

        // 无法刷新，需要用户重新授权
        throw new Error('Feishu access token is expired. Please re-authenticate using the authorization flow.');
    }

    /**
     * 通知配置更新
     */
    private notifyConfigUpdate(): void {
        if (this.configUpdateCallback) {
            this.configUpdateCallback({
                accessToken: this.oauthConfig.accessToken,
                refreshToken: this.oauthConfig.refreshToken,
                tokenExpireAt: this.tokenExpireAt,
            });
        }
    }

    /**
     * 调用飞书 API
     */
    private async callAPI<T>(
        path: string,
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
        body?: unknown
    ): Promise<T> {
        await this.ensureAccessToken();

        const url = `https://open.feishu.cn${path}`;

        const response = await requestUrl({
            url,
            method,
            headers: {
                'Authorization': `Bearer ${this.oauthConfig.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        return response.json;
    }

    /**
     * 获取任务列表
     */
    private async getTaskList(
        pageSize: number = 100,
        pageToken?: string
    ): Promise<FeishuAPIResponse<{
        items: FeishuTaskDTO[];
        has_more: boolean;
        page_token: string;
    }>> {
        const params = new URLSearchParams({
            page_size: String(pageSize),
        });

        if (pageToken) {
            params.append('page_token', pageToken);
        }

        return this.callAPI(`/open-apis/task/v1/tasks?${params.toString()}`);
    }

    /**
     * 将飞书 DTO 转换为通用 DTO
     */
    private fromFeishuDTO = (feishu: FeishuTaskDTO): APITaskDTO => {
        return {
            id: feishu.task_key,
            title: feishu.summary,
            description: feishu.note,
            completed: feishu.status === 'done',
            dueDate: feishu.due?.timestamp
                ? new Date(feishu.due.timestamp * 1000).toISOString()
                : undefined,
            priority: this.mapFeishuPriority(feishu.priority),
            status: feishu.status,
            lastModified: new Date(feishu.modify_time * 1000),
        };
    };

    /**
     * 将通用 DTO 转换为飞书 DTO
     */
    private toFeishuDTO(dto: APITaskDTO): Partial<FeishuTaskDTO> {
        return {
            summary: dto.title,
            note: dto.description,
            status: dto.completed ? 'done' : 'in_progress',
            due: dto.dueDate
                ? { timestamp: Math.floor(new Date(dto.dueDate).getTime() / 1000) }
                : undefined,
            priority: this.mapToFeishuPriority(dto.priority),
        };
    }

    /**
     * 映射飞书优先级到通用优先级
     */
    private mapFeishuPriority(priority: string): string {
        switch (priority) {
            case 'high':
                return 'high';
            case 'low':
                return 'low';
            case 'normal':
            default:
                return 'normal';
        }
    }

    /**
     * 映射通用优先级到飞书优先级
     */
    private mapToFeishuPriority(priority?: string): 'high' | 'normal' | 'low' {
        if (!priority) return 'normal';

        switch (priority) {
            case 'highest':
            case 'high':
                return 'high';
            case 'low':
            case 'lowest':
                return 'low';
            default:
                return 'normal';
        }
    }
}
