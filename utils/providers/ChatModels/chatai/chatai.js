import { EventEmitter } from 'events';
import { loadProviderEnv } from '../../loadEnv.js';
import { getProxyAgent } from '../../../requests/proxy.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export default class ChataiProvider extends EventEmitter {
    constructor() {
        super();
        this.name = 'chatai';
        this.baseUrl = 'https://chatai.aritek.app';
        this.apiEndpoint = 'https://chatai.aritek.app/stream';
        this.userAgent = 'Dalvik/2.1.0 (Linux; U; Android 7.1.2; SM-G935F Build/N2G48H)';
        
        // 默认配置
        this.defaultModel = 'gpt-4o-mini-2024-07-18';
        this.modelAliases = {
            'gpt-4o-mini': this.defaultModel
        };
        
        this.staticMachineId = this.generateMachineId();
        this.cToken = "eyJzdWIiOiIyMzQyZmczNHJ0MzR0MzQiLCJuYW1lIjoiSm9objM0NTM0NT";
    }

    /**
     * 生成随机机器ID
     * @returns {string} 机器ID
     */
    generateMachineId() {
        const part1 = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
        const part2 = Array.from({ length: 25 }, () => {
            const chars = '0123456789.';
            return chars[Math.floor(Math.random() * chars.length)];
        }).join('');
        return `${part1}.${part2}`;
    }

    /**
     * 获取模型名称
     * @param {string} model 请求的模型名称
     * @returns {string} 实际使用的模型名称
     */
    getModel(model) {
        if (model in this.modelAliases || model === this.defaultModel) {
            return this.defaultModel;
        }
        return this.defaultModel; // 回退到默认模型
    }

    /**
     * 处理聊天请求
     * @param {Array} messages 消息数组
     * @param {Object} options 选项
     * @returns {Promise} 响应结果
     */
    async chat(messages, options = {}) {
        const {
            model = 'gpt-4o-mini',
            stream = false
        } = options;

        try {
            const selectedModel = this.getModel(model);
            
            const headers = {
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json',
                'User-Agent': this.userAgent,
                'Host': 'chatai.aritek.app',
                'Connection': 'Keep-Alive'
            };

            const payload = {
                machineId: this.staticMachineId,
                msg: messages,
                token: this.cToken,
                type: 0
            };

            if (stream) {
                return this.handleStream(payload, headers);
            } else {
                return this.handleNonStream(payload, headers);
            }

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * 处理流式响应
     * @param {Object} payload 请求载荷
     * @param {Object} headers 请求头
     * @returns {Promise} 流式响应
     */
    async handleStream(payload, headers) {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;
        
        const agent = getProxyAgent(this.apiEndpoint);
        const response = await axiosInstance.post(
            this.apiEndpoint,
            payload,
            {
                headers,
                responseType: 'stream',
                ...(agent ? { httpsAgent: agent } : {})
            }
        );

        return new Promise((resolve, reject) => {
            const stream = response.data;
            let content = '';
            let buffer = '';

            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                
                while (buffer.includes('\n')) {
                    const lineEnd = buffer.indexOf('\n');
                    const line = buffer.substring(0, lineEnd).trim();
                    buffer = buffer.substring(lineEnd + 1);
                    
                    if (line.startsWith('data:')) {
                        const dataStr = line.substring(5).trim();
                        
                        if (dataStr === '[DONE]') {
                            resolve({ content });
                            return;
                        }
                        
                        if (dataStr) {
                            try {
                                const chunkData = JSON.parse(dataStr);
                                const choices = chunkData.choices || [];
                                
                                if (choices.length > 0) {
                                    const delta = choices[0].delta || {};
                                    const contentChunk = delta.content;
                                    
                                    if (contentChunk) {
                                        content += contentChunk;
                                        this.emit('data', {
                                            content: contentChunk,
                                            delta: { content: contentChunk }
                                        });
                                    }
                                }
                            } catch (parseError) {
                                console.warn(`Warning: Could not decode JSON: ${dataStr}`);
                                continue;
                            }
                        }
                    }
                }
            });

            stream.on('end', () => {
                resolve({ content });
            });

            stream.on('error', (error) => {
                console.error(`Error during Chatai API request: ${error}`);
                reject(error);
            });
        });
    }

    /**
     * 处理非流式响应
     * @param {Object} payload 请求载荷
     * @param {Object} headers 请求头
     * @returns {Promise} 完整响应
     */
    async handleNonStream(payload, headers) {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;
        
        const agent = getProxyAgent(this.apiEndpoint);
        const response = await axiosInstance.post(
            this.apiEndpoint,
            payload,
            {
                headers,
                responseType: 'stream',
                ...(agent ? { httpsAgent: agent } : {})
            }
        );

        let fullContent = '';
        let buffer = '';
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                buffer += chunk.toString();
                
                while (buffer.includes('\n')) {
                    const lineEnd = buffer.indexOf('\n');
                    const line = buffer.substring(0, lineEnd).trim();
                    buffer = buffer.substring(lineEnd + 1);
                    
                    if (line.startsWith('data:')) {
                        const dataStr = line.substring(5).trim();
                        
                        if (dataStr === '[DONE]') {
                            resolve({ content: fullContent });
                            return;
                        }
                        
                        if (dataStr) {
                            try {
                                const chunkData = JSON.parse(dataStr);
                                const choices = chunkData.choices || [];
                                
                                if (choices.length > 0) {
                                    const delta = choices[0].delta || {};
                                    const contentChunk = delta.content;
                                    
                                    if (contentChunk) {
                                        fullContent += contentChunk;
                                    }
                                }
                            } catch (parseError) {
                                console.warn(`Warning: Could not decode JSON: ${dataStr}`);
                                continue;
                            }
                        }
                    }
                }
            });

            response.data.on('end', () => {
                resolve({ content: fullContent });
            });

            response.data.on('error', (error) => {
                console.error(`Error during Chatai API request: ${error}`);
                reject(error);
            });
        });
    }

    /**
     * 获取支持的模型列表
     * @returns {Array} 模型列表
     */
    async getModels() {
        const models = Object.keys(this.modelAliases).concat([this.defaultModel]);
        return [...new Set(models)].map(modelName => ({
            id: modelName,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'chatai'
        }));
    }

    /**
     * 检查是否支持指定模型
     * @param {string} model 模型名称
     * @returns {boolean} 是否支持
     */
    isSupportedModel(model) {
        return model in this.modelAliases || model === this.defaultModel;
    }
}
