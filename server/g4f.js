import * as dotenv from 'dotenv';
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';
import { TotalTokens } from '../utils/requests/CalculateToken.js';
import {
    NXModelResponse,
    getAllModelsWithProviders
} from "../utils/providers/ChooseModels.js";
import {
    NXDrawingModelResponse,
    getAllDrawingModelsWithProviders
} from "../utils/providers/DrawingModels.js";
import {
    processFunctionCallRequest,
    buildFunctionCallResponse,
    replaceModelInResponse,
    parseFunctionCallXml
} from './functionCallHandler.js';
import {
    processChatResponse,
    processStreamingChunk
} from './messageProcessor.js';

const app = new Koa();
const router = new Router();

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
const config = {
    port: process.env.PORT || 7799,
    accessToken: process.env.ACCESS_TOKEN
};

// 基础中间件
app.use(bodyParser());

// 访问令牌认证中间件
const authMiddleware = async (ctx, next) => {
    if (!config.accessToken) {
        ctx.status = 500;
        ctx.body = {
            error: {
                message: "服务器未配置访问令牌",
                code: "server_configuration_error"
            }
        };
        return;
    }

    const authHeader = ctx.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ctx.status = 401;
        ctx.body = {
            error: {
                message: "缺少或无效的授权头",
                code: "unauthorized"
            }
        };
        return;
    }

    const token = authHeader.substring(7); // 移除 "Bearer " 前缀
    if (token !== config.accessToken) {
        ctx.status = 401;
        ctx.body = {
            error: {
                message: "无效的访问令牌",
                code: "invalid_token"
            }
        };
        return;
    }

    await next();
};

/**
 * 获取所有可用的聊天模型列表，排除绘图模型
 *
 * @param {Object} ctx - Koa 的上下文对象。
 */
router.get('/v1/models', authMiddleware, async (ctx) => {
    try {
        // 获取聊天模型数据（排除绘图模型）
        const chatModelsObject = getAllModelsWithProviders();
        
        // 转换为OpenAI兼容格式
        const modelList = Object.entries(chatModelsObject)
            .map(([modelName, providers]) => ({
                id: modelName,
                object: "model",
                created: 1626777600, // 固定时间戳
                owned_by: providers.sort().join(","), // 多个供应商用逗号分割
                supported_endpoint_types: ["openai"]
            }))
            .sort((a, b) => a.id.localeCompare(b.id)); // 按模型ID字母排序

        // 构建响应
        const response = {
            data: modelList,
            success: true
        };

        ctx.body = response;

    } catch (error) {
        console.error("获取模型列表失败:", error);
        ctx.status = 500;
        ctx.body = {
            error: {
                message: "获取模型列表失败",
                code: "internal_error"
            },
            success: false
        };
    }
});

//

// 处理绘图请求
router.post('/v1/images/generations', authMiddleware, async (ctx) => {
    try {
        const { prompt, model, n = 1, size } = ctx.request.body;

        // 输入验证
        if (typeof prompt !== 'string') {
            ctx.throw(400, 'prompt必须是字符串');
        }
        if (typeof model !== 'string') {
            ctx.throw(400, 'model必须是字符串');
        }
        if (typeof size !== 'string') {
            ctx.throw(400, 'size必须是字符串');
        }
        if (typeof n !== 'number' || n < 1) {
            ctx.throw(400, 'n必须是大于0的数字');
        }

        // 提取链接的函数
        function extractLinks(textString) {
            const links = [];
            const regex = /(https?:\/\/[^\s()]+)/g;
            let match;
            while ((match = regex.exec(textString)) !== null) {
                links.push(match[1]);
            }
            return links.map(url => ({ "url": url }));
        }

        // 执行n次绘图请求并收集结果
        const allLinks = [];
        let lastCreatedTime = 0;

        for (let i = 0; i < n; i++) {
            const response = await NXDrawingModelResponse(prompt, model);
            const links = extractLinks(response);
            allLinks.push(...links);
            lastCreatedTime = Math.floor(Date.now() / 1000);
        }

        // 返回结果
        ctx.body = {
            created: lastCreatedTime,
            data: allLinks,
            model: model,
            prompt: prompt,
            n: n,
        };
    } catch (error) {
        console.error('请求处理失败:', error);
        ctx.status = error.status || 500;
        ctx.body = {
            error: {
                message: error.message,
                code: error.code || 'internal_error'
            }
        };
    }
});

