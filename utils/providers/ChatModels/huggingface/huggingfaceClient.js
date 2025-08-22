import { NoobxL } from './noobxl.js';
import { loadProviderEnv } from '../../loadEnv.js';

// 加载当前目录的.env文件
loadProviderEnv(import.meta.url);

export async function huggingface(messages, model) {
  try {
    // 提取最后一条用户消息作为提示
    const prompt = messages.filter(msg => msg.role === 'user').pop()?.content;
    if (!prompt) {
      throw new Error("未找到用户消息");
    }

    const result = await NoobxL([{ role: "user", content: prompt }]);
    return result;
  } catch (error) {
    console.error("HuggingFace API调用错误:", error.message);
    throw new Error(`图像生成失败: ${error.message}`);
  }
}
