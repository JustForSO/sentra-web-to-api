import fetch from 'node-fetch';
import { getProxyAgent } from '../../../requests/proxy.js';
import crypto from 'crypto';

class OperaAria {
    constructor(options = {}) {
        this.DEFAULT_HEADERS = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36 OPR/89.0.0.0'
        };

        this.API_ENDPOINT = "https://composer.opera-api.com/api/v1/a-chat";
        this.TOKEN_ENDPOINT = "https://oauth2.opera-api.com/oauth2/v1/token/";
        this.SIGNUP_ENDPOINT = "https://auth.opera.com/account/v2/external/anonymous/signup";
        this.UPLOAD_ENDPOINT = "https://composer.opera-api.com/api/v1/images/upload";
        this.CHECK_STATUS_ENDPOINT = "https://composer.opera-api.com/api/v1/images/check-status/";

        this.model_aliases = {
            "aria": "aria"
        };

        this.headers = options.headers || this.DEFAULT_HEADERS;
        this.apiEndpoint = options.apiEndpoint || this.API_ENDPOINT;
        this.modelAliases = options.modelAliases || this.model_aliases;
        this.availableModels = Object.keys(this.modelAliases);

        // 会话状态管理
        this.conversation = {
            accessToken: null,
            refreshToken: null,
            encryptionKey: null,
            expiresAt: 0,
            conversationId: null,
            isFirstRequest: true
        };
    }

    /**
     * 获取可用的模型列表
     * @returns {string[]} 可用模型别名的数组
     */
    getAvailableModels() {
        return this.availableModels;
    }

    /**
     * 生成32字节Base64编码的加密密钥
     * @returns {string} 加密密钥
     */
    generateEncryptionKey() {
        const randomBytes = crypto.randomBytes(32);
        return randomBytes.toString('base64');
    }

    /**
     * 生成Opera Aria格式的对话ID
     * @returns {string} 对话ID
     */
    generateConversationId() {
        const randomHex = (length) => {
            return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        };

        const parts = [
            randomHex(8),
            randomHex(4),
            '11f0',
            randomHex(4),
            randomHex(12)
        ];
        return parts.join('-');
    }

    /**
     * 检查令牌是否过期
     * @returns {boolean} 是否过期
     */
    isTokenExpired() {
        return Date.now() >= this.conversation.expiresAt;
    }

    /**
     * 更新访问令牌和过期时间
     * @param {string} accessToken 访问令牌
     * @param {number} expiresIn 过期时间（秒）
     */
    updateToken(accessToken, expiresIn) {
        this.conversation.accessToken = accessToken;
        this.conversation.expiresAt = Date.now() + (expiresIn - 60) * 1000; // 提前60秒过期
    }

    /**
     * 生成刷新令牌
     * @returns {Promise<string>} 刷新令牌
     */
    async generateRefreshToken() {
        const agent = getProxyAgent(this.TOKEN_ENDPOINT);

        // 第一步：获取匿名访问令牌
        const anonymousHeaders = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36 OPR/89.0.0.0",
            "Content-Type": "application/x-www-form-urlencoded",
        };

        const anonymousData = new URLSearchParams({
            "client_id": "ofa-client",
            "client_secret": "N9OscfA3KxlJASuIe29PGZ5RpWaMTBoy",
            "grant_type": "client_credentials",
            "scope": "anonymous_account"
        });

        const anonymousResponse = await fetch(this.TOKEN_ENDPOINT, {
            method: 'POST',
            headers: anonymousHeaders,
            body: anonymousData,
            ...(agent ? { agent } : {})
        });

        if (!anonymousResponse.ok) {
            throw new Error(`获取匿名令牌失败: ${anonymousResponse.status}`);
        }

        const anonymousTokenData = await anonymousResponse.json();
        const anonymousAccessToken = anonymousTokenData.access_token;

        // 第二步：注册匿名账户
        const signupHeaders = {
            "User-Agent": "Mozilla 5.0 (Linux; Android 14) com.opera.browser OPR/89.5.4705.84314",
            "Authorization": `Bearer ${anonymousAccessToken}`,
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
        };

        const signupData = {
            "client_id": "ofa",
            "service": "aria"
        };

        const signupResponse = await fetch(this.SIGNUP_ENDPOINT, {
            method: 'POST',
            headers: signupHeaders,
            body: JSON.stringify(signupData),
            ...(agent ? { agent } : {})
        });

        if (!signupResponse.ok) {
            throw new Error(`账户注册失败: ${signupResponse.status}`);
        }

        const signupResponseData = await signupResponse.json();
        const authToken = signupResponseData.token;

        // 第三步：获取最终的刷新令牌
        const finalHeaders = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36 OPR/89.0.0.0",
            "Content-Type": "application/x-www-form-urlencoded",
        };

        const finalData = new URLSearchParams({
            "auth_token": authToken,
            "client_id": "ofa",
            "device_name": "GPT4FREE",
            "grant_type": "auth_token",
            "scope": "ALL"
        });

        const finalResponse = await fetch(this.TOKEN_ENDPOINT, {
            method: 'POST',
            headers: finalHeaders,
            body: finalData,
            ...(agent ? { agent } : {})
        });

        if (!finalResponse.ok) {
            throw new Error(`获取刷新令牌失败: ${finalResponse.status}`);
        }

        const finalTokenData = await finalResponse.json();
        return finalTokenData.refresh_token;
    }

    /**
     * 获取访问令牌
     * @returns {Promise<string>} 访问令牌
     */
    async getAccessToken() {
        // 如果没有刷新令牌，先生成一个
        if (!this.conversation.refreshToken) {
            this.conversation.refreshToken = await this.generateRefreshToken();
        }

        // 如果访问令牌存在且未过期，直接返回
        if (this.conversation.accessToken && !this.isTokenExpired()) {
            return this.conversation.accessToken;
        }

        // 使用刷新令牌获取新的访问令牌
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36 OPR/89.0.0.0"
        };

        const data = new URLSearchParams({
            "client_id": "ofa",
            "grant_type": "refresh_token",
            "refresh_token": this.conversation.refreshToken,
            "scope": "shodan:aria user:read"
        });

        const agent = getProxyAgent(this.TOKEN_ENDPOINT);
        const response = await fetch(this.TOKEN_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: data,
            ...(agent ? { agent } : {})
        });

        if (!response.ok) {
            throw new Error(`刷新访问令牌失败: ${response.status}`);
        }

        const result = await response.json();
        this.updateToken(result.access_token, result.expires_in || 3600);
        return result.access_token;
    }

    /**
     * 格式化消息为提示词
     * @param {Array} messages 消息数组
     * @returns {string} 格式化后的提示词
     */
    formatPrompt(messages) {
        const formattedParts = [];
        
        for (const message of messages) {
            const role = message.role;
            const content = message.content;
            
            if (role === 'system') {
                formattedParts.push(`系统: ${content}`);
            } else if (role === 'user') {
                formattedParts.push(`用户: ${content}`);
            } else if (role === 'assistant') {
                formattedParts.push(`助手: ${content}`);
            }
        }
        
        return formattedParts.join('\n\n');
    }

    /**
     * 异步生成文本
     * @param {object} options 配置选项
     * @param {string} options.model 使用的模型别名
     * @param {array} options.messages 消息数组
     * @param {boolean} [options.stream=false] 是否流式传输
     * @returns {Promise<string>} 生成的文本内容
     * @throws {Error} 如果请求失败或API返回错误
     */
    async generateText(options) {
        const {
            model: modelAlias,
            messages,
            stream = false
        } = options;

        // 检查模型别名是否可用
        if (!this.availableModels.includes(modelAlias)) {
            throw new Error(`模型 "${modelAlias}" 不可用. 可用的模型有: ${this.availableModels.join(', ')}`);
        }

        // 获取访问令牌
        const accessToken = await this.getAccessToken();

        // 初始化加密密钥（如果是第一次请求）
        if (!this.conversation.encryptionKey) {
            this.conversation.encryptionKey = this.generateEncryptionKey();
        }

        // 构造请求头
        const headers = {
            "Accept": stream ? "text/event-stream" : "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Origin": "opera-aria://ui",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36 OPR/89.0.0.0",
            "X-Opera-Timezone": "+08:00",
            "X-Opera-UI-Language": "zh-CN"
        };

        // 构造请求体
        const requestBody = {
            "query": this.formatPrompt(messages),
            "stream": stream,
            "linkify": true,
            "linkify_version": 3,
            "sia": true,
            "media_attachments": [],
            "encryption": {
                "key": this.conversation.encryptionKey
            }
        };

        // 如果不是第一次请求且有对话ID，添加对话ID
        if (!this.conversation.isFirstRequest && this.conversation.conversationId) {
            requestBody.conversation_id = this.conversation.conversationId;
        }

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
                
                // 更新对话ID
                if (data.conversation_id) {
                    this.conversation.conversationId = data.conversation_id;
                }
                
                // 标记不再是第一次请求
                this.conversation.isFirstRequest = false;
                
                const content = data.message;
                if (!content) {
                    throw new Error('API 没有返回内容');
                }
                return content;
            }
        } catch (error) {
            console.error('Opera Aria文本生成过程中发生错误:', error);
            throw error;
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
                    
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6).trim();
                        
                        if (dataStr === '[DONE]') {
                            this.conversation.isFirstRequest = false;
                            resolve(fullContent);
                            return;
                        }
                        
                        if (dataStr) {
                            try {
                                const jsonData = JSON.parse(dataStr);
                                
                                if (jsonData.message) {
                                    fullContent += jsonData.message;
                                }
                                
                                if (jsonData.conversation_id) {
                                    this.conversation.conversationId = jsonData.conversation_id;
                                }
                            } catch (parseError) {
                                console.warn(`警告：无法解析JSON数据: ${dataStr}`);
                                continue;
                            }
                        }
                    }
                }
            });

            reader.on('end', () => {
                this.conversation.isFirstRequest = false;
                resolve(fullContent);
            });

            reader.on('error', (error) => {
                reject(error);
            });
        });
    }
}

export async function operaaria(messages, model) {
    try {
        const client = new OperaAria();
        const generatedText = await client.generateText({
            model,
            messages,
        });

        return generatedText;
    } catch (error) {
        return null;
    }
}
