import fetch from 'node-fetch';
import { getProxyAgent } from '../../../requests/proxy.js';
import crypto from 'crypto';

class GLM {
    constructor(options = {}) {
        this.DEFAULT_HEADERS = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        this.BASE_URL = "https://chat.z.ai";
        this.API_ENDPOINT = "https://chat.z.ai/api/chat/completions";
        this.AUTH_ENDPOINT = "https://chat.z.ai/api/v1/auths/";
        this.MODELS_ENDPOINT = "https://chat.z.ai/api/models";

        this.headers = options.headers || this.DEFAULT_HEADERS;
        this.apiEndpoint = options.apiEndpoint || this.API_ENDPOINT;
        
        // 缓存的API密钥和模型信息
        this.apiKey = null;
        this.modelAliases = {};
        this.availableModels = [];
        this.modelsLastFetched = 0;
        this.modelsCacheExpiry = 24 * 60 * 60 * 1000; // 24小时缓存
        
        this.defaultModel = 'GLM-4.5';
    }

    /**
     * 获取可用的模型列表
     * @returns {string[]} 可用模型别名的数组
     */
    getAvailableModels() {
        return this.availableModels;
    }

    /**
     * 生成UUID
     * @returns {string} UUID字符串
     */
    generateUUID() {
        return crypto.randomUUID();
    }

    /**
     * 获取API密钥和模型列表
     * @returns {Promise<void>}
     */
    async fetchModelsAndApiKey() {
        // 检查缓存是否过期
        const now = Date.now();
        if (this.apiKey && this.availableModels.length > 0 && 
            (now - this.modelsLastFetched) < this.modelsCacheExpiry) {
            return;
        }

        try {
            const agent = getProxyAgent(this.AUTH_ENDPOINT);
            
            // 第一步：获取API密钥
            const authResponse = await fetch(this.AUTH_ENDPOINT, {
                method: 'GET',
                headers: this.headers,
                ...(agent ? { agent } : {})
            });

            if (!authResponse.ok) {
                throw new Error(`获取API密钥失败: ${authResponse.status}`);
            }

            const authData = await authResponse.json();
            this.apiKey = authData.token;

            if (!this.apiKey) {
                throw new Error('未能获取到有效的API密钥');
            }

            // 第二步：获取模型列表
            const modelsResponse = await fetch(this.MODELS_ENDPOINT, {
                method: 'GET',
                headers: {
                    ...this.headers,
                    'Authorization': `Bearer ${this.apiKey}`
                },
                ...(agent ? { agent } : {})
            });

            if (!modelsResponse.ok) {
                throw new Error(`获取模型列表失败: ${modelsResponse.status}`);
            }

            const modelsData = await modelsResponse.json();
            console.log(modelsData.data)
            const models = modelsData.data || [];

            // 构建模型别名映射
            this.modelAliases = {};
            for (const model of models) {
                if (model.name && model.id) {
                    this.modelAliases[model.name] = model.id;
                }
            }

            this.availableModels = Object.keys(this.modelAliases);
            this.modelsLastFetched = now;

            console.log(`GLM: 成功获取 ${this.availableModels.length} 个模型`);

        } catch (error) {
            console.error('GLM: 获取模型和API密钥时发生错误:', error);
            // 如果获取失败，使用默认配置
            if (!this.availableModels.length) {
                this.modelAliases = { [this.defaultModel]: this.defaultModel };
                this.availableModels = [this.defaultModel];
            }
            throw error;
        }
    }

    /**
     * 获取模型ID
     * @param {string} modelName 模型名称
     * @returns {string} 模型ID
     */
    getModelId(modelName) {
        return this.modelAliases[modelName] || modelName;
    }

    /**
     * 解析SSE数据
     * @param {string} line SSE数据行
     * @returns {Object|null} 解析后的数据
     */
    parseSSEData(line) {
        if (!line.startsWith('data: ')) {
            return null;
        }

        const dataStr = line.substring(6).trim();
        if (!dataStr || dataStr === '[DONE]') {
            return null;
        }

        try {
            return JSON.parse(dataStr);
        } catch (error) {
            console.warn(`GLM: 无法解析SSE数据: ${dataStr}`);
            return null;
        }
    }

