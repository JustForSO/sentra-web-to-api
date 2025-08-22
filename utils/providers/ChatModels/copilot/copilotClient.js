import WebSocket from 'ws';
import axios from 'axios';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export async function copilot(messages, model) {
    try {
        const accessToken = process.env.COPILOT_ACCESS_TOKEN;
        const cookies = process.env.COPILOT_COOKIES ? JSON.parse(process.env.COPILOT_COOKIES) : {};
        
        if (!accessToken) {
            throw new Error("生成失败：未配置 Copilot Access Token，请检查 .env 文件。");
        }

        const copilotAPI = new CopilotClient(accessToken, cookies);
        const response = await copilotAPI.createCompletion(messages, model);
        
        return response;
    } catch (error) {
        console.error('Copilot API 调用错误:', error.message);
        throw new Error(`生成失败：${error.message}`);
    }
}

class CopilotClient {
    constructor(accessToken, cookies = {}) {
        this.accessToken = accessToken;
        this.cookies = cookies;
        this.baseUrl = 'https://copilot.microsoft.com';
        this.websocketUrl = 'wss://copilot.microsoft.com/c/api/chat?api-version=2';
        this.conversationUrl = `${this.baseUrl}/c/api/conversations`;
        
        this.headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        };
    }

    // 获取模型对应的模式
    getMode(model) {
        if (model.includes('Think') || model.includes('o1')) {
            return 'reasoning';
        } else if (model.includes('GPT-5') || model.includes('gpt-5') || model.includes('Smart')) {
            return 'smart';
        } else {
            return 'chat';
        }
    }

    // 格式化消息为prompt
    formatMessages(messages) {
        return messages.map(msg => {
            if (msg.role === 'user') {
                return msg.content;
            } else if (msg.role === 'assistant') {
                return `Assistant: ${msg.content}`;
            } else if (msg.role === 'system') {
                return `System: ${msg.content}`;
            }
            return msg.content;
        }).join('\n\n');
    }

    async createCompletion(messages, model) {
        try {
            // 验证用户身份
            const userResponse = await axios.get(`${this.baseUrl}/c/api/user`, {
                headers: this.headers
            });

            if (userResponse.status === 401) {
                throw new Error('无效的访问令牌');
            }

            const user = userResponse.data?.firstName;
            if (!user) {
                throw new Error('未找到用户信息，请先登录');
            }

            console.log(`Copilot 用户: ${user}`);

            // 创建新对话
            const conversationResponse = await axios.post(this.conversationUrl, {}, {
                headers: this.headers
            });

            const conversationId = conversationResponse.data?.id;
            if (!conversationId) {
                throw new Error('创建对话失败');
            }

            console.log(`Copilot 对话ID: ${conversationId}`);

            // 格式化消息
            const prompt = this.formatMessages(messages);
            const mode = this.getMode(model);

            console.log(`Copilot 模式: ${mode}`);

            // 建立WebSocket连接
            const wsUrl = `${this.websocketUrl}&accessToken=${encodeURIComponent(this.accessToken)}`;
            
            return new Promise((resolve, reject) => {
                const ws = new WebSocket(wsUrl, {
                    headers: {
                        'User-Agent': this.headers['User-Agent']
                    }
                });

                let responseText = '';
                let done = false;
                const timeout = setTimeout(() => {
                    if (!done) {
                        ws.close();
                        reject(new Error('请求超时'));
                    }
                }, 60000); // 60秒超时

                ws.on('open', () => {
                    console.log('Copilot WebSocket 连接已建立');
                    
                    const message = {
                        event: 'send',
                        conversationId: conversationId,
                        content: [{
                            type: 'text',
                            text: prompt
                        }],
                        mode: mode
                    };

                    ws.send(JSON.stringify(message));
                });

                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        
                        if (message.event === 'appendText') {
                            responseText += message.text || '';
                        } else if (message.event === 'replaceText') {
                            responseText = message.text || '';
                        } else if (message.event === 'done') {
                            done = true;
                            clearTimeout(timeout);
                            ws.close();
                            
                            if (responseText.trim()) {
                                resolve(responseText.trim());
                            } else {
                                reject(new Error('收到空响应'));
                            }
                        } else if (message.event === 'error') {
                            done = true;
                            clearTimeout(timeout);
                            ws.close();
                            reject(new Error(`Copilot 错误: ${message.message || '未知错误'}`));
                        }
                        // 忽略其他事件类型
                    } catch (error) {
                        console.error('解析 WebSocket 消息错误:', error);
                    }
                });

                ws.on('error', (error) => {
                    done = true;
                    clearTimeout(timeout);
                    reject(new Error(`WebSocket 错误: ${error.message}`));
                });

                ws.on('close', () => {
                    if (!done) {
                        done = true;
                        clearTimeout(timeout);
                        if (responseText.trim()) {
                            resolve(responseText.trim());
                        } else {
                            reject(new Error('连接意外关闭'));
                        }
                    }
                });
            });

        } catch (error) {
            console.error('Copilot API 错误:', error);
            throw error;
        }
    }
}
