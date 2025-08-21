// YuanbaoCompletion.js

import { Yuanbao } from './Yuanbao.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件所在目录，加载同目录下的 .env 文件
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

/**
 * 将消息数组处理为格式化的对话历史记录和当前消息的字符串
 * @param {Array} messages - 消息数组
 * @returns {String} - 格式化后的最终字符串
 */
function processMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return "无消息记录";
    }
    const historyMessages = messages.slice(0, -1);
    const currentMessage = messages[messages.length - 1];

    const historyPart = historyMessages.length > 0
        ? historyMessages
            .map((msg, index) => {
                const roleDisplay = msg.role === 'user' ? '用户' : '助手';
                return `[历史对话 ${index + 1}] ${roleDisplay}: ${msg.content.trim()}`;
            })
            .join('\n\n')
        : "无历史对话记录";

    const roleDisplay = currentMessage.role === 'user' ? '用户' : '助手';
    const currentPart = `[当前消息] ${roleDisplay}: ${currentMessage.content.trim()}`;

    return `${historyPart}\n\n${'-'.repeat(30)}\n\n${currentPart}`;
}


// 全局变量存储原始模型名称，用于图片模型识别
let originalModelName = null;

export async function YuanbaoCompletion(messages, model, originalModel) {
    try {
        // 存储原始模型名称（如果提供的话）
        if (originalModel) {
            originalModelName = originalModel;
        }
        
        // YUANBAO_COOKIES 是一个逗号分隔的字符串，需要解析成数组
        const rawCookies = process.env.YUANBAO_COOKIES || '';
        const cookielist = rawCookies
            .split(',')
            .map(c => c.trim()) // 移除空格
            .filter(c => c);   // 过滤掉空字符串，防止出现 [, ,] 这样的情况

        // 随机选择一个 Cookie
        const cookie = cookielist.length > 0
            ? cookielist[Math.floor(Math.random() * cookielist.length)]
            : ''; // 如果没有配置 Cookie，则为空字符串

        const YuanbaoModel = process.env.YUANBAO_MODEL || 'deep_seek';
        // 环境变量都是字符串，需要将 'true'/'false' 转换为布尔值
        const YuanbaoSearch = (process.env.YUANBAO_DEEP_SEARCH || 'true').toLowerCase() === 'true';

        // 检查关键配置是否存在
        if (!cookie) {
            console.error("错误：YUANBAO_COOKIES 未配置或为空。请检查 .env 文件。");
            return "生成失败：未配置元宝Cookie或Cookie为空，请检查 .env 文件。";
        }

        // 检查是否为图片生成模型
        // 优先检查原始模型名称，如果没有则检查当前模型名称
        const modelToCheck = originalModelName || model;
        const isImageModel = modelToCheck === 'hunyuan-gpt-175B-0404-imagen';
        
        // 获取实际的模型名称
        let actualModel = model || YuanbaoModel;
        if (isImageModel) {
            actualModel = 'gpt_175B_0404'; // 图片模型使用 gpt_175B_0404
        }

        console.log(`[Yuanbao] 原始模型: ${originalModelName}, 当前模型: ${model}, 是否图片模型: ${isImageModel}, 实际模型: ${actualModel}`);

        const client = new Yuanbao({
            prompt: processMessages(messages),
            model: actualModel,
            search: YuanbaoSearch,
            ck: cookie, // 使用随机选择的 Cookie
            isImageModel: isImageModel // 传递图片模型标识
        });

        const result = await client.makeRequest();
        console.log('元宝API回答:', result); // 更清晰的日志
        return result?.output;
    } catch (error) {
        console.error('元宝API调用错误:', error.message); // 打印错误信息
        // 提供更具体的失败原因提示
        let errorMessage = "生成失败，请检查元宝Cookie是否有效或已过期。";
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage += ` 错误详情: ${error.response.data.message}`;
        } else if (error.message) {
            errorMessage += ` 错误详情: ${error.message}`;
        }
        return errorMessage;
    }
}