import ChataiProvider from './chatai.js';

const chataiProvider = new ChataiProvider();

export const chatai = async (messages, model) => {
    try {
        const response = await chataiProvider.chat(messages, {
            model: model,
            stream: false
        });
        
        return response.content || response;
    } catch (error) {
        console.error('Chatai provider error:', error);
        throw error;
    }
};