// 处理聊天请求
router.post('/v1/chat/completions', authMiddleware, async (ctx) => {
    try {
        const { messages, model = 'gpt-4o-mini', stream = false } = ctx.request.body;

        if (!Array.isArray(messages) || messages.length === 0) {
            ctx.throw(400, 'messages必须是非空数组');
        }

        // 处理函数调用请求
        const { processedBody, hasFunctionCall } = processFunctionCallRequest(ctx.request.body);

        if (stream) {
            // 流式响应设置
            ctx.set({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            });
            ctx.status = 200;

            const stream = new PassThrough();
            ctx.body = stream;

            try {
                const responseId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
                const created = Math.floor(Date.now() / 1000);

                // 发送初始数据
                const sendEvent = (data) => {
                    const payload = `data: ${JSON.stringify(data)}\n\n`;
                    return new Promise((resolve) => {
                        if (!stream.write(payload)) {
                            stream.once('drain', resolve);
                        } else {
                            resolve();
                        }
                    });
                };

                // 获取流式响应
                const responseStream = await getStreamingModelResponse(model, processedBody.messages);

                let index = 0;
                let accumulatedResponse = '';
                
                for await (const chunk of responseStream) {
                    accumulatedResponse += chunk;
                    
                    // 检查是否包含函数调用标记
                    if (hasFunctionCall && chunk.includes('FC_USE')) {
                        // 处理函数调用响应
                        const functionCall = parseFunctionCallXml(chunk);
                        if (functionCall) {
                            // 发送函数调用开始
                            await sendEvent({
                                id: responseId,
                                object: 'chat.completion.chunk',
                                created,
                                model,
                                choices: [{
                                    index: 0,
                                    delta: {
                                        content: null,
                                        tool_calls: [{
                                            index: 0,
                                            id: `call_${Date.now()}`,
                                            type: "function",
                                            function: {
                                                name: functionCall.name,
                                                arguments: JSON.stringify(functionCall.args)
                                            }
                                        }]
                                    },
                                    finish_reason: null
                                }]
                            });
                            
                            // 发送函数调用结束
                            await sendEvent({
                                id: responseId,
                                object: 'chat.completion.chunk',
                                created,
                                model,
                                choices: [{
                                    index: 0,
                                    delta: {},
                                    finish_reason: 'tool_calls'
                                }]
                            });
                            break;
                        }
                    } else {
                        // 普通响应 - 检查是否包含reasoning内容
                        const thinkMatch = accumulatedResponse.match(/<think>[\s\S]*?<\/think>/i);
                        if (thinkMatch) {
                            // 如果已经收集到完整的think标签，分离内容
                            const processedChunk = accumulatedResponse.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
                            if (processedChunk) {
                                await sendEvent({
                                    id: responseId,
                                    object: 'chat.completion.chunk',
                                    created,
                                    model,
                                    choices: [{
                                        index: 0,
                                        delta: { 
                                            content: processedChunk,
                                            reasoning_content: thinkMatch[1] || null
                                        },
                                        finish_reason: null
                                    }]
                                });
                            }
                        } else {
                            // 普通内容流式输出
                            await sendEvent({
                                id: responseId,
                                object: 'chat.completion.chunk',
                                created,
                                model,
                                choices: [{
                                    index,
                                    delta: { content: chunk },
                                    finish_reason: null
                                }]
                            });
                        }
                        index++;
                    }
                }

                // 发送标准结束标记
                if (!hasFunctionCall) {
                    await sendEvent({
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model,
                        choices: [{
                            index: 0,
                            delta: {},
                            finish_reason: 'stop'
                        }]
                    });
                }
                stream.write('data: [DONE]\n\n');
            } catch (error) {
                console.error('流式响应错误:', error);
                const errorPayload = JSON.stringify({
                    error: {
                        message: error.message,
                        code: error.code || 'internal_error'
                    }
                });
                stream.write(`data: ${errorPayload}\n\n`);
            } finally {
                stream.end();
            }
        } else {
            // 非流式响应
            const response = await NXModelResponse(processedBody.messages, model);
            const usage = await TotalTokens(response, processedBody.messages);

            let responseData = {
                id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                    message: {
                        role: 'assistant',
                        content: response
                    },
                    finish_reason: 'stop'
                }],
                usage
            };

            // 处理函数调用响应
            if (hasFunctionCall) {
                const functionCall = parseFunctionCallXml(response);
                if (functionCall) {
                    responseData = buildFunctionCallResponse(responseData, functionCall);
                }
            }

            // 处理reasoning_content
            responseData = processChatResponse(responseData);

            ctx.body = responseData;
        }
    } catch (error) {
        console.error('请求处理失败:', error);
        ctx.status = error.status || 500;
        ctx.body = {
            error: {
                message: error.message,
                code: error.code || 'internal_error'
            }
        };
    }
});

// 优化的流式响应生成器
async function* getStreamingModelResponse(model, messages) {
    const response = await NXModelResponse(messages, model);

    if (!response || typeof response !== 'string') {
        throw new Error('无效的模型响应');
    }

    // 更合理的分块逻辑（按字符流式输出）
    const chunkSize = 20;
    let position = 0;

    while (position < response.length) {
        const chunk = response.slice(position, position + chunkSize);
        position += chunkSize;

        if (chunk.trim()) {
            yield chunk;
            await delay(30); // 更自然的输出间隔
        }
    }
}

// 辅助函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 注册路由
app.use(router.routes()).use(router.allowedMethods());

// 启动服务器
const PORT = config.port || 7799;
app.listen(PORT, () => {
    console.log(`服务器已启动,监听端口 ${PORT}`);
});