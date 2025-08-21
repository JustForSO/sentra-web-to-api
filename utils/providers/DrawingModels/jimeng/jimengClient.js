// jimengClient.js

import { createCompletion } from './jimeng.js';
import dotenv from 'dotenv'; 
dotenv.config();

export async function jimengClient(prompt, model, type = 'image') {
    // 直接从 process.env 读取环境变量
    // 使用 || 提供默认值，并注意类型转换（环境变量都是字符串）
    const sessionId = process.env.JIMENG_SESSION_ID || '';
    const width = parseInt(process.env.JIMENG_IMAGE_WIDTH || '1024', 10); // 确保是数字
    const height = parseInt(process.env.JIMENG_IMAGE_HEIGHT || '1024', 10); // 确保是数字

    // 可以在这里添加一个简单的检查，确保 sessionId 不为空
    if (!sessionId) {
        console.error("错误：JIMENG_SESSION_ID 未配置或为空。请检查 .env 文件。");
        return "生成失败，请确保在 .env 文件中填写了正确的即梦sessionId。";
    }

    try {
        const result = await createCompletion([{ role: "user", content: prompt }], sessionId, model, type, {
            width: width,
            height: height
        });
        console.log("即梦API调用结果：", result); // 更清晰的日志
        return result;
    } catch (err) {
        console.error("即梦API调用失败：", err.message); // 打印错误信息
        // 提供更具体的失败原因提示
        let errorMessage = "生成失败，请确保在 .env 文件中填写了正确的即梦sessionId, 并且未过期或超出当日配额。";
        if (err.response && err.response.data && err.response.data.message) {
            errorMessage += ` 错误详情: ${err.response.data.message}`;
        } else if (err.message) {
            errorMessage += ` 错误详情: ${err.message}`;
        }
        return errorMessage;
    }
}