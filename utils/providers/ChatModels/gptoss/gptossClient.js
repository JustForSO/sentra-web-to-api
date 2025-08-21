import GptOssProvider from './gptoss.js';

export async function gptoss(messages, model, options = {}) {
    try {
        const provider = new GptOssProvider();
        const result = await provider.chat(messages, { ...options, model });
        
        if (options.stream) {
            return result;
        } else {
            return result.content;
        }
    } catch (error) {
        console.error('GPT-OSS 请求失败:', error.message);
        return null;
    }
}

export { GptOssProvider };

// 为了向后兼容，也提供默认导出
export default { gptoss, GptOssProvider };
