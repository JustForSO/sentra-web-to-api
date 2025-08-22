import fetch from 'node-fetch';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export async function kusa(messages, model) {
    try {
        // 从环境变量读取配置
        const authorization = process.env.KUSA_AUTHORIZATION;
        const width = parseInt(process.env.KUSA_WIDTH || '2048');
        const height = parseInt(process.env.KUSA_HEIGHT || '2048');
        const styleId = process.env.KUSA_STYLE_ID || '40';
        const amount = parseInt(process.env.KUSA_AMOUNT || '1');
        const cookie = process.env.KUSA_COOKIE || '';

        if (!authorization) {
            throw new Error("生成失败：未配置Kusa授权令牌，请检查 .env 文件。");
        }

        // 提取最后一条用户消息作为提示
        const prompt = messages.filter(msg => msg.role === 'user').pop()?.content;
        if (!prompt) {
            throw new Error("未找到用户消息");
        }

        console.log(`Kusa图像生成开始: ${prompt}`);

        // 构建请求头
        const headers = {
            "accept": "*/*",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
            "authorization": `Bearer ${authorization}`,
            "content-type": "application/json",
            "sec-ch-ua": "\"Not;A=Brand\";v=\"99\", \"Microsoft Edge\";v=\"139\", \"Chromium\";v=\"139\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "Referer": "https://kusa.pics/"
        };

        // 如果配置了cookie，添加到请求头
        if (cookie) {
            headers.cookie = cookie;
        }

        // 构建请求体
        const requestBody = {
            prompt: prompt,
            width: width,
            height: height,
            amount: amount,
            style_id: styleId
        };

        console.log('Kusa请求参数:', requestBody);

        // 提交任务
        const submitResponse = await fetch("https://kusa.pics/api/text/text-to-image", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        const submitData = await submitResponse.json();
        console.log('Kusa提交响应:', submitData);

        if (!submitData.task_id) {
            throw new Error('任务提交失败: 未获取到task_id');
        }

        const taskId = submitData.task_id;
        console.log('Kusa任务提交成功，taskId:', taskId);

        // 轮询任务状态
        const maxAttempts = 60;
        const interval = 5000;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
            console.log(`Kusa第 ${attempts + 1} 次查询任务状态: ${taskId}`);

            const statusResponse = await fetch(`https://kusa.pics/api/celery/result/${taskId}`, {
                method: "POST",
                headers: {
                    "accept": "*/*",
                    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
                    "authorization": `Bearer ${authorization}`,
                    "sec-ch-ua": "\"Not;A=Brand\";v=\"99\", \"Microsoft Edge\";v=\"139\", \"Chromium\";v=\"139\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin",
                    "Referer": "https://kusa.pics/",
                    ...(cookie && { cookie: cookie })
                },
                body: null
            });

            const statusData = await statusResponse.json();
            console.log(`Kusa状态查询响应:`, statusData);

            const status = statusData.status;
            console.log(`Kusa第 ${attempts + 1} 次查询，状态: ${status}`);

            if (status === 'success') {
                if (statusData.result && statusData.result.presigned_urls && statusData.result.presigned_urls.length > 0) {
                    const imageUrl = statusData.result.presigned_urls[0];
                    console.log('Kusa图像生成完成:', imageUrl);
                    return `![Generated Image](${imageUrl})`;
                } else {
                    throw new Error('任务成功但未获取到图像URL');
                }
            }

            if (status === 'failure' || status === 'failed') {
                const errorMessage = statusData.message || '任务执行失败';
                throw new Error(`任务失败: ${errorMessage}`);
            }

            // 如果状态是 QUEUED, started 等，继续等待
            if (status === 'QUEUED' || status === 'started' || status === 'pending') {
                await new Promise(resolve => setTimeout(resolve, interval));
                continue;
            }

            // 未知状态，继续等待
            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new Error('任务超时，未在最大轮询次数内完成');
    } catch (error) {
        console.error('Kusa API调用错误:', error.message);
        throw new Error(`图像生成失败: ${error.message}`);
    }
}
