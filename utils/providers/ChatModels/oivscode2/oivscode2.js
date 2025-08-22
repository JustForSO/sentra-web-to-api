import fetch from 'node-fetch';
import { getProxyAgent } from '../../../requests/proxy.js';

class OIVSCodeSer2 {
    constructor(options = {}) {
        this.DEFAULT_HEADERS = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        this.API_ENDPOINT = "https://oi-vscode-server-2.onrender.com/v1/chat/completions";

        this.model_aliases = {
            "gpt-4o-mini": "gpt-4o-mini"
        };

        this.headers = options.headers || this.DEFAULT_HEADERS;
        this.apiEndpoint = options.apiEndpoint || this.API_ENDPOINT;
        this.modelAliases = options.modelAliases || this.model_aliases;
        this.availableModels = Object.keys(this.modelAliases);
    }

    /**
     * 生成随机用户ID
     * @param {number} length 用户ID长度，默认21位
     * @returns {string} 随机用户ID
     */
    generateUserId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * 获取可用的模型列表
     * @returns {string[]} 可用模型别名的数组
     */
    getAvailableModels() {
        return this.availableModels;
    }

    /**
     * 异步生成文本
     * @param {object} options 配置选项
     * @param {string} options.model 使用的模型别名
     * @param {array} options.messages 消息数组
     * @param {number} [options.temperature=0.7] 温度参数
     * @param {number} [options.max_tokens=2048] 最大令牌数
     * @returns {Promise<string>} 生成的文本内容
     * @throws {Error} 如果请求失败或API返回错误
     */
    async generateText(options) {
        const {
            model: modelAlias,
            messages,
            temperature = 0.7,
            max_tokens = 2048
        } = options;

        // 检查模型别名是否可用
        if (!this.availableModels.includes(modelAlias)) {
            throw new Error(`模型 "${modelAlias}" 不可用. 可用的模型有: ${this.availableModels.join(', ')}`);
        }

        // 将模型别名转换为实际的模型名称
        const model = this.modelAliases[modelAlias];

        // 生成随机用户ID
        const userid = this.generateUserId(21);

        // 构造请求体
        const requestBody = {
            messages,
            model,
            temperature,
            max_tokens,
            stream: false
        };

        try {
            const agent = getProxyAgent(this.apiEndpoint);
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    ...this.headers,
                    'userid': userid
                },
                body: JSON.stringify(requestBody),
                ...(agent ? { agent } : {})
            });

            if (!response.ok) {
                throw new Error(`HTTP 错误! 状态码: ${response.status}`);
            }

            const data = await response.json();

            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('API 没有返回内容');
            }
            return content;
        } catch (error) {
            console.error('文本生成过程中发生错误:', error);
            throw error;
        }
    }
}

export async function oivscode2(messages, model) {
    try {
        const client = new OIVSCodeSer2();
        const generatedText = await client.generateText({
            model,
            messages,
        });

        return generatedText;
    } catch (error) {
        return null;
    }
}
