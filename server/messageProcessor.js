/**
 * 消息处理器 - 处理reasoning_content和content的分离
 * 支持从<think>标签中提取思考内容
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// 配置选项
const CONFIG = {
  enableReasoningContent: process.env.ENABLE_REASONING_CONTENT !== 'false',
  thinkTagPattern: /<think>([\s\S]*?)<\/think>/i
};

/**
 * 处理消息内容，分离reasoning_content和content
 * @param {string} content - 原始消息内容
 * @returns {Object} - 处理后的消息对象
 */
function processMessageContent(content) {
  if (!CONFIG.enableReasoningContent || typeof content !== 'string') {
    return {
      content: content,
      reasoning_content: null
    };
  }

  // 匹配<think>标签内容
  const match = content.match(CONFIG.thinkTagPattern);
  
  if (match) {
    const reasoningContent = match[1].trim();
    const remainingContent = content.replace(CONFIG.thinkTagPattern, '').trim();
    
    return {
      content: remainingContent || null,
      reasoning_content: reasoningContent || null
    };
  }

  // 没有<think>标签的情况
  return {
    content: content,
    reasoning_content: null
  };
}

/**
 * 处理聊天响应，应用reasoning_content转换
 * @param {Object} responseData - 原始响应数据
 * @returns {Object} - 处理后的响应数据
 */
function processChatResponse(responseData) {
  if (!CONFIG.enableReasoningContent || !responseData || !responseData.choices) {
    return responseData;
  }

  const processedResponse = { ...responseData };
  
  // 处理choices中的消息
  if (Array.isArray(processedResponse.choices)) {
    processedResponse.choices = processedResponse.choices.map(choice => {
      if (choice.message && choice.message.content) {
        const processed = processMessageContent(choice.message.content);
        
        return {
          ...choice,
          message: {
            ...choice.message,
            content: processed.content,
            reasoning_content: processed.reasoning_content
          }
        };
      }
      return choice;
    });
  }

  return processedResponse;
}

/**
 * 处理流式响应的chunk
 * @param {Object} chunk - 流式响应的chunk
 * @returns {Object} - 处理后的chunk
 */
function processStreamingChunk(chunk) {
  if (!CONFIG.enableReasoningContent || !chunk || !chunk.choices) {
    return chunk;
  }

  const processedChunk = { ...chunk };
  
  if (Array.isArray(processedChunk.choices)) {
    processedChunk.choices = processedChunk.choices.map(choice => {
      if (choice.delta && choice.delta.content) {
        // 对于流式响应，我们暂时不处理，因为内容可能是分块的
        // 只在最终chunk中处理
        return choice;
      }
      return choice;
    });
  }

  return processedChunk;
}

/**
 * 检查内容是否包含reasoning标签
 * @param {string} content - 内容字符串
 * @returns {boolean} - 是否包含reasoning标签
 */
function hasReasoningContent(content) {
  if (typeof content !== 'string') return false;
  return CONFIG.thinkTagPattern.test(content);
}

/**
 * 获取配置状态
 * @returns {Object} - 当前配置状态
 */
function getConfig() {
  return {
    enableReasoningContent: CONFIG.enableReasoningContent,
    thinkTagPattern: CONFIG.thinkTagPattern.source
  };
}

export {
  processMessageContent,
  processChatResponse,
  processStreamingChunk,
  hasReasoningContent,
  getConfig
};
