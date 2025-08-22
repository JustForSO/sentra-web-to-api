import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import { loadProviderEnv } from '../../loadEnv.js';
import { random_safe } from '../../../requests/safeurl.js';
import readline from 'readline';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

function containsChinese(str) {
    return /\p{Script=Han}/u.test(str);
}

/**
 * 流式优化提示词
 * @param {string} prompt 
 * @param {string} m_session_id 
 * @returns {Promise<string>}
 */
async function streamPromptText(prompt, m_session_id) {
    const headers = {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'cookie': `m_session_id=${m_session_id}`,
        'x-modelscope-accept-language': 'zh_CN',
        'Referer': random_safe('aHR0cHM6Ly9tb2RlbHNjb3BlLmNuL2FpZ2MvaW1hZ2VHZW5lcmF0aW9uP3RhYj1hZHZhbmNlZA=='),
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    let result = '';

    try {
        const res = await fetch(`${random_safe('aHR0cHM6Ly9tb2RlbHNjb3BlLmNuL2FwaS92MS9tdXNlL3Rvb2wvb3B0aW1pemVQcm9tcHRTdHJlYW0/cG9zaXRpdmU9dHJ1ZSZwcm9tcHQ9')}${encodeURIComponent(prompt)}&stableDiffusionVersion=SD_XL`, { headers });

        if (!res.ok) {
            console.warn(`请求失败: HTTP ${res.status}`);
            return prompt;
        }

        const rl = readline.createInterface({
            input: res.body,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (line.startsWith('data:')) {
                try {
                    const payload = JSON.parse(line.slice(5).trim());
                    if (payload.text) {
                        result += payload.text;
                    }
                } catch (err) {
                    // 忽略单行解析错误
                }
            }
        }
    } catch (error) {
        console.warn('流处理异常:', error.message);
        return prompt;
    }
    return result.trim() ? result : prompt;
}

async function enhancement(prompt) {
    const headers = {
        "accept": "*/*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "content-type": "application/json",
        "x-anonymous-id": randomUUID(),
        "Referer": random_safe('aHR0cHM6Ly9rdXNhLnBpY3Mv'),
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    try {
        const response = await fetch(random_safe('aHR0cHM6Ly9rdXNhLnBpY3MvYXBpL3Byb21wdC1lbmhhbmNlbWVudA=='), {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                prompt: prompt
            })
        });

        if (!response.ok) {
            console.error(`HTTP 错误！状态码: ${response.status}`);
            try {
                const errorBodyText = await response.text();
                console.error("错误响应体:", errorBodyText);
            } catch (e) {
                console.error("无法读取错误响应体:", e);
            }
            return prompt;
        }

        const responseData = await response.json();
        if (responseData?.enhanced_prompt) {
            return responseData.enhanced_prompt;
        } else {
            return prompt;
        }

    } catch (error) {
        return prompt;
    }
}

export async function modelscope(messages, model) {
    try {
        // 从环境变量读取配置
        const m_session_id = process.env.MODELSCOPE_SESSION_ID;
        const checkpointModelVersionId = parseInt(process.env.MODELSCOPE_CHECKPOINT_MODEL_VERSION_ID || '97167');
        const sampler = process.env.MODELSCOPE_SAMPLER || 'Euler';
        const guidanceScale = parseFloat(process.env.MODELSCOPE_GUIDANCE_SCALE || '6');
        const modelName = process.env.MODELSCOPE_MODEL_NAME || 'R-ESRGAN 4x+ Anime 6B';
        const loraModelVersionId = process.env.MODELSCOPE_LORA_MODEL_VERSION_ID || null;
        const loraScale = parseFloat(process.env.MODELSCOPE_LORA_SCALE || '0.8');
        const loraEnable = process.env.MODELSCOPE_LORA_ENABLE === 'true';
        const width = parseInt(process.env.MODELSCOPE_WIDTH || '1024');
        const height = parseInt(process.env.MODELSCOPE_HEIGHT || '1440');
        const numInferenceSteps = parseInt(process.env.MODELSCOPE_NUM_INFERENCE_STEPS || '30');
        const scale = parseFloat(process.env.MODELSCOPE_SCALE || '2');
        const negativePrompt = process.env.MODELSCOPE_NEGATIVE_PROMPT || 'text,username,logo,low quality,worst quality,bad anatomy,inaccurate limb,bad composition,inaccurate eyes,extra digit,fewer digits,(extra arms:1.2),furry,artist_name,weibo_username,weibo_logo,twitter_username,twitter_logo,patreon_username,multiple views,censored,bar censor,multiple view,mosaic censoring,pointless censoring,artist name,heart censor,signature,dated,lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry';

        if (!m_session_id) {
            throw new Error("生成失败：未配置ModelScope Session ID，请检查 .env 文件。");
        }

        // 提取最后一条用户消息作为提示
        let prompt = messages.filter(msg => msg.role === 'user').pop()?.content;
        if (!prompt) {
            throw new Error("未找到用户消息");
        }

        // 如果包含中文，进行提示词优化
        if (containsChinese(prompt)) {
            prompt = await enhancement(prompt) || await streamPromptText(`safe, ${prompt}`, m_session_id);
        }
        console.log('优化提示词：', prompt);

        // 配置LoRA参数
        const loraArgs = (loraEnable && loraModelVersionId && loraScale) ? [
            {
                modelVersionId: parseInt(loraModelVersionId),
                scale: loraScale
            }
        ] : [];
        console.log('使用LoRA：', loraArgs);

        // 构建请求体
        const requestBody = {
            modelArgs: {
                checkpointModelVersionId: checkpointModelVersionId,
                loraArgs: loraArgs,
                checkpointShowInfo: model
            },
            promptArgs: {
                prompt,
                negativePrompt: negativePrompt
            },
            basicDiffusionArgs: {
                sampler: sampler,
                guidanceScale: guidanceScale,
                seed: -1,
                numInferenceSteps: numInferenceSteps,
                numImagesPerPrompt: 1,
                width: width,
                height: height
            },
            adetailerArgsMap: {},
            hiresFixFrontArgs: {
                modelName: modelName,
                scale: scale
            },
            predictType: 'TXT_2_IMG',
            controlNetFullArgs: []
        };
        
        console.log('ModelScope请求体:', JSON.stringify(requestBody, null, 2));

        // 提交任务
        const submitResponse = await fetch(random_safe('aHR0cHM6Ly9tb2RlbHNjb3BlLmNuL2FwaS92MS9tdXNlL3ByZWRpY3QvdGFzay9zdWJtaXQ='), {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': `m_session_id=${m_session_id}`,
                'x-modelscope-accept-language': 'zh_CN',
                'Referer': random_safe('aHR0cHM6Ly9tb2RlbHNjb3BlLmNuL2FpZ2MvaW1hZ2VHZW5lcmF0aW9uP3RhYj1hZHZhbmNlZA=='),
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            },
            body: JSON.stringify(requestBody)
        });

        const submitData = await submitResponse.json();
        console.log('ModelScope提交响应:', JSON.stringify(submitData, null, 2));
        
        if (!submitData.Success || submitData.Code !== 200) {
            throw new Error('任务提交失败: ' + (submitData.Message || '未知错误'));
        }

        if (!submitData.Data || !submitData.Data.data || !submitData.Data.data.recordId) {
            console.error('响应数据结构异常:', submitData);
            throw new Error('任务提交失败: 响应数据中缺少recordId');
        }

        const taskId = submitData.Data.data.recordId;
        console.log('ModelScope任务提交成功，taskId:', taskId);

        // 查询状态
        const maxAttempts = 50;
        const interval = 5000;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
            const statusResponse = await fetch(`${random_safe('aHR0cHM6Ly9tb2RlbHNjb3BlLmNuL2FwaS92MS9tdXNlL3ByZWRpY3QvdGFzay9zdGF0dXM/dGFza0lkPQ==')}${taskId}`, {
                method: 'GET',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'cookie': `m_session_id=${m_session_id}`,
                    'x-modelscope-accept-language': 'zh_CN'
                }
            });

            const statusData = await statusResponse.json();
            if (!statusData.Success || statusData.Code !== 200) {
                throw new Error('状态查询失败: ' + statusData.Message);
            }

            const status = statusData.Data.data.status;
            console.log(`ModelScope第 ${attempts + 1} 次查询，状态: ${status}`);

            if (status === 'SUCCEED') {
                const imageUrl = statusData.Data.data.predictResult.images[0].imageUrl;
                console.log('ModelScope图像生成完成:', imageUrl);
                return `![Generated Image](${imageUrl})`;
            }

            if (status === 'FAILED') {
                throw new Error('任务失败: ' + statusData.Data.data.errorMsg);
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new Error('任务超时，未在最大轮询次数内完成');
    } catch (error) {
        console.error('ModelScope API调用错误:', error.message);
        throw new Error(`图像生成失败: ${error.message}`);
    }
}