    /**
     * 处理流式响应
     * @param {Response} response 响应对象
     * @returns {Promise<string>} 完整的响应内容
     */
    async handleStreamResponse(response) {
        let fullContent = '';
        const reader = response.body;
        let buffer = '';

        return new Promise((resolve, reject) => {
            reader.on('data', (chunk) => {
                buffer += chunk.toString();
                
                while (buffer.includes('\n')) {
                    const lineEnd = buffer.indexOf('\n');
                    const line = buffer.substring(0, lineEnd).trim();
                    buffer = buffer.substring(lineEnd + 1);
                    
                    const data = this.parseSSEData(line);
                    if (!data) continue;

                    try {
                        // 处理不同类型的数据
                        if (data.type === 'chat:completion') {
                            const chatData = data.data || {};
                            
                            // 处理思考阶段的内容
                            if (chatData.phase === 'thinking') {
                                let deltaContent = chatData.delta_content;
                                if (deltaContent) {
                                    // 提取思考内容
                                    const parts = deltaContent.split('</summary>\n>');
                                    if (parts.length > 1) {
                                        deltaContent = parts[parts.length - 1];
                                    }
                                    if (deltaContent) {
                                        fullContent += deltaContent;
                                    }
                                }
                            } else {
                                // 处理编辑内容
                                if (chatData.edit_content) {
                                    const parts = chatData.edit_content.split('\n</details>\n');
                                    const content = parts[parts.length - 1];
                                    if (content) {
                                        fullContent += content;
                                    }
                                } else if (chatData.delta_content) {
                                    fullContent += chatData.delta_content;
                                }
                            }
                        }
                    } catch (parseError) {
                        console.warn(`GLM: 处理流式数据时发生错误:`, parseError);
                        continue;
                    }
                }
            });

            reader.on('end', () => {
                resolve(fullContent);
            });

            reader.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * 异步生成文本
     * @param {object} options 配置选项
     * @param {string} options.model 使用的模型别名
     * @param {array} options.messages 消息数组
     * @param {boolean} [options.stream=true] 是否流式传输
     * @returns {Promise<string>} 生成的文本内容
     * @throws {Error} 如果请求失败或API返回错误
     */
    async generateText(options) {
        const {
            model: modelAlias,
            messages,
            stream = true
        } = options;

        // 确保已获取模型和API密钥
        await this.fetchModelsAndApiKey();

        // 检查模型别名是否可用
        if (!this.availableModels.includes(modelAlias)) {
            throw new Error(`模型 "${modelAlias}" 不可用. 可用的模型有: ${this.availableModels.join(', ')}`);
        }

        // 获取模型ID
        const modelId = this.getModelId(modelAlias);

        // 构造请求体
        const requestBody = {
            "chat_id": "local",
            "id": this.generateUUID(),
            "stream": stream,
            "model": modelId,
            "messages": messages,
            "params": {},
            "tool_servers": [],
            "features": {
                "enable_thinking": true
            }
        };

        // 构造请求头
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${this.apiKey}`,
            "x-fe-version": "prod-fe-1.0.57"
        };

        try {
            const agent = getProxyAgent(this.apiEndpoint);
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                ...(agent ? { agent } : {})
            });

            if (!response.ok) {
                throw new Error(`HTTP 错误! 状态码: ${response.status}`);
            }

            if (stream) {
                // 流式处理
                return this.handleStreamResponse(response);
            } else {
                // 非流式处理
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) {
                    throw new Error('API 没有返回内容');
                }
                return content;
            }
        } catch (error) {
            console.error('GLM文本生成过程中发生错误:', error);
            throw error;
        }
    }
}

export async function glm(messages, model) {
    try {
        const client = new GLM();
        const generatedText = await client.generateText({
            model,
            messages,
        });

        return generatedText;
    } catch (error) {
        return null;
    }
}
