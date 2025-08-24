import fetch from 'node-fetch';
import { processStreamResponse } from '../../../requests/processStreamResponse.js';
import { getProxyAgent } from '../../../requests/proxy.js';

/**
 * 发送聊天请求并获取AI回复内容
 * @param {Array<{role: string, content: string}>} messages - 聊天消息数组
 * @param {string} model - AI模型标识符
 * @returns {Promise<string|null>} 返回AI回复文本，失败时返回null
 */
export const chdotat = async (messages, model) => {
    const API_URL = 'https://ch.at/v1/chat/completions';

    const requestConfig = {
        model,
        messages,
        stream: true
    };

    //console.log(requestConfig);
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Referer': 'https://ch.at',
        'User-Agent': [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'AppleWebKit/537.36 (KHTML, like Gecko)',
            'Chrome/131.0.0.0',
            'Safari/537.36',
            'Edg/131.0.0.0'
        ].join(' ')
    };

    try {
        const agent = getProxyAgent(API_URL);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestConfig),
            ...(agent ? { agent } : {})
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details available');
            return null;
        }

        const output = await processStreamResponse(response);
        return output.trim();
    } catch (error) {
        return null;
    }
};