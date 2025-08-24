import GMICloudProvider from './gmicloud.js';

export async function gmicloud(messages, model, options = {}) {
    try {
        const provider = new GMICloudProvider();
        const result = await provider.createChatCompletion({ 
            messages, 
            model, 
            ...options 
        });
        
        if (options.stream) {
            return result;
        } else {
            return result.choices?.[0]?.message?.content || result;
        }
    } catch (error) {
        console.error('GMICloud 请求失败:', error.message);
        return null;
    }
}

export { GMICloudProvider };