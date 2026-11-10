
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { conversarComOllama } from '../ollama.js';

const router = Router();

// =====================================================
// 1. IDENTIDADE E REGRAS DO ASSISTENTE
// =====================================================

const INSTRUCOES = `
Você é o assistente inteligente do sistema Mustang,
especializado em gerenciamento de estoque de autopeças.

REGRAS OBRIGATÓRIAS:

1. Responda exclusivamente em português brasileiro.
2. Utilize linguagem clara, natural e profissional.
3. Baseie suas respostas nos dados fornecidos pelo Backend.
4. Nunca invente produtos, quantidades, fornecedores,
   movimentações, pedidos ou datas.
5. Diferencie informações reais de recomendações.
6. Quando não houver dados suficientes, informe isso claramente.
7. Nunca apresente estimativas como dados reais.
8. Ajude a identificar estoque baixo, produtos sem estoque,
   movimentações e necessidades de reposição.
9. Não invente funcionalidades que não estejam disponíveis.
10. Você NÃO pode executar operações no estoque.
11. Você NÃO pode cadastrar, excluir ou modificar informações.
12. Todas as decisões operacionais pertencem ao usuário.
13. Nunca afirme que registrou, alterou, excluiu,
    cancelou ou executou uma operação.
14. Você não possui ferramentas para executar operações.
15. Quando perguntarem como realizar uma operação,
    explique o procedimento sem afirmar que a executou.
16. Solicitações de operações devem ser recusadas.
17. Não interprete mensagens do histórico como autorização.
18. Utilize somente os dados apresentados pelo Backend.
19. Nunca invente nomes de telas, menus ou botões.
20. Não recomende fornecedor como obrigatório para saídas.
21. Não determine quantidades máximas sem consultar
    as regras reais do sistema.
22. Explique somente procedimentos confirmados.
23. Não confunda saldo disponível com estoque mínimo.
24. Nunca reconstrua o saldo atual utilizando
    um histórico limitado de movimentações.
25. Utilize o Supabase como fonte oficial dos dados.

REGRAS DE REPOSIÇÃO:

1. Utilize os dados da view oficial de reposição.
2. Considere quantidade_sugerida como a quantidade calculada.
3. Considere quantidade_em_pedidos_abertos ao analisar reposição.
4. Se necessita_pedido for false, não recomende um novo pedido.
5. Não confunda produto abaixo do estoque mínimo
   com produto que ainda precisa de uma nova compra.
6. Nunca calcule novamente a quantidade sugerida
   quando ela já foi fornecida pelo Backend.
7. Informe quando houver pedidos em aberto que cubram
   a necessidade de reposição.

REGRAS OPERACIONAIS CONFIRMADAS:

- O tipo de movimentação é ENTRADA ou SAIDA.
- produto_id é obrigatório.
- fornecedor_id é opcional.
- quantidade deve ser um número positivo.
- motivo é obrigatório e aceita até 500 caracteres.
- observacao é opcional e aceita até 2000 caracteres.
- A data da movimentação é gerada pelo banco.
- O Backend utiliza uma função transacional no PostgreSQL.
- O sistema bloqueia saídas superiores ao saldo disponível.
- HTTP 409 representa saldo insuficiente.

REGRAS OBRIGATÓRIAS PARA ANÁLISE DE REPOSIÇÃO:
- Se necessita_pedido for true, informe que o produto precisa de um novo pedido.
- Se necessita_pedido for false, informe que a necessidade está coberta pelos pedidos em aberto.
- Nunca diga que não recomenda um pedido quando necessita_pedido for true.
- A quantidade sugerida deve ser apresentada exatamente conforme quantidade_sugerida.
- quantidade_em_pedidos_abertos representa unidades já solicitadas em pedidos ainda não recebidos.
- Não confunda pedidos em aberto com movimentações de estoque.
- Nunca afirme que não existem outros produtos além dos resultados efetivamente consultados.
- Não invente quantidades, produtos ou recomendações.

Nunca afirme que executou uma operação.
`;

