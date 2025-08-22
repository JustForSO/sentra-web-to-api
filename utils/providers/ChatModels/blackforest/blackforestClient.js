import WebSocket from 'ws';
import { randomBytes } from 'crypto';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export async function blackforest(messages, model) {
    try {
        const apiKey = process.env.BLACKFOREST_API_KEY;
        const aspectRatio = process.env.BLACKFOREST_DEFAULT_ASPECT_RATIO || '1:1';
        const guidanceScale = parseFloat(process.env.BLACKFOREST_DEFAULT_GUIDANCE_SCALE || '3.5');
        const numInferenceSteps = parseInt(process.env.BLACKFOREST_DEFAULT_INFERENCE_STEPS || '28');

        if (!apiKey) {
            throw new Error("生成失败：未配置BlackForest API密钥，请检查 .env 文件。");
        }

        // 提取最后一条用户消息作为提示
        const prompt = messages.filter(msg => msg.role === 'user').pop()?.content;
        if (!prompt) {
            throw new Error("未找到用户消息");
        }

        // 解析宽高比
        const [width, height] = getImageDimensions(aspectRatio);
        
        // 生成随机种子
        const seed = Math.floor(Math.random() * 2147483647);

        console.log(`BlackForest Labs Flux-1-Dev 图像生成开始: ${prompt}`);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('图像生成超时'));
            }, 120000); // 2分钟超时

            const ws = new WebSocket('wss://black-forest-labs-flux-1-dev.hf.space/queue/join', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            ws.on('open', () => {
                console.log('WebSocket连接已建立');
                
                // 发送图像生成请求
                const requestData = {
                    "fn_index": 0,
                    "data": [
                        prompt,
                        seed,
                        true, // randomize_seed
                        width,
                        height,
                        guidanceScale,
                        numInferenceSteps
                    ],
                    "event_data": null,
                    "session_hash": generateSessionHash()
                };

                ws.send(JSON.stringify(requestData));
                console.log('图像生成请求已发送');
            });

            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    console.log('收到响应:', response.msg);

                    if (response.msg === 'process_completed') {
                        clearTimeout(timeout);
                        
                        if (response.output && response.output.data && response.output.data[0]) {
                            const imageData = response.output.data[0];
                            let imageUrl;
                            
                            if (typeof imageData === 'string') {
                                imageUrl = imageData;
                            } else if (imageData.url) {
                                imageUrl = imageData.url;
                            } else if (imageData.path) {
                                imageUrl = `https://black-forest-labs-flux-1-dev.hf.space/file=${imageData.path}`;
                            }
                            
                            if (imageUrl) {
                                console.log('图像生成完成:', imageUrl);
                                resolve(`![Generated Image](${imageUrl})`);
                            } else {
                                reject(new Error('无法获取生成的图像URL'));
                            }
                        } else {
                            reject(new Error('图像生成失败：响应数据格式错误'));
                        }
                        ws.close();
                    } else if (response.msg === 'estimation') {
                        console.log(`排队中，预计等待时间: ${response.rank}位，${response.queue_size}个任务`);
                    } else if (response.msg === 'process_starts') {
                        console.log('开始处理图像生成请求...');
                    } else if (response.msg === 'progress') {
                        if (response.progress_data && response.progress_data.length > 0) {
                            const progress = response.progress_data[0];
                            console.log(`生成进度: ${progress.index}/${progress.length}`);
                        }
                    }
                } catch (error) {
                    console.error('解析WebSocket消息失败:', error);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                console.error('WebSocket错误:', error);
                reject(new Error(`WebSocket连接错误: ${error.message}`));
            });

            ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                if (code !== 1000) {
                    console.error(`WebSocket连接关闭: ${code} - ${reason}`);
                    reject(new Error(`连接异常关闭: ${code}`));
                }
            });
        });

    } catch (error) {
        console.error("BlackForest API调用错误:", error.message);
        throw new Error(`图像生成失败: ${error.message}`);
    }
}

// 生成会话哈希
function generateSessionHash() {
    return randomBytes(16).toString('hex');
}

// 根据宽高比获取图像尺寸
function getImageDimensions(aspectRatio) {
    const ratioMap = {
        '1:1': [1024, 1024],
        '16:9': [1344, 768],
        '9:16': [768, 1344],
        '4:3': [1152, 896],
        '3:4': [896, 1152],
        '21:9': [1536, 640],
        '9:21': [640, 1536]
    };
    
    return ratioMap[aspectRatio] || ratioMap['1:1'];
}
