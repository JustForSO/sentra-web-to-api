import { Readable } from 'stream';
import { TextDecoder } from 'util';
import { randomUUID } from 'crypto';
import { getProxyAgent } from '../../../requests/proxy.js';

export class Yuanbao {
    constructor({ uuid, prompt, model, ck, search, isImageModel }) {
        if (!ck) throw new Error('Cookie (ck) is required');
        this.uuid = uuid || randomUUID();
        this.prompt = prompt;
        this.model = model || 'gpt_175B_0404';
        this.cookie = ck;
        this.search = search;
        this.isImageModel = isImageModel || false; // 标识是否为图片生成模型
        this.url = `https://yuanbao.tencent.com/api/chat/${this.uuid}`;
        this.defaultHeaders = this.#getDefaultHeaders();
    }

    #getDefaultHeaders() {
        return {
            'accept': '*/*',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'content-type': 'text/plain;charset=UTF-8',
            'x-language': 'zh-CN',
            'x-platform': 'win',
            'x-source': 'web',
            'x-instance-id': '5',
            'x-requested-with': 'XMLHttpRequest',
            'x-os_version': 'Windows(10)-Blink',
            'Referer': 'https://yuanbao.tencent.com/chat/naQivTmsDa',
            'cookie': this.cookie
        };
    }

    #getRequestBody() {
        console.log(`[Yuanbao] 生成请求体 - isImageModel: ${this.isImageModel}, model: ${this.model}`);
        
        // 图片生成模型的特殊处理
        if (this.isImageModel) {
            const imagePrompt = this.prompt.startsWith('帮我画一张图片：') ? this.prompt : `帮我画一张图片：${this.prompt}`;
            console.log(`[Yuanbao] 图片模型请求 - 原始提示: ${this.prompt}`);
            console.log(`[Yuanbao] 图片模型请求 - 处理后提示: ${imagePrompt}`);
            
            const requestBody = {
                model: "gpt_175B_0404",
                prompt: imagePrompt,
                plugin: 'ImageHelper',
                displayPrompt: imagePrompt,
                displayPromptType: 1,
                options: {
                    imageIntention: {
                        needIntentionModel: true,
                        backendUpdateFlag: 2,
                        userIntention: {
                            style: "默认风格"
                        },
                        intentionStatus: true
                    }
                },
                displayImageIntentionLabels: [{
                    type: "style",
                    disPlayValue: "默认风格",
                    startIndex: 0,
                    endIndex: 4
                }],
                multimedia: [],
                agentId: 'naQivTmsDa',
                supportHint: 1,
                extReportParams: null,
                isAtomInput: false,
                version: 'v2',
                chatModelId: this.model,
                applicationIdList: [],
                supportFunctions: ["closeInternetSearch"]
            };
            
            console.log(`[Yuanbao] 图片模型请求体:`, JSON.stringify(requestBody, null, 2));
            return requestBody;
        }
        
        // 普通聊天模型的请求体
        const requestBody = {
            model: "gpt_175B_0404",
            prompt: this.prompt,
            plugin: 'Adaptive',
            displayPrompt: this.prompt,
            displayPromptType: 1,
            options: {
                imageIntention: {
                    needIntentionModel: true,
                    backendUpdateFlag: 2,
                    intentionStatus: true
                }
            },
            multimedia: [],
            agentId: 'naQivTmsDa',
            supportHint: 1,
            version: 'v2',
            chatModelId: this.model,
            ...(this.search && { supportFunctions: ["supportInternetSearch"] })
        };
        
        console.log(`[Yuanbao] 普通模型请求体:`, JSON.stringify(requestBody, null, 2));
        return requestBody;
    }

    async #processSSEStream(response) {
        const thinkContent = [];
        const textContent = [];
        let imageMarkdown = '';
        let buffer = '';
        const stream = Readable.from(response.body);
        const decoder = new TextDecoder('utf-8');

        for await (const chunk of stream) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.slice(5).trim();
                    if (data === '[DONE]') {
                        return { thinkContent, textContent, imageMarkdown };
                    }
                    if (data.startsWith('[')) continue;

                    try {
                        const json = JSON.parse(data);
                        if (json.type === 'think' && json.content) {
                            thinkContent.push(json.content);
                        } else if (json.type === 'text' && json.msg) {
                            textContent.push(json.msg);
                        } else if (json.type === 'image' && json.imageUrlHigh) {
                            const imageIndex = thinkContent.length + textContent.length;
                            imageMarkdown += `![Image ${imageIndex}](${json.imageUrlHigh})\n`;
                        }
                    } catch (e) {
                        console.warn(`Skipping invalid JSON: ${data}`);
                    }
                }
            }
        }

        if (buffer.startsWith('data:')) {
            const data = buffer.slice(5).trim();
            if (data !== '[DONE]') {
                try {
                    const json = JSON.parse(data);
                    if (json.type === 'think' && json.content) {
                        thinkContent.push(json.content);
                    } else if (json.type === 'text' && json.msg) {
                        textContent.push(json.msg);
                    } else if (json.type === 'image' && json.imageUrlHigh) {
                        const imageIndex = thinkContent.length + textContent.length;
                        imageMarkdown += `![Image ${imageIndex}](${json.imageUrlHigh})\n`;
                    }
                } catch (e) {
                    console.warn(`Skipping invalid JSON in final buffer: ${data}`);
                }
            }
        }

        return { thinkContent, textContent, imageMarkdown };
    }

    async makeRequest() {
        try {
            console.log('Request URL:', this.url);
            console.log('Request Headers:', this.defaultHeaders);
            console.log('Request Body:', JSON.stringify(this.#getRequestBody()));

            // 代理支持：自动读取 AI_PROXY_URL/HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 和 NO_PROXY
            const agent = getProxyAgent(this.url);
            const response = await fetch(this.url, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify(this.#getRequestBody()),
                ...(agent ? { agent } : {})
            });

            console.log('Response Status:', response.status);
            console.log('Response Headers:', Object.fromEntries(response.headers));

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const { thinkContent, textContent, imageMarkdown } = await this.#processSSEStream(response);
            const thinking = `<think>\n${thinkContent.join('')}\n</think>\n\n`;
            const text = textContent.join('');
            const images = imageMarkdown ? imageMarkdown : '';
            console.log(imageMarkdown)
            console.log(images)
            return {
                output: thinking + text + images,
                ck: this.cookie,
                convId: this.uuid
            };
        } catch (error) {
            console.error('Request failed:', error.message);
            throw error;
        }
    }
}