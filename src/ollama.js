
import 'dotenv/config';

const OLLAMA_URL =
    process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const OLLAMA_MODEL =
    process.env.OLLAMA_MODEL || 'mustang-assistente';

export async function conversarComOllama(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Informe pelo menos uma mensagem.');
    }

    const resposta = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            think: false,
            stream: false,
            options: {
                temperature: 0.2
            }
        }),
        signal: AbortSignal.timeout(180000)
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
        throw new Error(
            dados.error || `Erro do Ollama: HTTP ${resposta.status}`
        );
    }

    const conteudo = dados.message?.content?.trim();

    if (!conteudo) {
        throw new Error('O Ollama retornou uma resposta vazia.');
    }

    return conteudo;
}
