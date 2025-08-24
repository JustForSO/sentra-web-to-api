import { EventEmitter } from 'events';
import { loadProviderEnv } from '../../loadEnv.js';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { getProxyAgent } from '../../../requests/proxy.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export default class HighlightProvider extends EventEmitter {
    constructor() {
        super();
        this.name = 'highlight';
        this.baseUrl = process.env.HIGHLIGHT_BASE_URL || 'https://chat-backend.highlightai.com';
        this.refreshToken = process.env.HIGHLIGHT_REFRESH_TOKEN || '';
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Highlight/1.3.61 Chrome/132.0.6834.210 Electron/34.5.8 Safari/537.36';
        
        // 内存中缓存
        this.accessToken = null;
        this.tokenExpiry = 0;
        this.modelsCache = new Map();
        this.modelsCacheExpiry = 0;
        
        // 加密相关常量
        this.Hr = {
            r: [87, 78, 72, 56, 79, 48, 122, 79, 107, 104, 82, 119, 51, 100, 78, 90, 85, 85, 69, 107, 90, 116, 87, 48, 108,
                53, 83, 84, 70, 81, 121, 69],
            m: [27, 26, 25, 22, 24, 21, 17, 12, 30, 19, 20, 14, 31, 8, 18, 10, 13, 5, 29, 7, 16, 6, 28, 23, 9, 15, 4, 0, 11,
                2, 3, 1]
        };
        
        this.jr = {
            r: [87, 90, 109, 107, 53, 105, 81, 89, 103, 107, 68, 49, 68, 105, 106, 77, 49, 106, 53, 78, 77, 78, 106, 106, 61,
                77, 89, 51, 66, 79, 86, 89, 106, 65, 106, 52, 89, 77, 87, 106, 89, 122, 78, 90, 65, 89, 50, 105, 61, 90, 106,
                66, 48, 53, 71, 89, 87, 52, 81, 84, 78, 90, 74, 78, 103, 50, 70, 79, 51, 50, 50, 77, 122, 108, 84, 81, 120,
                90, 89, 89, 89, 79, 119, 122, 121, 108, 69, 77],
            m: [65, 20, 1, 6, 31, 63, 74, 12, 85, 78, 33, 3, 41, 19, 45, 52, 75, 21, 23, 16, 56, 36, 5, 71, 87, 68, 72, 15,
                18, 32, 82, 8, 17, 54, 83, 35, 28, 48, 49, 77, 30, 25, 10, 38, 22, 50, 29, 11, 86, 64, 57, 70, 47, 67, 81, 44,
                61, 7, 58, 13, 84, 76, 42, 24, 46, 37, 62, 80, 27, 51, 73, 34, 69, 39, 53, 2, 79, 60, 26, 0, 66, 40, 55, 9,
                59, 43, 14, 4]
        };
    }

    // 加密相关辅助函数
    Ah(n, e) {
        const t = new Array(n.length);
        for (let s = 0; s < e.length; s++) {
            t[e[s]] = n[s];
        }
        return t;
    }

    Fl(n, e) {
        const t = this.Ah(n, e);
        const s = String.fromCharCode(...t);
        const o = Buffer.from(s, 'base64');
        const i = Array.from(new Uint8Array(o)).reverse();
        return Buffer.from(i).toString('utf8');
    }

    async Th(n) {
        const saltString = this.Fl(this.Hr.r, this.Hr.m);
        const salt = CryptoJS.enc.Utf8.parse(saltString);
        
        // 使用 crypto-js 实现 PBKDF2
        const key = CryptoJS.PBKDF2(n, salt, {
            keySize: 32 / 4, // 32 bytes = 8 words
            iterations: 100000,
            hasher: CryptoJS.algo.SHA256
        });
        
        // 转换为 Uint8Array
        const keyBytes = [];
        for (let i = 0; i < key.words.length; i++) {
            const word = key.words[i];
            keyBytes.push((word >>> 24) & 0xff);
            keyBytes.push((word >>> 16) & 0xff);
            keyBytes.push((word >>> 8) & 0xff);
            keyBytes.push(word & 0xff);
        }
        
        return new Uint8Array(keyBytes);
    }

    async kh(n, fixedIv) {
        const e = await this.Th(n.userId);
        const t = fixedIv || crypto.randomBytes(16);
        
        const data = {
            ...n,
            apiKey: this.Fl(this.jr.r, this.jr.m)
        };
        
        const jsonStr = JSON.stringify(data);
        
        // 转换密钥为 CryptoJS 格式
        const keyWords = [];
        for (let i = 0; i < e.length; i += 4) {
            const word = (e[i] << 24) | (e[i + 1] << 16) | (e[i + 2] << 8) | e[i + 3];
            keyWords.push(word);
        }
        const key = CryptoJS.lib.WordArray.create(keyWords, e.length);
        
        // 转换 IV 为 CryptoJS 格式
        const ivArray = Array.isArray(t) ? t : Array.from(t);
        const ivWords = [];
        for (let i = 0; i < ivArray.length; i += 4) {
            const word = (ivArray[i] << 24) | (ivArray[i + 1] << 16) | (ivArray[i + 2] << 8) | ivArray[i + 3];
            ivWords.push(word);
        }
        const iv = CryptoJS.lib.WordArray.create(ivWords, ivArray.length);
        
        // 使用 crypto-js 进行 AES-CBC 加密
        const encrypted = CryptoJS.AES.encrypt(jsonStr, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        
        const tHex = Buffer.from(ivArray).toString('hex');
        const encryptedHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
        
        return `${tHex}:${encryptedHex}`;
    }

    H7t(t = 12) {
        return crypto.randomBytes(t).toString('hex');
    }

    async getIdentifier(userId, clientUUID, fixedIv) {
        const t = await this.kh({ userId, clientUUID }, fixedIv);
        return `${this.H7t()}:${t}`;
    }


    // 刷新访问令牌
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('HIGHLIGHT_REFRESH_TOKEN must be configured in .env file');
        }
        
        const agent = getProxyAgent(this.baseUrl);
        const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
            ...(agent ? { agent } : {})
        });
        
        if (!response.ok) {
            throw new Error("无法刷新access token");
        }
        
        const respJson = await response.json();
        if (!respJson.success) {
            throw new Error("刷新access token失败");
        }
        
        const newAccessToken = respJson.data.accessToken;
        this.accessToken = newAccessToken;
        this.tokenExpiry = Date.now() + 3600000; // 1小时后过期
        
        return newAccessToken;
    }

    // 获取有效的访问令牌
    async getAccessToken() {
        // 检查token是否过期
        if (!this.accessToken || Date.now() >= this.tokenExpiry - 60000) { // 提前1分钟刷新
            await this.refreshAccessToken();
        }
        
        return this.accessToken;
    }

    // 获取模型列表
    async fetchModels() {
        const accessToken = await this.getAccessToken();
        const agent = getProxyAgent(this.baseUrl);
        
        const response = await fetch(`${this.baseUrl}/api/v1/models`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': this.userAgent,
            },
            ...(agent ? { agent } : {})
        });
        
        if (!response.ok) {
            throw new Error("获取模型列表失败");
        }
        
        const respJson = await response.json();
        if (!respJson.success) {
            throw new Error("获取模型数据失败");
        }
        
        this.modelsCache.clear();
        for (const model of respJson.data) {
            this.modelsCache.set(model.name, {
                id: model.id,
                name: model.name,
                provider: model.provider,
                isFree: model.pricing?.isFree || false,
            });
        }
        
        this.modelsCacheExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24小时后过期
        return this.modelsCache;
    }

    // 格式化消息为提示词
    formatMessagesToPrompt(messages) {
        const formattedMessages = [];
        for (const message of messages) {
            if (message.role && message.content) {
                if (Array.isArray(message.content)) {
                    for (const item of message.content) {
                        formattedMessages.push(`${message.role}: ${item.text || item.content || ''}`);
                    }
                } else {
                    formattedMessages.push(`${message.role}: ${message.content}`);
                }
            }
        }
        return formattedMessages.join('\n\n');
    }

    async chat(messages, options = {}) {
        const {
            model = 'gpt-4o',
            stream = false
        } = options;

        try {
            // 确保有访问令牌
            const accessToken = await this.getAccessToken();
            
            // 获取模型信息
            if (this.modelsCache.size === 0 || Date.now() >= this.modelsCacheExpiry) {
                await this.fetchModels();
            }
            
            const modelInfo = this.modelsCache.get(model);
            if (!modelInfo) {
                throw new Error(`Model '${model}' not found`);
            }
            
            // 格式化消息
            const prompt = this.formatMessagesToPrompt(messages);
            // 使用固定的用户ID和客户端UUID（简化处理）
            const identifier = await this.getIdentifier('user123', 'client123');
            
            const highlightData = {
                prompt: prompt,
                attachedContext: [],
                modelId: modelInfo.id,
                additionalTools: [],
                backendPlugins: [],
                useMemory: false,
                useKnowledge: false,
                ephemeral: false,
                timezone: "Asia/Hong_Kong",
            };
            
            const headers = {
                "accept": "*/*",
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": "zh-CN",
                "authorization": `Bearer ${accessToken}`,
                "content-type": "application/json",
                "user-agent": this.userAgent,
                "identifier": identifier
            };

            if (stream) {
                return this.handleStream(highlightData, headers);
            } else {
                return this.handleNonStream(highlightData, headers);
            }

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async handleStream(highlightData, headers) {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;
        
        const agent = getProxyAgent(this.baseUrl);
        const response = await axiosInstance.post(
            `${this.baseUrl}/api/v1/chat`,
            highlightData,
            {
                headers,
                responseType: 'stream',
                ...(agent ? { httpsAgent: agent } : {})
            }
        );

        return new Promise((resolve, reject) => {
            const stream = response.data;
            //console.log(stream)
            let content = '';
            let buffer = '';

            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                
                while (buffer.includes('\n')) {
                    const lineEnd = buffer.indexOf('\n');
                    const line = buffer.substring(0, lineEnd);
                    buffer = buffer.substring(lineEnd + 1);
                    
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6).trim();
                        if (data) {
                            try {
                                const eventData = JSON.parse(data);
                                if (eventData.type === 'text' && eventData.content) {
                                    content += eventData.content;
                                    this.emit('data', {
                                        content: eventData.content,
                                        delta: { content: eventData.content }
                                    });
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            });

            stream.on('end', () => {
                resolve({ content });
            });

            stream.on('error', reject);
        });
    }

    async handleNonStream(highlightData, headers) {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;
        
        const agent = getProxyAgent(this.baseUrl);
        const response = await axiosInstance.post(
            `${this.baseUrl}/api/v1/chat`,
            highlightData,
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
                    const line = buffer.substring(0, lineEnd);
                    buffer = buffer.substring(lineEnd + 1);
                    
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6).trim();
                        if (data) {
                            try {
                                const eventData = JSON.parse(data);
                                if (eventData.type === 'text' && eventData.content) {
                                    fullContent += eventData.content;
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            });

            response.data.on('end', () => {
                resolve({ content: fullContent });
            });

            response.data.on('error', reject);
        });
    }

    async getModels() {
        if (this.modelsCache.size === 0 || Date.now() >= this.modelsCacheExpiry) {
            await this.fetchModels();
        }
        
        return Array.from(this.modelsCache.entries()).map(([modelName, modelInfo]) => ({
            id: modelName,
            object: 'model',
            created: Date.now(),
            owned_by: modelInfo.provider
        }));
    }

    isSupportedModel(model) {
        return this.modelsCache.has(model);
    }
}
