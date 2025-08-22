import { createCompletion } from './jimeng.js';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export async function jimeng(messages, model) {
    try {
        const sessionId = process.env.JIMENG_SESSION_ID;
        const width = parseInt(process.env.JIMENG_IMAGE_WIDTH || '1024', 10);
        const height = parseInt(process.env.JIMENG_IMAGE_HEIGHT || '1024', 10);

        if (!sessionId) {
            throw new Error("生成失败：未配置即梦Session ID，请检查 .env 文件。");
        }

        // 提取最后一条用户消息作为提示
        const prompt = messages.filter(msg => msg.role === 'user').pop()?.content;
        if (!prompt) {
            throw new Error("未找到用户消息");
        }

        // 根据模型名称判断生成类型
        let type = 'image';
        if (model && model.includes('video')) {
            type = 'video';
        }

        const result = await createCompletion([{ role: "user", content: prompt }], sessionId, model, type, {
            width: width,
            height: height
        });

        console.log("即梦API调用结果：", result);
        return result;
    } catch (error) {
        console.error("即梦API调用错误:", error.message);
        let errorMessage = "生成失败，请确保在 .env 文件中填写了正确的即梦sessionId，并且未过期或超出当日配额。";
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage += ` 错误详情: ${error.response.data.message}`;
        } else if (error.message) {
            errorMessage += ` 错误详情: ${error.message}`;
        }
        throw new Error(errorMessage);
    }
}
