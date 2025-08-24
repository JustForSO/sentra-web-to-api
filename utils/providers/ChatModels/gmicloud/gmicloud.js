import crypto from 'crypto';

/**
 * GMICloud API类 - 修复405错误，使用正确的API端点和请求格式
 */
export default class GMICloudProvider {
    constructor(config = {}) {
        // 配置常量 - 使用正确的API端点
        this.config = {
            TIMEOUT: 600000, // 10分钟超时
            BASE_URL: 'https://console.gmicloud.ai',
            TARGET_URL: 'https://console.gmicloud.ai/chat', // 正确的聊天端点
            DEFAULT_MODEL: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
            DEFAULT_PARAMS: {
                temperature: 0.6,
                max_tokens: 8192,
                top_k: 1,
                top_p: 0.9,
                frequency_penalty: 0,
                presence_penalty: 0,
            },
            ...config
        };

        // 随机User-Agent列表
        this.userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/114.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        ];
    }

    /**
     * 获取随机User-Agent
     * @returns {string} 随机的User-Agent字符串
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * 生成随机ID
     * @returns {string} 聊天完成ID
     */
    generateId() {
        return `chatcmpl-${crypto.randomBytes(16).toString('hex').substring(0, 10)}`;
    }

    /**
     * 获取当前时间戳
     * @returns {number} Unix时间戳
     */
    getTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * 构建GMICloud API请求负载 - 使用正确的格式
     * @param {Object} requestBody 请求体参数
     * @returns {Object} 构建的请求负载
     */
    buildPayload(requestBody) {
        const isStreaming = requestBody.stream === true;
        const systemMessage = requestBody.messages?.find(m => m.role === 'system');
        
        // GMICloud使用特定的payload格式，不是标准OpenAI格式
        return {
            temperature: requestBody.temperature ?? this.config.DEFAULT_PARAMS.temperature,
            max_tokens: requestBody.max_tokens ?? this.config.DEFAULT_PARAMS.max_tokens,
            top_k: this.config.DEFAULT_PARAMS.top_k,
            top_p: requestBody.top_p ?? this.config.DEFAULT_PARAMS.top_p,
            frequency_penalty: requestBody.frequency_penalty ?? this.config.DEFAULT_PARAMS.frequency_penalty,
            presence_penalty: requestBody.presence_penalty ?? this.config.DEFAULT_PARAMS.presence_penalty,
            stream: isStreaming,
            system_prompt: systemMessage?.content || "You are a helpful assistant",
            model: requestBody.model || this.config.DEFAULT_MODEL,
            messages: requestBody.messages || []
        };
    }

    /**
     * 调用GMICloud API - 修复405错误，使用正确的端点和请求头
     * @param {Object} payload 请求负载
     * @returns {Promise<Response>} API响应
     */
    async callGMICloudAPI(payload) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.TIMEOUT);

        try {
            const startTime = Date.now();
            const userAgent = this.getRandomUserAgent();
            
            // 使用正确的GMICloud聊天端点，不是OpenAI兼容端点
            const response = await fetch(this.config.TARGET_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': userAgent,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Origin': this.config.BASE_URL,
                    'Referer': `${this.config.BASE_URL}/playground/llm/qwen3-coder-480b-a35b-instruct-fp8/1c44de32-1a64-4fd6-959b-273ffefa0a6b?tab=playground`,
                    'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`GMICloud API Error (${response.status}):`, errorText);
                throw new Error(
                    `GMICloud API Error (${response.status}): ${errorText || 'Unknown error'}`
                );
            }

            console.log(`GMICloud API调用成功，耗时 ${Date.now() - startTime}ms`);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('GMICloud API调用失败:', error);
            throw error;
        }
    }

    /**
     * 处理OpenAI格式的响应
     * @param {Object} requestBody 原始请求体
     * @param {Response} gmiCloudResponse GMICloud API响应
     * @param {boolean} isStreaming 是否为流式响应
     * @returns {Object} 格式化的响应
     */
    async handleOpenAIResponse(requestBody, gmiCloudResponse, isStreaming) {
        if (isStreaming) {
            return gmiCloudResponse;
        }

        const gmiCloudResult = await gmiCloudResponse.json();

        return {
            id: this.generateId(),
            object: 'chat.completion',
            created: this.getTimestamp(),
            model: requestBody.model || this.config.DEFAULT_MODEL,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content:
                            gmiCloudResult.choices?.[0]?.message?.content ||
                            gmiCloudResult.result ||
                            '',
                    },
                    finish_reason: gmiCloudResult.choices?.[0]?.finish_reason || 'stop',
                },
            ],
            usage: gmiCloudResult.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
        };
    }

    /**
     * 创建聊天完成 - 主要入口方法
     * @param {Object} params 聊天参数
     * @returns {Promise<Object>} 聊天完成响应
     */
    async createChatCompletion(params) {
        try {
            const isStreaming = params.stream === true;
            const payload = this.buildPayload(params);
            
            console.log('GMICloud请求参数:', JSON.stringify(payload, null, 2));
            
            const response = await this.callGMICloudAPI(payload);
            
            return this.handleOpenAIResponse(params, response, isStreaming);
        } catch (error) {
            console.error('GMICloud聊天完成失败:', error);
            throw error;
        }
    }

    /**
     * 创建流式聊天完成
     * @param {Object} params 聊天参数
     * @returns {Promise<Object>} 流式聊天完成响应
     */
    async createChatCompletionStream(params) {
        return this.createChatCompletion({ ...params, stream: true });
    }

    /**
     * 兼容方法 - 用于与其他提供商保持一致的接口
     * @param {Array} messages 消息数组
     * @param {Object} options 选项
     * @returns {Promise<Object>} 响应结果
     */
    async chat(messages, options = {}) {
        const params = {
            messages,
            ...options
        };
        
        const result = await this.createChatCompletion(params);
        
        // 如果是流式响应，直接返回
        if (options.stream) {
            return result;
        }
        
        // 返回内容字符串
        return {
            content: result.choices?.[0]?.message?.content || ''
        };
    }

    /**
     * 获取支持的模型列表
     * @returns {Array} 模型列表
     */
    async getModels() {
        return [
            {
                id: 'gpt-oss-120b',
                object: 'model',
                created: Date.now(),
                owned_by: 'gmicloud'
            },
            {
                id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
                object: 'model',
                created: Date.now(),
                owned_by: 'gmicloud'
            },
            {
                id: 'GLM-4.5-FP8',
                object: 'model',
                created: Date.now(),
                owned_by: 'gmicloud'
            },
            {
                id: 'DeepSeek-V3-0324',
                object: 'model',
                created: Date.now(),
                owned_by: 'gmicloud'
            }
        ];
    }

    /**
     * 检查是否支持指定模型
     * @param {string} model 模型名称
     * @returns {boolean} 是否支持
     */
    isSupportedModel(model) {
        const supportedModels = [
            'gpt-oss-120b',
            'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
            'GLM-4.5-FP8',
            'GLM-4.5-Air-FP8',
            'Kimi-K2-Instruct',
            'DeepSeek-V3-0324',
            'deepSeek-r1-0528',
            'Qwen/Qwen3-235B-A22B-Instruct-2507-FP8',
            'Qwen/Qwen3-32B-FP8',
            'Llama-3.3-70B-Instruct',
            'Llama-4-Maverick-17B-128E-Instruct-FP8',
            'Llama-4-Scout-17B-16E-Instruct',
            'Qwen/Qwen3-235B-A22B-Thinking-2507-FP8'
        ];
        return supportedModels.includes(model);
    }

    /**
     * 兼容方法 - 用于与其他提供商保持一致的接口
     * @param {Array} messages 消息数组
     * @param {Object} options 选项
     * @returns {Promise<Object>} 响应结果
     */
    async chat(messages, options = {}) {
        const params = {
            messages,
            ...options
        };
        
        const result = await this.createChatCompletion(params);
        
        // 如果是流式响应，直接返回
        if (options.stream) {
            return result;
        }
        
        // 返回内容字符串
        return {
            content: result.choices?.[0]?.message?.content || ''
        };
    }
}