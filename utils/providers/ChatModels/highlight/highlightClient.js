import HighlightProvider from './highlight.js';

let highlightInstance = null;

export const highlight = async (messages, model = 'gpt-4o') => {
    try {
        if (!highlightInstance) {
            highlightInstance = new HighlightProvider();
        }

        const response = await highlightInstance.chat(messages, { model });
        return response.content;
    } catch (error) {
        console.error('Highlight API 调用失败:', error.message);
        throw error;
    }
};

export default highlight;
