import { EventEmitter } from 'events';
import { loadProviderEnv } from '../../loadEnv.js';
import { getProxyAgent } from '../../../requests/proxy.js';
import crypto from 'crypto';
import os from 'os';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export default class GptOssProvider extends EventEmitter {
    constructor() {
        super();
        this.name = 'gptoss';
        this.baseUrl = process.env.API_BASE_URL || 'https://chat-gpt-oss.com';
        this.sessionId = process.env.SESSION_ID || '';
        this.fingerprint = process.env.FINGERPRINT || '';
        this.reasoningEffort = process.env.GPTOSS_REASONING_EFFORT || 'high';
        this.verbosity = process.env.GPTOSS_VERBOSITY || 'high';
        this.isInitialized = false;
    }

    async chat(messages, options = {}) {
        const {
            model = 'gpt-oss-120b',
            stream = false,
            reasoning_effort = this.reasoningEffort,
            verbosity = this.verbosity
        } = options;

        if (!this.isInitialized || !this.sessionId || !this.fingerprint) {
            await this.initialize();
        }

        try {
            const conversationText = this.buildConversationText(messages);
            
            const payload = {
                conversation_id: null,
                model: model === 'gpt-5-nano' ? 'gpt-5-nano' : 'gpt-oss-120b',
                content: conversationText,
                reasoning_effort: reasoning_effort
            };

            if (model === 'gpt-5-nano') {
                payload.verbosity = verbosity;
            }

            const headers = {
                'accept': 'text/event-stream',
                'accept-language': 'zh-TW,zh;q=0.8',
                'content-type': 'application/json',
                'cookie': `guest_session_id=${this.sessionId}`,
                'origin': 'https://chat-gpt-oss.com',
                'referer': 'https://chat-gpt-oss.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                'x-fingerprint': this.fingerprint
            };

            if (stream) {
                return this.handleStream(payload, headers, model);
            } else {
                return this.handleNonStream(payload, headers, model);
            }

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async initialize() {
        // 生成指纹
        if (!this.fingerprint) {
            const fp = this.generateFingerprint();
            this.fingerprint = fp.visitorId;
        }

        // 获取会话
        if (!this.sessionId) {
            const session = await this.getSession();
            if (!session) {
                throw new Error('Failed to acquire guest_session_id');
            }
            this.sessionId = session;
        }

        this.isInitialized = true;
    }

    generateFingerprint() {
        // 模拟核心浏览器指纹组件（无需外部依赖）
        const components = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            language: 'zh-CN',
            platform: process.platform === 'win32' ? 'Win32' : process.platform,
            screenResolution: [1920, 1080],
            hardwareConcurrency: os.cpus()?.length || 4,
            timezone: (() => {
                try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch { return 'Asia/Shanghai'; }
            })(),
            canvas: crypto.createHash('md5').update(`canvas_${os.cpus()?.length || 4}`).digest('hex').slice(0, 16),
        };

        const componentsStr = JSON.stringify(components);
        const visitorId = crypto.createHash('sha256').update(componentsStr).digest('hex').slice(0, 20);

        return { visitorId, components, version: '4.6.2' };
    }

    async getSession() {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;

        const headers = {
            'content-type': 'application/json',
            'origin': 'https://chat-gpt-oss.com',
            'referer': 'https://chat-gpt-oss.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        };

        if (this.fingerprint) {
            headers['x-fingerprint'] = this.fingerprint;
        }

        const agent = getProxyAgent(this.baseUrl);

        try {
            const resp = await axiosInstance.get(
                `${this.baseUrl}/api/conversation/messages`,
                {
                    headers,
                    validateStatus: () => true,
                    ...(agent ? { httpsAgent: agent } : {}),
                }
            );

            const setCookie = resp.headers?.['set-cookie'];
            if (Array.isArray(setCookie)) {
                for (const c of setCookie) {
                    const m = c.match(/guest_session_id=([^;]+)/);
                    if (m) return m[1];
                }
            } else if (typeof setCookie === 'string') {
                const m = setCookie.match(/guest_session_id=([^;]+)/);
                if (m) return m[1];
            }

            return '';
        } catch (e) {
            this.emit('error', e);
            return '';
        }
    }

    buildConversationText(messages) {
        let conversationText = '';
        
        for (const msg of messages) {
            const role = msg.role || '';
            const content = msg.content || '';
            
            if (role === 'system') {
                conversationText += `System: ${content}\n`;
            } else if (role === 'user') {
                conversationText += `User: ${content}\n`;
            } else if (role === 'assistant') {
                conversationText += `Assistant: ${content}\n`;
            }
        }
        
        return conversationText.trim();
    }

    async handleStream(payload, headers, model) {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;
        
        const agent = getProxyAgent(this.baseUrl);
        const response = await axiosInstance.post(
            `${this.baseUrl}/api/message`,
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

            stream.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            if (data.content) {
                                content += data.content;
                                this.emit('data', {
                                    content: data.content,
                                    delta: { content: data.content }
                                });
                            }
                        } catch (e) {
                            // 忽略解析错误
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

    async handleNonStream(payload, headers, model) {
        const axios = await import('axios');
        const axiosInstance = axios.default || axios;
        
        const agent = getProxyAgent(this.baseUrl);
        const response = await axiosInstance.post(
            `${this.baseUrl}/api/message`,
            payload,
            {
                headers,
                responseType: 'stream',
                ...(agent ? { httpsAgent: agent } : {})
            }
        );

        let fullContent = '';
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            if (data.content) {
                                fullContent += data.content;
                            }
                        } catch (e) {
                            // 忽略解析错误
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
        return [
            {
                id: 'gpt-oss-120b',
                object: 'model',
                created: Date.now(),
                owned_by: 'chat-gpt-oss'
            },
            {
                id: 'gpt-5-nano',
                object: 'model',
                created: Date.now(),
                owned_by: 'chat-gpt-oss'
            }
        ];
    }

    isSupportedModel(model) {
        return ['gpt-oss-120b', 'gpt-5-nano'].includes(model);
    }
}
