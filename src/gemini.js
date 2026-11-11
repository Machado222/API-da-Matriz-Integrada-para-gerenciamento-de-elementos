
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada no Backend.');
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

export async function conversarComGemini(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Informe pelo menos uma mensagem.');
    }

    const systemInstruction = messages
        .filter(item => item.role === 'system')
        .map(item => item.content)
        .join('\n\n');

    const contents = messages
        .filter(item => item.role !== 'system')
        .map(item => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }]
        }));

    if (!contents.length) {
        throw new Error('Nenhuma mensagem de usuário encontrada.');
    }

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: {
                systemInstruction,
                temperature: 0.2
            }
        });

        const resposta = response.text?.trim();

        if (!resposta) {
            throw new Error('O Gemini retornou uma resposta vazia.');
        }

        return resposta;

    } catch (error) {
        console.error('Erro no Gemini:', error.message);

        throw new Error(
            `Falha ao consultar o Gemini: ${error.message}`
        );
    }
}
