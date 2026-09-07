const { GoogleGenAI } = require('@google/genai');

const geminiConfig = {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash'
};

const ai = new GoogleGenAI({ apiKey: geminiConfig.apiKey });

module.exports = { ai, geminiConfig };
