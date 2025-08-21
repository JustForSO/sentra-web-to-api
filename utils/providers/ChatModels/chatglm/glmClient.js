// GlmCompletion.js
import GlmAPI from './chatglm.js';
import dotenv from 'dotenv';
dotenv.config();

export async function GlmCompletion(messages, refreshToken, refConvId) {
    try {
        const rawRefreshTokens = process.env.GLM_REFRESH_TOKENS || '';
        const refreshTokens = rawRefreshTokens
            .split(',')
            .map(t => t.trim()) // 移除空格
            .filter(t => t);   // 过滤掉空字符串

        // 检查 Refresh Tokens 是否存在
        if (refreshTokens.length === 0) {
            console.error("错误：GLM_REFRESH_TOKENS 未配置或为空。请检查 .env 文件。");
            return {
                output: "生成失败：未配置ChatGLM Refresh Token，请检查 .env 文件。",
                refreshToken: null,
                convId: null
            };
        }

        // 优先使用传入的 refreshToken，否则从配置中随机选择一个
        const selectedRefreshToken = refreshToken || refreshTokens[Math.floor(Math.random() * refreshTokens.length)];
        const GlmModel = process.env.GLM_MODEL || 'glm-4-plus';

        // 如果没有传入 RefreshToken 且随机选择的也为空，则报错
        if (!selectedRefreshToken) {
             console.error("错误：无法获取有效的 ChatGLM Refresh Token。");
             return {
                output: "生成失败：无法获取有效的ChatGLM Refresh Token。",
                refreshToken: null,
                convId: null
            };
        }

        // 如果没有 refConvId，则先发送一个“你好”消息来获取 convId
        if (!refConvId) {
            console.log("首次调用，正在获取 ChatGLM 会话ID...");
            const initialResponse = await GlmAPI.createCompletion([
                { role: "user", content: "你好" },
            ], selectedRefreshToken, GlmModel);

            if (!initialResponse || !initialResponse.id) {
                console.error("错误：未能成功获取 ChatGLM 会话ID。", initialResponse);
                return {
                    output: "生成失败：未能成功获取ChatGLM会话ID。",
                    refreshToken: selectedRefreshToken, // 尝试返回已选的token
                    convId: null
                };
            }
            refConvId = initialResponse.id;
            console.log(`成功获取 ChatGLM 会话ID: ${refConvId}`);
        }

        // 发送实际消息
        const response = await GlmAPI.createCompletion(
            messages,
            selectedRefreshToken,
            GlmModel,
            refConvId
        );

        // 检查响应是否有效
        if (!response || !response.choices || response.choices.length === 0 || !response.choices[0].message || !response.choices[0].message.content) {
            console.error("ChatGLM API 返回了无效响应:", response);
            return {
                output: "生成失败：ChatGLM API 返回了无效或空响应。",
                refreshToken: selectedRefreshToken,
                convId: refConvId
            };
        }

        console.log('ChatGLM API 回答:', response.choices[0].message.content);
        return {
            output: response.choices[0].message.content,
            refreshToken: selectedRefreshToken,
            convId: refConvId
        };
    } catch (error) {
        console.error('ChatGLM API 调用错误:', error.message);
        // 尝试从错误对象中提取更详细的信息
        let errorMessage = "生成失败，请检查ChatGLM Refresh Token是否有效或已过期。";
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