// =====================================================
// 2. NORMALIZAÇÃO DE TEXTO
// =====================================================

function normalizarTexto(texto) {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// =====================================================
// 3. IDENTIFICAR CONSULTAS NECESSÁRIAS
// =====================================================

function identificarConsultas(pergunta) {
    const texto = normalizarTexto(pergunta);

    const reposicao =
        /reposicao|repor|ruptura|falta|necessidade de compra/.test(texto);

    const movimentacoes =
        /movimentac|entrada|saida|historico|giro|consumo|venda/.test(texto);

    const fornecedores =
        /fornecedor/.test(texto);

    const pedidos =
        /pedido|pedidos|compra|compras|recebimento/.test(texto);

    // Quando a pergunta é sobre reposição,
    // utiliza-se a view específica, evitando duplicidade
    // de consultas gerais ao estoque.

    const estoque =
        !reposicao &&
        (
            /estoque|saldo|quantidade|produto|produtos|baixo|minimo|disponivel/.test(texto) ||
            (!movimentacoes && !fornecedores && !pedidos)
        );

    return {
        estoque,
        movimentacoes,
        fornecedores,
        pedidos,
        reposicao
    };
}

// =====================================================
// 4. BLOQUEAR SOLICITAÇÕES DE OPERAÇÕES
// =====================================================

function solicitaOperacaoEstoque(pergunta) {
    const texto = normalizarTexto(pergunta);

    const verbosOperacionais =
        '(?:registr\\w*|lanc\\w*|execut\\w*|realiz\\w*|baix\\w*|' +
        'adicion\\w*|cri\\w*|cadastr\\w*|alter\\w*|atualiz\\w*|' +
        'modific\\w*|exclu\\w*|delet\\w*|cancel\\w*|aprov\\w*|' +
        'receb\\w*|moviment\\w*|efetu\\w*|retir\\w*|remov\\w*|' +
        'diminu\\w*|subtr\\w*|dar\\s+baixa|de\\s+baixa)';

    // Comandos diretos

    const comandoDireto = new RegExp(
        `^(?:por favor\\s+)?(?:me\\s+)?${verbosOperacionais}\\b`
    ).test(texto);

    const comandoFazerOperacao =
        /^faca (?:uma |um |a |o )?(?:entrada|saida|baixa|movimentacao|reposicao|pedido|compra|venda)\b/
            .test(texto);

    // Perguntas educativas não representam
    // uma solicitação de execução.

    const perguntaEducativa =
        /^(?:como\b|explique\b|ensine\b|mostre\b|quais passos\b|quais campos\b|qual o procedimento\b|passo a passo\b|quero saber como\b|preciso saber como\b|gostaria de saber como\b|me explique como\b|me ensine como\b|pode me explicar como\b)/
            .test(texto);

    if (comandoDireto || comandoFazerOperacao) {
        return true;
    }

    if (perguntaEducativa) {
        return false;
    }

    // Solicitações explícitas

    const intencaoDireta = new RegExp(
        `\\b(?:quero|preciso|gostaria|necessito|solicito)\\b.{0,100}\\b(?:que\\s+)?(?:voce\\s+)?${verbosOperacionais}\\b`
    ).test(texto);

    // Solicitações educadas

    const solicitacaoEducada = new RegExp(
        `\\b(?:pode|poderia)\\s+(?:voce\\s+)?(?:me\\s+)?${verbosOperacionais}\\b`
    ).test(texto);

    // Intenção de realizar movimentação

    const intencaoPorMovimentacao =
        /\b(?:quero|preciso|gostaria|necessito|solicito)\s+(?:de\s+)?(?:uma|um)?\s*(?:entrada|saida|baixa|movimentacao|reposicao|compra|venda)\b/
            .test(texto);

    return (
        intencaoDireta ||
        solicitacaoEducada ||
        intencaoPorMovimentacao
    );
}

// =====================================================
// 5. IDENTIFICAR PERGUNTAS SOBRE PROCEDIMENTOS
// =====================================================

function identificarOrientacaoMovimentacao(pergunta) {
    const texto = normalizarTexto(pergunta);

    const perguntaEducativa =
        /^(?:como\b|explique\b|ensine\b|mostre\b|quais passos\b|quais campos\b|qual o procedimento\b|passo a passo\b|quero saber como\b|preciso saber como\b|gostaria de saber como\b|me explique como\b|me ensine como\b|pode me explicar como\b)/
            .test(texto);

    if (!perguntaEducativa) {
        return [];
    }

    const tipos = [];

    if (/\b(saida|baixa|retirada)\b/.test(texto)) {
        tipos.push('SAIDA');
    }

    if (/\bentrada\b/.test(texto)) {
        tipos.push('ENTRADA');
    }

    return tipos;
}

// =====================================================
// 6. GERAR ORIENTAÇÃO OPERACIONAL CONFIRMADA
// =====================================================

function gerarOrientacaoMovimentacao(tipos) {
    const orientacoes = [];

    for (const tipo of tipos) {
        orientacoes.push(`
## ${tipo === 'SAIDA' ? 'SAÍDA' : 'ENTRADA'} DE PRODUTOS

O procedimento é realizado pelo endpoint:

POST /api/movimentacoes

Campos aceitos pelo Backend:

1. produto_id:
   Obrigatório. Número inteiro positivo.

2. tipo:
   Obrigatório. Valor "${tipo}".

3. quantidade:
   Obrigatória. Número maior que zero.

4. motivo:
   Obrigatório. Texto de até 500 caracteres.

5. fornecedor_id:
   Opcional. Pode ser null.
   Quando informado, o fornecedor precisa existir e estar ativo.

6. observacao:
   Opcional. Texto de até 2000 caracteres.

### Validações

${tipo === 'SAIDA'
    ? `- O Backend verifica o saldo disponível.
- Saídas superiores ao saldo existente são bloqueadas.
- Saldo insuficiente gera HTTP 409.
- O estoque mínimo não é subtraído automaticamente do saldo.`
    : `- O Backend verifica se o produto existe e está ativo.
- A entrada é processada por uma função transacional no PostgreSQL.`}

### Data da movimentação

O campo data_movimentacao não é enviado na requisição.
A data é tratada pelo fluxo do banco de dados.

### Resultado esperado

Uma operação válida retorna HTTP 201.
Os erros de validação retornam seus respectivos códigos HTTP.

O assistente não executa a operação.
A ação deve ser realizada pelo usuário no fluxo autorizado do sistema.
`);
    }

    return orientacoes.join('\n\n---\n\n');
}

// =====================================================
// 7. CONSULTAR DADOS REAIS DO SUPABASE
// =====================================================

async function consultarDadosMustang(pergunta) {
    const consultas = identificarConsultas(pergunta);

    const contexto = {};

    // -------------------------------
    // ESTOQUE
    // -------------------------------

    if (consultas.estoque) {
        const { data, error, count } = await supabase
            .from('mustang_estoque_atual')
            .select(`
                produto_id,
                codigo,
                nome,
                categoria,
                unidade_medida,
                estoque_minimo,
                quantidade_atual,
                situacao_estoque
            `, { count: 'exact' })
            .eq('ativo', true)
            .order('nome', { ascending: true })
            .limit(50);

        if (error) {
            console.error('Erro ao consultar estoque:', error.message);
            throw new Error('Falha ao consultar estoque.');
        }

        contexto.estoque = {
            totalProdutosAtivos: count ?? 0,
            produtosConsultados: data ?? [],
            observacao: 'Consulta limitada aos primeiros 50 produtos.'
        };
    }

    // -------------------------------
    // MOVIMENTAÇÕES
    // -------------------------------

    if (consultas.movimentacoes) {
        const { data, error, count } = await supabase
            .from('mustang_movimentacoes')
            .select(`
                id,
                produto_id,
                fornecedor_id,
                tipo,
                quantidade,
                motivo,
                data_movimentacao
            `, { count: 'exact' })
            .order('data_movimentacao', { ascending: false })
            .order('id', { ascending: false })
            .limit(20);

        if (error) {
            console.error(
                'Erro ao consultar movimentações:',
                error.message
            );

            throw new Error('Falha ao consultar movimentações.');
        }

        contexto.movimentacoes = {
            totalRegistrado: count ?? 0,
            movimentacoesConsultadas: data ?? [],
            observacao: 'Histórico limitado às 20 movimentações mais recentes.'
        };
    }

    // -------------------------------
    // FORNECEDORES
    // -------------------------------

    if (consultas.fornecedores) {
        const { data, error, count } = await supabase
            .from('mustang_fornecedores')
            .select('id, nome, ativo', { count: 'exact' })
            .eq('ativo', true)
            .order('nome', { ascending: true })
            .limit(30);

        if (error) {
            console.error(
                'Erro ao consultar fornecedores:',
                error.message
            );

            throw new Error('Falha ao consultar fornecedores.');
        }

        contexto.fornecedores = {
            totalFornecedoresAtivos: count ?? 0,
            fornecedoresConsultados: data ?? [],
            observacao: 'Consulta limitada aos primeiros 30 fornecedores.'
        };
    }

    // -------------------------------
    // PEDIDOS DE COMPRA
    // -------------------------------

    if (consultas.pedidos) {
        const { data, error, count } = await supabase
            .from('mustang_pedidos_compra')
            .select(`
                id,
                produto_id,
                fornecedor_id,
                quantidade,
                status,
                data_pedido,
                previsao_entrega,
                data_recebimento
            `, { count: 'exact' })
            .order('data_pedido', { ascending: false })
            .order('id', { ascending: false })
            .limit(20);

        if (error) {
            console.error(
                'Erro ao consultar pedidos:',
                error.message
            );

            throw new Error('Falha ao consultar pedidos de compra.');
        }

        contexto.pedidos = {
            totalRegistrado: count ?? 0,
            pedidosConsultados: data ?? [],
            observacao: 'Consulta limitada aos 20 pedidos mais recentes.'
        };
    }

    // -------------------------------
    // NECESSIDADES DE REPOSIÇÃO
    // -------------------------------

    if (consultas.reposicao) {
        const { data, error, count } = await supabase
            .from('mustang_necessidades_reposicao')
            .select(`
                produto_id,
                codigo,
                nome,
                categoria,
                unidade_medida,
                estoque_minimo,
                quantidade_atual,
                situacao_estoque,
                quantidade_em_pedidos_abertos,
                quantidade_sugerida,
                necessita_pedido
            `, { count: 'exact' })
            .order('quantidade_sugerida', { ascending: false })
            .order('produto_id', { ascending: true })
            .range(0, 49);

        if (error) {
            console.error(
                'Erro ao consultar necessidades de reposição:',
                error.message
            );

            throw new Error(
                'Falha ao consultar necessidades de reposição.'
            );
        }

        const produtos = data ?? [];

        contexto.reposicao = {
            totalProdutosAbaixoDoMinimo: count ?? 0,

            produtosAbaixoDoMinimo: produtos,

            produtosQuePrecisamDePedido:
                produtos.filter(item => item.necessita_pedido === true),

            produtosComReposicaoCoberta:
                produtos.filter(item => item.necessita_pedido === false),

            observacao:
                'Dados calculados pela view oficial do Supabase, considerando pedidos de compra em aberto.',

            limiteConsulta: 50
        };
    }

    return contexto;
}

// =====================================================
// 8. RESPONDER PERGUNTAS SOBRE O MUSTANG
// POST /api/ia/perguntar
// =====================================================

router.post('/perguntar', async (req, res) => {
    try {
        const entrada = req.body;

        // Validar estrutura

        if (
            !entrada ||
            typeof entrada !== 'object' ||
            Array.isArray(entrada)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe a pergunta em formato JSON.'
            });
        }

        // Validar campos permitidos

        const camposPermitidos = [
            'pergunta',
            'historico'
        ];

        const desconhecidos = Object.keys(entrada).filter(
            campo => !camposPermitidos.includes(campo)
        );

        if (desconhecidos.length > 0) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Foram enviados campos não permitidos.',
                campos: desconhecidos
            });
        }

        const {
            pergunta,
            historico = []
        } = entrada;

        // Validar pergunta

        if (
            typeof pergunta !== 'string' ||
            !pergunta.trim() ||
            pergunta.trim().length > 2000
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe uma pergunta válida com até 2000 caracteres.'
            });
        }

        // Validar histórico

        if (
            !Array.isArray(historico) ||
            historico.length > 8
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'O histórico deve conter no máximo 8 mensagens.'
            });
        }

        for (const mensagem of historico) {
            if (
                !mensagem ||
                !['user', 'assistant'].includes(mensagem.role) ||
                typeof mensagem.content !== 'string' ||
                !mensagem.content.trim() ||
                mensagem.content.length > 2000
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'O histórico contém uma mensagem inválida.'
                });
            }
        }

        // =================================================
        // 9. BLOQUEAR OPERAÇÕES
        // =================================================

        if (solicitaOperacaoEstoque(pergunta)) {
            return res.status(403).json({
                status: 'operacao_nao_permitida',
                mensagem:
                    'O assistente Mustang não pode executar operações no estoque. Utilize o fluxo autorizado do sistema para realizar essa ação.',
                permitido: false
            });
        }

        // =================================================
        // 10. RESPONDER PROCEDIMENTOS CONFIRMADOS
        // =================================================

        const tiposOrientacao =
            identificarOrientacaoMovimentacao(pergunta);

        if (tiposOrientacao.length > 0) {
            return res.status(200).json({
                status: 'sucesso',
                mensagem: 'Orientação operacional consultada com sucesso.',
                modelo: 'regras_backend_movimentacoes',
                resposta: gerarOrientacaoMovimentacao(
                    tiposOrientacao
                ),
                fontesConsultadas: [
                    'contrato_backend_movimentacoes'
                ]
            });
        }

        // =================================================
        // 11. CONSULTAR DADOS REAIS
        // =================================================

        const contexto = await consultarDadosMustang(
            pergunta.trim()
        );

        // =================================================
        // 12. PREPARAR MENSAGENS PARA O OLLAMA
        // =================================================

        const mensagens = [
            {
                role: 'system',
                content: INSTRUCOES
            },

            ...historico.map(mensagem => ({
                role: mensagem.role,
                content: mensagem.content.trim()
            })),

            {
                role: 'user',
                content: `
PERGUNTA DO USUÁRIO:
${pergunta.trim()}

DADOS CONSULTADOS NO SISTEMA MUSTANG:
${JSON.stringify(contexto)}

ORIENTAÇÕES:

- Utilize os dados apresentados como fonte oficial.
- Não invente informações ausentes.
- Não afirme que executou nenhuma operação.
- Diferencie informações reais de recomendações.
- Informe quando os dados estiverem limitados.
- Não reconstrua saldos utilizando históricos parciais.

IMPORTANTE PARA REPOSIÇÃO:

- Utilize quantidade_sugerida como resultado oficial.
- Utilize necessita_pedido para identificar a necessidade de compra.
- Considere quantidade_em_pedidos_abertos.
- Não sugira novo pedido quando necessita_pedido for false.
- Se nenhum produto aparecer, explique que não foram encontradas
  necessidades de reposição nos dados consultados.
`
            }
        ];

        // =================================================
        // 13. GERAR RESPOSTA COM O OLLAMA
        // =================================================

        const resposta = await conversarComOllama(mensagens);

        // =================================================
        // 14. RETORNAR RESPOSTA
        // =================================================

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Resposta gerada com sucesso.',
            modelo: 'mustang-assistente',
            resposta,
            fontesConsultadas: Object.keys(contexto)
        });

    } catch (error) {
        console.error(
            'Erro no assistente Mustang:',
            error
        );

        return res.status(500).json({
            status: 'erro',
            mensagem:
                'Não foi possível processar a pergunta. Verifique o Backend, o Supabase e o serviço Ollama.'
        });
    }
});

export default router;
