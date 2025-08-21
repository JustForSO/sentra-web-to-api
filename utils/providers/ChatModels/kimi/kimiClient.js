// KimiCompletion.js
import kimiAPI from './kimi.js';
import dotenv from 'dotenv';
dotenv.config();

export async function KimiCompletion(messages, refreshToken, refConvId) {
    try {
        const rawRefreshTokens = process.env.KIMI_REFRESH_TOKENS || '';
        const refreshTokens = rawRefreshTokens
            .split(',')
            .map(t => t.trim()) // 移除空格
            .filter(t => t);   // 过滤掉空字符串

        // 检查 Refresh Tokens 是否存在
        if (refreshTokens.length === 0) {
            console.error("错误：KIMI_REFRESH_TOKENS 未配置或为空。请检查 .env 文件。");
            return {
                output: "生成失败：未配置Kimi Refresh Token，请检查 .env 文件。",
                refreshToken: null,
                convId: null
            };
        }

        // 优先使用传入的 refreshToken，否则从配置中随机选择一个
        const selectedRefreshToken = refreshToken || refreshTokens[Math.floor(Math.random() * refreshTokens.length)];
        const KimiModel = process.env.KIMI_MODEL || 'kimi';

        // 如果没有传入 RefreshToken 且随机选择的也为空，则报错
        if (!selectedRefreshToken) {
             console.error("错误：无法获取有效的 Kimi Refresh Token。");
             return {
                output: "生成失败：无法获取有效的Kimi Refresh Token。",
                refreshToken: null,
                convId: null
            };
        }

        // 如果没有 refConvId，则先创建新的会话
        if (!refConvId) {
            console.log("首次调用，正在创建 Kimi 会话...");
            const conversationName = "kimi_conversation_" + Date.now(); // 使用时间戳确保唯一性
            refConvId = await kimiAPI.createConversation(KimiModel, conversationName, selectedRefreshToken);

            if (!refConvId) {
                console.error("错误：未能成功创建 Kimi 会话ID。", refConvId);
                return {
                    output: "生成失败：未能成功创建Kimi会话ID。",
                    refreshToken: selectedRefreshToken, // 尝试返回已选的token
                    convId: null
                };
            }
            console.log(`成功创建 Kimi 会话ID: ${refConvId}`);
        }

        // 发送实际消息
        const response = await kimiAPI.createCompletion({
            model: KimiModel,
            messages,
            refreshToken: selectedRefreshToken,
            refConvId: refConvId,
            skipPreN2s: true
        });

        // 检查响应是否有效
        if (!response || !response.choices || response.choices.length === 0 || !response.choices[0].message || !response.choices[0].message.content) {
            console.error("Kimi API 返回了无效响应:", response);
            return {
                output: "生成失败：Kimi API 返回了无效或空响应。",
                refreshToken: selectedRefreshToken,
                convId: refConvId
            };
        }

        console.log('Kimi API 回答:', response.choices[0].message.content);
        return {
            output: response.choices[0].message.content,
            refreshToken: selectedRefreshToken,
            convId: refConvId
        };
    } catch (error) {
        console.error('Kimi API 调用错误:', error.message);
        // 尝试从错误对象中提取更详细的信息
        let errorMessage = "生成失败，请检查Kimi Refresh Token是否有效或已过期。";
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage += ` 错误详情: ${error.response.data.message}`;
        } else if (error.message) {
            errorMessage += ` 错误详情: ${error.message}`;
        }

        return {
            output: errorMessage,
            refreshToken: refreshToken, // 返回原始传入的或已尝试选择的token
            convId: refConvId
        };
    }
}