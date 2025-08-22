import axios from 'axios';
import { randomUUID } from 'crypto';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export async function blackforest(messages, model) {
    try {
        const apiKey = process.env.BLACKFOREST_API_KEY;
        
        if (!apiKey) {
            throw new Error("生成失败：未配置 BlackForest API Key，请检查 .env 文件。");
        }

        const blackforestAPI = new BlackForestClient(apiKey);
        const response = await blackforestAPI.generateImage(messages, model);
        
        return response;
    } catch (error) {
        console.error('BlackForest API 调用错误:', error.message);
        throw new Error(`生成失败：${error.message}`);
    }
}

class BlackForestClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://black-forest-labs-flux-1-dev.hf.space';
        this.space = 'black-forest-labs/FLUX.1-dev';
        this.referer = `${this.baseUrl}/?__theme=light`;
        
        this.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': this.referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        };
    }

    // 从消息中提取图像生成提示
    extractPrompt(messages) {
        if (!messages || !Array.isArray(messages)) {
            throw new Error('无效的消息格式');
        }

        // 获取最后一条用户消息作为提示
        const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
        if (!lastUserMessage) {
            throw new Error('未找到用户消息');
        }

        return lastUserMessage.content;
    }

    // 获取ZeroGPU令牌
    async getZeroGpuToken(sessionHash) {
        try {
            const response = await axios.post(`${this.baseUrl}/gradio_api/queue/join?__theme=light`, {
                data: [],
                event_data: null,
                fn_index: 0,
                trigger_id: 1,
                session_hash: sessionHash
            }, {
                headers: this.headers
            });

            // 这里应该从响应中提取令牌，具体实现取决于API响应格式
            return this.apiKey; // 临时使用API Key作为令牌
        } catch (error) {
            console.error('获取ZeroGPU令牌失败:', error);
            return this.apiKey;
        }
    }

    // 使用宽高比设置图像尺寸
    useAspectRatio(aspectRatio = "1:1", width = null, height = null) {
        const aspectRatios = {
            "1:1": { width: 1024, height: 1024 },
            "16:9": { width: 1344, height: 768 },
            "9:16": { width: 768, height: 1344 },
            "4:3": { width: 1152, height: 896 },
            "3:4": { width: 896, height: 1152 },
            "21:9": { width: 1536, height: 640 },
            "9:21": { width: 640, height: 1536 }
        };

        if (width && height) {
            return { width, height };
        }

        return aspectRatios[aspectRatio] || aspectRatios["1:1"];
    }

    async generateImage(messages, model, options = {}) {
        try {
            const prompt = this.extractPrompt(messages);
            const sessionHash = randomUUID().replace(/-/g, '');
            const zerogpuUuid = "[object Object]";
            
            // 设置默认参数
            const {
                aspectRatio = "1:1",
                width = null,
                height = null,
                guidanceScale = 3.5,
                numInferenceSteps = 28,
                seed = 0,
                randomizeSeed = true
            } = options;

            const dimensions = this.useAspectRatio(aspectRatio, width, height);
            const zerogpuToken = await this.getZeroGpuToken(sessionHash);

            // 构建请求数据
            const data = [
                prompt,
                seed,
                randomizeSeed,
                dimensions.width,
                dimensions.height,
                guidanceScale,
                numInferenceSteps
            ];

            console.log(`BlackForest 生成图像: ${prompt}`);
            console.log(`尺寸: ${dimensions.width}x${dimensions.height}`);

            // 发送生成请求
            const generateHeaders = {
                ...this.headers,
                'X-Zerogpu-Token': zerogpuToken,
                'X-Zerogpu-Uuid': zerogpuUuid
            };

            const generateResponse = await axios.post(
                `${this.baseUrl}/gradio_api/queue/join?__theme=light`,
                {
                    data: data,
                    event_data: null,
                    fn_index: 2,
                    trigger_id: 4,
                    session_hash: sessionHash
                },
                {
                    headers: generateHeaders,
                    timeout: 60000
                }
            );

            const eventId = generateResponse.data?.event_id;
            if (!eventId) {
                throw new Error('未能获取事件ID');
            }

            // 监听生成结果
            const resultUrl = `${this.baseUrl}/gradio_api/queue/data?session_hash=${sessionHash}`;
            const eventResponse = await axios.get(resultUrl, {
                headers: {
                    'Accept': 'text/event-stream',
                    'Content-Type': 'application/json',
                    'Referer': this.referer
                },
                responseType: 'stream',
                timeout: 120000
            });

            return new Promise((resolve, reject) => {
                let buffer = '';
                const timeout = setTimeout(() => {
                    reject(new Error('图像生成超时'));
                }, 120000);

                eventResponse.data.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // 保留不完整的行

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const jsonData = JSON.parse(line.slice(6));
                                
                                if (jsonData?.msg === 'log') {
                                    console.log('BlackForest 状态:', jsonData.log);
                                }
                                
                                if (jsonData?.msg === 'progress') {
                                    if (jsonData.progress_data && jsonData.progress_data[0]) {
                                        const progress = jsonData.progress_data[0];
                                        console.log(`BlackForest 进度: ${progress.desc} ${progress.index}/${progress.length}`);
                                    }
                                }
                                
                                if (jsonData?.msg === 'process_completed') {
                                    clearTimeout(timeout);
                                    
                                    if (jsonData.output?.error) {
                                        const error = jsonData.output.error.split(" <a ")[0];
                                        reject(new Error(`BlackForest 错误: ${error}`));
                                        return;
                                    }
                                    
                                    if (jsonData.output?.data && jsonData.output.data.length > 0) {
                                        const imageUrl = jsonData.output.data[0]?.url;
                                        if (imageUrl) {
                                            resolve({
                                                url: imageUrl,
                                                prompt: prompt,
                                                dimensions: dimensions
                                            });
                                        } else {
                                            reject(new Error('未能获取生成的图像URL'));
                                        }
                                        return;
                                    }
                                    
                                    reject(new Error('未能获取生成结果'));
                                    return;
                                }
                            } catch (error) {
                                console.error('解析事件数据错误:', error);
                            }
                        }
                    }
                });

                eventResponse.data.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error(`流错误: ${error.message}`));
                });

                eventResponse.data.on('end', () => {
                    clearTimeout(timeout);
                    reject(new Error('流意外结束'));
                });
            });

        } catch (error) {
            console.error('BlackForest 图像生成错误:', error);
            throw error;
        }
    }
}
