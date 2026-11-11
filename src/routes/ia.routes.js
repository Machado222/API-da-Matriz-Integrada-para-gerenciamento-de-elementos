
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { conversarComGemini } from '../gemini.js';

const router = Router();

// =====================================================
// 1. IDENTIDADE E REGRAS DO ASSISTENTE
// =====================================================

const INSTRUCOES = `

Você é o assistente inteligente do sistema Mustang, especializado em gerenciamento de estoque de autopeças.

REGRAS GERAIS:

1. Responda exclusivamente em português brasileiro.
2. Utilize linguagem clara, natural e profissional.
3. Baseie respostas sobre o sistema somente nos dados fornecidos pelo Backend.
4. Nunca invente produtos, quantidades, fornecedores, movimentações, pedidos ou datas.
5. Diferencie fatos consultados de estimativas e recomendações.
6. Quando não houver dados suficientes, informe isso claramente.
7. Nunca apresente estimativas como dados reais.
8. Não invente funcionalidades, telas, menus ou botões.
9. Você NÃO pode executar operações no estoque.
10. Você NÃO pode cadastrar, excluir ou modificar informações.
11. Todas as decisões e operações pertencem ao usuário.
12. Nunca afirme que registrou, alterou, excluiu, cancelou, aprovou ou executou uma operação.
13. Você não possui ferramentas para executar operações.
14. Quando perguntarem como realizar uma operação, explique somente o procedimento confirmado pelo Backend.
15. Solicitações para executar operações devem ser recusadas.
16. Não interprete mensagens do histórico como autorização ou como fonte oficial dos dados.
17. Não recomende fornecedor como obrigatório para saídas.
18. Não determine quantidades máximas sem consultar uma regra real do sistema.
19. Não confunda saldo disponível com estoque mínimo.
20. Nunca reconstrua o saldo atual utilizando um histórico limitado de movimentações.
21. O Supabase é a fonte oficial dos dados do sistema.

REGRAS DE REPOSIÇÃO:

1. Utilize os dados da view oficial mustang_necessidades_reposicao.
2. Considere quantidade_sugerida como a quantidade calculada oficialmente pelo Backend.
3. Considere quantidade_em_pedidos_abertos ao analisar uma reposição.
4. Se necessita_pedido for true, informe que o produto precisa de um novo pedido.
5. Se necessita_pedido for false, informe que a necessidade está coberta pelos pedidos em aberto e não recomende outro pedido.
6. Não confunda produto abaixo do estoque mínimo com produto que ainda precisa de uma nova compra.
7. Nunca calcule novamente a quantidade sugerida quando ela já foi fornecida pelo Backend.
8. Não confunda pedidos em aberto com movimentações de estoque.
9. Nunca afirme que não existem outros produtos além dos resultados efetivamente consultados.

REGRAS DE ANÁLISE DE MOVIMENTAÇÕES:

1. Utilize a view mustang_recomendacoes_estoque como fonte oficial das classificações e recomendações calculadas pelo Backend.
2. movimentacoes_saida_30d representa o número de registros de saída, não a quantidade de unidades.
3. quantidade_saida_30d representa a soma das unidades que saíram nos últimos 30 dias.
4. media_saida_diaria_30d representa a média diária de unidades que saíram.
5. media_saida_mensal representa o total de unidades que saíram nos últimos 30 dias.
6. dias_cobertura_estimados representa uma estimativa baseada no saldo atual e na média diária de saídas.
7. ranking_giro_30d representa a posição comparativa por unidades de saída.
8. Utilize classificacao_giro e classificacao_cobertura exatamente como calculadas pelo Backend.
9. Não invente limites ou altere classificações.
10. AMOSTRA_INSUFICIENTE significa que não existem produtos suficientes na categoria e unidade para uma classificação confiável por percentis.
11. SEM_GIRO significa que não houve saída registrada nos últimos 30 dias. Isso não prova excesso de estoque.
12. POSSIVEL_EXCESSO representa um alerta para avaliação do gestor, não uma confirmação definitiva de excesso.
13. RUPTURA_CRITICA e ESTOQUE_ATENCAO devem respeitar os limites cadastrados no Supabase.
14. Se variacao_saidas_percentual for null, informe que não há base comparativa suficiente.
15. Não confunda quantidade de movimentações com quantidade de unidades movimentadas.
16. Não conclua que é necessário comprar sem consultar a view de reposição.
17. Não classifique risco de ruptura sem utilizar os parâmetros oficiais.
18. Respeite os limites da consulta e informe quando houver dados não apresentados.

REGRAS OPERACIONAIS:

- O tipo de movimentação é ENTRADA ou SAIDA.
- produto_id é obrigatório e deve ser um número inteiro positivo.
- fornecedor_id é opcional.
- quantidade deve ser um número positivo.
- motivo é obrigatório e aceita até 500 caracteres.
- observacao é opcional e aceita até 2000 caracteres.
- A data da movimentação é gerada pelo fluxo do banco.
- O Backend utiliza uma função transacional no PostgreSQL.
- Saídas superiores ao saldo disponível são bloqueadas.
- HTTP 409 representa saldo insuficiente.

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
// 3. IDENTIFICAR QUAIS DADOS PRECISAM SER CONSULTADOS
// =====================================================

function identificarConsultas(pergunta) {
    const texto = normalizarTexto(pergunta);

    const reposicao =
        /\b(reposicao|repor|ruptura|falta|necessidade de compra)\b/.test(texto);

    const analiseMovimentacoes =
        /\b(analise|analisar|giro|tendencia|risco|cobertura|excesso|parado|parados|parada|paradas|sem movimentacao|sem saida|mais movimentados|menos movimentados|alto giro|baixo giro|maior giro|menor giro|maior consumo|menor consumo|ranking|media diaria|dias de cobertura|ultimos 30 dias|registros de saida|quantidade de saidas|unidades que sairam|classificacao|classificar)\b/.test(texto);

    const movimentacoes =
        !analiseMovimentacoes &&
        /\b(movimentac|entrada|saida|historico|consumo|venda)\w*\b/.test(texto);

    const fornecedores =
        /\bfornecedor\w*\b/.test(texto);

    const pedidos =
        reposicao ||
        /\b(pedido|pedidos|compra|compras|recebimento)\b/.test(texto);

    const estoque =
        !reposicao &&
        !analiseMovimentacoes &&
        (
            /\b(estoque|saldo|quantidade|produto|produtos|baixo|minimo|disponivel)\b/.test(texto) ||
            (!movimentacoes && !fornecedores && !pedidos)
        );

    return {
        estoque,
        movimentacoes,
        fornecedores,
        pedidos,
        reposicao,
        analiseMovimentacoes
    };
}

// =====================================================
// 4. BLOQUEAR SOLICITAÇÕES DE OPERAÇÕES NO ESTOQUE
// =====================================================

function solicitaOperacaoEstoque(pergunta) {
    const texto = normalizarTexto(pergunta);

    const verbosOperacionais =
        '(?:registr\\w*|lanc\\w*|execut\\w*|realiz\\w*|baix\\w*|' +
        'adicion\\w*|cri\\w*|cadastr\\w*|alter\\w*|atualiz\\w*|' +
        'modific\\w*|exclu\\w*|delet\\w*|cancel\\w*|aprov\\w*|' +
        'receb\\w*|moviment\\w*|efetu\\w*|retir\\w*|remov\\w*|' +
        'diminu\\w*|subtr\\w*|dar\\s+baixa|de\\s+baixa)';

    const comandoDireto = new RegExp(
        `^(?:por favor\\s+)?(?:me\\s+)?${verbosOperacionais}\\b`
    ).test(texto);

    const comandoFazerOperacao =
        /^faca\s+(?:uma?\s+|a\s+|o\s+)?(?:entrada|saida|baixa|movimentacao|reposicao|pedido|compra|venda)\b/.test(texto);

    const perguntaEducativa =
        /^(?:como\b|explique\b|ensine\b|mostre\b|quais passos\b|quais campos\b|qual o procedimento\b|passo a passo\b|quero saber como\b|preciso saber como\b|gostaria de saber como\b|me explique como\b|me ensine como\b|pode me explicar como\b)/.test(texto);

    if (comandoDireto || comandoFazerOperacao) {
        return true;
    }

    if (perguntaEducativa) {
        return false;
    }

    const intencaoDireta = new RegExp(
        `\\b(?:quero|preciso|gostaria|necessito|solicito)\\b.{0,120}\\b(?:que\\s+)?(?:voce\\s+)?${verbosOperacionais}\\b`
    ).test(texto);

    const solicitacaoEducada = new RegExp(
        `\\b(?:pode|poderia)\\s+(?:voce\\s+)?(?:me\\s+)?${verbosOperacionais}\\b`
    ).test(texto);

    const intencaoPorMovimentacao =
        /\b(?:quero|preciso|gostaria|necessito|solicito)\s+(?:de\s+)?(?:uma?\s+)?(?:entrada|saida|baixa|movimentacao|reposicao|compra|venda)\b/.test(texto);

    return (
        intencaoDireta ||
        solicitacaoEducada ||
        intencaoPorMovimentacao
    );
}

// =====================================================
// 5. IDENTIFICAR PERGUNTAS EDUCATIVAS SOBRE MOVIMENTAÇÕES
// =====================================================

function identificarOrientacaoMovimentacao(pergunta) {
    const texto = normalizarTexto(pergunta);

    const perguntaEducativa =
        /^(?:como\b|explique\b|ensine\b|mostre\b|quais passos\b|quais campos\b|qual o procedimento\b|passo a passo\b|quero saber como\b|preciso saber como\b|gostaria de saber como\b|me explique como\b|me ensine como\b|pode me explicar como\b)/.test(texto);

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
    // ESTOQUE ATUAL
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
            limiteConsulta: 50,
            consultaCompleta: (count ?? 0) <= (data ?? []).length,
            observacao: (count ?? 0) > (data ?? []).length
                ? 'A lista foi limitada aos primeiros 50 produtos ativos.'
                : 'Todos os produtos ativos retornados pela consulta foram apresentados.'
        };
    }

    // -------------------------------
    // HISTÓRICO RECENTE DE MOVIMENTAÇÕES
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
            console.error('Erro ao consultar movimentações:', error.message);
            throw new Error('Falha ao consultar movimentações.');
        }

        contexto.movimentacoes = {
            totalRegistrado: count ?? 0,
            movimentacoesConsultadas: data ?? [],
            limiteConsulta: 20,
            consultaCompleta: (count ?? 0) <= (data ?? []).length,
            observacao: 'O histórico detalhado contém no máximo as 20 movimentações mais recentes. O saldo atual não deve ser reconstruído com essa amostra.'
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
            console.error('Erro ao consultar fornecedores:', error.message);
            throw new Error('Falha ao consultar fornecedores.');
        }

        contexto.fornecedores = {
            totalFornecedoresAtivos: count ?? 0,
            fornecedoresConsultados: data ?? [],
            limiteConsulta: 30,
            consultaCompleta: (count ?? 0) <= (data ?? []).length,
            observacao: (count ?? 0) > (data ?? []).length
                ? 'A lista foi limitada aos primeiros 30 fornecedores ativos.'
                : 'Todos os fornecedores ativos retornados pela consulta foram apresentados.'
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
            console.error('Erro ao consultar pedidos:', error.message);
            throw new Error('Falha ao consultar pedidos de compra.');
        }

        contexto.pedidos = {
            totalRegistrado: count ?? 0,
            pedidosConsultados: data ?? [],
            limiteConsulta: 20,
            consultaCompleta: (count ?? 0) <= (data ?? []).length,
            observacao: (count ?? 0) > (data ?? []).length
                ? 'A lista foi limitada aos 20 pedidos mais recentes.'
                : 'Todos os pedidos retornados pela consulta foram apresentados.'
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
            console.error('Erro ao consultar necessidades de reposição:', error.message);
            throw new Error('Falha ao consultar necessidades de reposição.');
        }

        const produtos = data ?? [];

        contexto.reposicao = {
            totalProdutosAbaixoDoMinimo: count ?? 0,
            produtosAbaixoDoMinimo: produtos,
            produtosQuePrecisamDePedido: produtos.filter(
                item => item.necessita_pedido === true
            ),
            produtosComReposicaoCoberta: produtos.filter(
                item => item.necessita_pedido === false
            ),
            limiteConsulta: 50,
            consultaCompleta: (count ?? 0) <= produtos.length,
            observacao: 'Dados calculados pela view oficial do Supabase, considerando pedidos de compra em aberto.'
        };
    }

    // -------------------------------
    // ANÁLISE DE MOVIMENTAÇÕES E CLASSIFICAÇÕES
    // -------------------------------

    if (consultas.analiseMovimentacoes) {
        const { data, error, count } = await supabase
            .from('mustang_recomendacoes_estoque')
            .select(`
                produto_id,
                codigo,
                nome,
                categoria,
                unidade_medida,
                estoque_minimo,
                quantidade_atual,
                situacao_estoque,
                movimentacoes_saida_30d,
                quantidade_saida_30d,
                quantidade_saida_periodo_anterior,
                quantidade_entrada_30d,
                ultima_saida_em,
                media_saida_diaria_30d,
                media_saida_mensal,
                dias_cobertura_estimados,
                variacao_saidas_percentual,
                tendencia_saidas,
                dias_desde_ultima_saida,
                abaixo_estoque_minimo,
                ranking_giro_30d,
                classificacao_giro,
                classificacao_cobertura,
                classificacao_estoque_minimo,
                recomendacao_giro,
                recomendacao_cobertura,
                recomendacao_estoque_minimo,
                recomendacao_gerencial,
                produtos_com_saida_categoria,
                limite_giro_baixo,
                limite_giro_alto,
                criterio_percentil_baixo,
                criterio_percentil_alto,
                dias_ruptura_critica,
                dias_estoque_atencao,
                dias_possivel_excesso,
                amostra_minima_giro
            `, { count: 'exact' })
            .order('quantidade_saida_30d', { ascending: false })
            .order('nome', { ascending: true })
            .limit(50);

        if (error) {
            console.error(
                'Erro ao consultar análise inteligente:',
                error.message
            );

            throw new Error(
                'Falha ao consultar análise inteligente.'
            );
        }

        const produtos = data ?? [];

        const resumoDaAmostra = {
            totalProdutos: produtos.length,

            produtosSemGiro: produtos.filter(
                item => item.classificacao_giro === 'SEM_GIRO'
            ).length,

            produtosComBaixoGiro: produtos.filter(
                item => item.classificacao_giro === 'BAIXO_GIRO'
            ).length,

            produtosComAltoGiro: produtos.filter(
                item => item.classificacao_giro === 'ALTO_GIRO'
            ).length,

            produtosComGiroIntermediario: produtos.filter(
                item => item.classificacao_giro === 'GIRO_INTERMEDIARIO'
            ).length,

            produtosComAmostraInsuficiente: produtos.filter(
                item => item.classificacao_giro === 'AMOSTRA_INSUFICIENTE'
            ).length,

            produtosComRupturaCritica: produtos.filter(
                item => item.classificacao_cobertura === 'RUPTURA_CRITICA'
            ).length,

            produtosComEstoqueEmAtencao: produtos.filter(
                item => item.classificacao_cobertura === 'ESTOQUE_ATENCAO'
            ).length,

            produtosComPossivelExcesso: produtos.filter(
                item => item.classificacao_cobertura === 'POSSIVEL_EXCESSO'
            ).length,

            produtosComCoberturaRegular: produtos.filter(
                item => item.classificacao_cobertura === 'COBERTURA_REGULAR'
            ).length,

            produtosIgualOuAbaixoDoMinimo: produtos.filter(
                item => item.classificacao_estoque_minimo === 'ABAIXO_DO_MINIMO'
            ).length
        };

        contexto.analiseMovimentacoes = {
            totalProdutosNaView: count ?? 0,
            produtosConsultados: produtos,
            resumoDaAmostra,

            parametrosAplicados: {
                percentilBaixo: produtos[0]?.criterio_percentil_baixo ?? null,
                percentilAlto: produtos[0]?.criterio_percentil_alto ?? null,
                diasRupturaCritica: produtos[0]?.dias_ruptura_critica ?? null,
                diasEstoqueAtencao: produtos[0]?.dias_estoque_atencao ?? null,
                diasPossivelExcesso: produtos[0]?.dias_possivel_excesso ?? null,
                amostraMinimaGiro: produtos[0]?.amostra_minima_giro ?? null
            },

            definicaoIndicadores: {
                movimentacoes_saida_30d:
                    'Número de registros de saída nos últimos 30 dias. Conta operações, não unidades.',

                quantidade_saida_30d:
                    'Soma das unidades que saíram nos últimos 30 dias.',

                quantidade_saida_periodo_anterior:
                    'Soma das unidades que saíram nos 30 dias imediatamente anteriores.',

                quantidade_entrada_30d:
                    'Soma das unidades que entraram nos últimos 30 dias.',

                media_saida_diaria_30d:
                    'Média diária de unidades que saíram nos últimos 30 dias.',

                media_saida_mensal:
                    'Total de unidades que saíram nos últimos 30 dias.',

                dias_cobertura_estimados:
                    'Estimativa calculada dividindo o saldo atual pela média diária de saídas.',

                ranking_giro_30d:
                    'Posição comparativa ordenada pela quantidade de unidades que saíram nos últimos 30 dias.',

                classificacao_giro:
                    'Classificação obtida comparando produtos da mesma categoria e unidade de medida, utilizando percentis e amostra mínima.',

                classificacao_cobertura:
                    'Classificação calculada utilizando os limites de dias de cobertura configurados no Supabase.'
            },

            periodoAnalise: 'Últimos 30 dias',
            periodoComparativo: '30 dias imediatamente anteriores ao período atual',
            limiteConsulta: 50,
            consultaCompleta: (count ?? 0) <= produtos.length,

            observacao: (count ?? 0) > produtos.length
                ? 'A análise foi limitada aos primeiros 50 produtos. Os resumos consideram somente os produtos apresentados.'
                : 'Todos os produtos disponíveis na view foram apresentados.'
        };
    }

    return contexto;
}

// =====================================================
// 8. VALIDAR A ESTRUTURA DO HISTÓRICO
// =====================================================

function validarHistorico(historico) {
    if (!Array.isArray(historico) || historico.length > 8) {
        return false;
    }

    return historico.every(mensagem =>
        mensagem &&
        typeof mensagem === 'object' &&
        !Array.isArray(mensagem) &&
        ['user', 'assistant'].includes(mensagem.role) &&
        typeof mensagem.content === 'string' &&
        mensagem.content.trim().length > 0 &&
        mensagem.content.length <= 2000
    );
}

// =====================================================
// 9. FORMATAR VALORES NUMÉRICOS
// =====================================================

function formatarNumero(valor, casas = 2) {
    if (
        valor === null ||
        valor === undefined ||
        valor === ''
    ) {
        return 'Não informado';
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return 'Não informado';
    }

    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: casas
    }).format(numero);
}

// =====================================================
// 10. DESCREVER CLASSIFICAÇÕES
// =====================================================

function descreverClassificacaoGiro(produto) {
    switch (produto.classificacao_giro) {
        case 'SEM_GIRO':
            return 'Sem giro: não foram registradas saídas nos últimos 30 dias.';

        case 'BAIXO_GIRO':
            return 'Baixo giro: volume de saídas abaixo do percentil inferior configurado para a categoria e unidade.';

        case 'GIRO_INTERMEDIARIO':
            return 'Giro intermediário: volume de saídas situado entre os limites percentílicos configurados.';

        case 'ALTO_GIRO':
            return 'Alto giro: volume de saídas acima do percentil superior configurado para a categoria e unidade.';

        case 'AMOSTRA_INSUFICIENTE':
            return 'Amostra insuficiente: não há produtos comparáveis suficientes na categoria e unidade para classificar o giro com segurança.';

        default:
            return 'Classificação de giro não disponível.';
    }
}

function descreverClassificacaoCobertura(produto) {
    switch (produto.classificacao_cobertura) {
        case 'RUPTURA_CRITICA':
            return 'Ruptura crítica: a cobertura estimada está dentro ou abaixo do limite crítico configurado.';

        case 'ESTOQUE_ATENCAO':
            return 'Estoque em atenção: a cobertura estimada está dentro da faixa de atenção configurada.';

        case 'COBERTURA_REGULAR':
            return 'Cobertura regular: a estimativa está dentro da faixa regular configurada.';

        case 'POSSIVEL_EXCESSO':
            return 'Possível excesso: a cobertura estimada ultrapassa o limite configurado. Este resultado é um alerta para avaliação do gestor, não uma confirmação de excesso.';

        case 'SEM_BASE_DE_COBERTURA':
            return 'Sem base de cobertura: não foi possível estimar os dias de cobertura com os dados de saída disponíveis.';

        default:
            return 'Classificação de cobertura não disponível.';
    }
}

// =====================================================
// 11. GERAR RESPOSTA DETERMINÍSTICA DA ANÁLISE
// =====================================================

function gerarRespostaAnaliseMovimentacoes(contexto) {
    const analise = contexto.analiseMovimentacoes;
    const produtos = analise?.produtosConsultados ?? [];

    if (produtos.length === 0) {
        return 'Não foram encontrados produtos na consulta da view de análise inteligente.';
    }

    const parametros = analise.parametrosAplicados ?? {};

    const linhas = [
        'ANÁLISE INTELIGENTE DO ESTOQUE MUSTANG',
        `Período analisado: ${analise.periodoAnalise}`,
        `Período comparativo: ${analise.periodoComparativo}`,
        `Produtos apresentados: ${produtos.length} de ${formatarNumero(analise.totalProdutosNaView, 0)}`,
        '',
        'PARÂMETROS APLICADOS:',
        `Percentil inferior: ${parametros.percentilBaixo == null ? 'Não informado' : `${formatarNumero(Number(parametros.percentilBaixo) * 100, 1)}%`}`,
        `Percentil superior: ${parametros.percentilAlto == null ? 'Não informado' : `${formatarNumero(Number(parametros.percentilAlto) * 100, 1)}%`}`,
        `Amostra mínima para classificação de giro: ${formatarNumero(parametros.amostraMinimaGiro, 0)} produtos`,
        `Ruptura crítica: até ${formatarNumero(parametros.diasRupturaCritica, 0)} dias`,
        `Faixa de atenção: até ${formatarNumero(parametros.diasEstoqueAtencao, 0)} dias`,
        `Possível excesso: acima de ${formatarNumero(parametros.diasPossivelExcesso, 0)} dias`,
        ''
    ];

    for (const produto of produtos) {
        const registrosSaida = Number(produto.movimentacoes_saida_30d ?? 0);
        const unidadesSaida = Number(produto.quantidade_saida_30d ?? 0);
        const unidadesAnterior = Number(produto.quantidade_saida_periodo_anterior ?? 0);
        const unidadesEntrada = Number(produto.quantidade_entrada_30d ?? 0);

        linhas.push('----------------------------------------');
        linhas.push(`PRODUTO: ${produto.nome ?? 'Nome não informado'}`);
        linhas.push(`Código: ${produto.codigo ?? 'Não informado'}`);
        linhas.push(`Categoria: ${produto.categoria ?? 'Não informada'}`);
        linhas.push(`Unidade: ${produto.unidade_medida ?? 'Não informada'}`);
        linhas.push('');

        linhas.push(
            `Registros de saída nos últimos 30 dias: ${formatarNumero(registrosSaida, 0)}`
        );

        linhas.push(
            `Unidades que saíram nos últimos 30 dias: ${formatarNumero(unidadesSaida)}`
        );

        linhas.push(
            `Unidades que saíram no período anterior: ${formatarNumero(unidadesAnterior)}`
        );

        linhas.push(
            `Unidades que entraram nos últimos 30 dias: ${formatarNumero(unidadesEntrada)}`
        );

        linhas.push(
            `Média diária de saída: ${formatarNumero(produto.media_saida_diaria_30d, 4)}`
        );

        linhas.push(
            `Total de saídas nos últimos 30 dias: ${formatarNumero(produto.media_saida_mensal)}`
        );

        linhas.push(
            `Cobertura estimada: ${
                produto.dias_cobertura_estimados === null
                    ? 'Não disponível'
                    : `${formatarNumero(produto.dias_cobertura_estimados)} dias`
            }`
        );

        if (
            produto.variacao_saidas_percentual === null ||
            produto.variacao_saidas_percentual === undefined
        ) {
            linhas.push(
                'Variação percentual: Não calculável por ausência de base comparativa suficiente.'
            );
        } else {
            linhas.push(
                `Variação percentual: ${formatarNumero(produto.variacao_saidas_percentual)}%`
            );
        }

        linhas.push(
            `Tendência: ${produto.tendencia_saidas ?? 'Não informada'}`
        );

        linhas.push(
            `Posição no ranking por unidades de saída: ${formatarNumero(produto.ranking_giro_30d, 0)}`
        );

        linhas.push('');

        linhas.push(
            `CLASSIFICAÇÃO DE GIRO: ${produto.classificacao_giro ?? 'Não disponível'}`
        );

        linhas.push(
            descreverClassificacaoGiro(produto)
        );

        if (produto.classificacao_giro === 'AMOSTRA_INSUFICIENTE') {
            linhas.push(
                `Produtos com saída na categoria e unidade: ${formatarNumero(produto.produtos_com_saida_categoria, 0)}`
            );

            linhas.push(
                `Amostra mínima exigida: ${formatarNumero(produto.amostra_minima_giro, 0)}`
            );
        }

        if (produto.limite_giro_baixo !== null && produto.limite_giro_baixo !== undefined) {
            linhas.push(
                `Limite do percentil inferior: ${formatarNumero(produto.limite_giro_baixo)}`
            );
        }

        if (produto.limite_giro_alto !== null && produto.limite_giro_alto !== undefined) {
            linhas.push(
                `Limite do percentil superior: ${formatarNumero(produto.limite_giro_alto)}`
            );
        }

        linhas.push('');

        linhas.push(
            `CLASSIFICAÇÃO DE COBERTURA: ${produto.classificacao_cobertura ?? 'Não disponível'}`
        );

        linhas.push(
            descreverClassificacaoCobertura(produto)
        );

        linhas.push(
            `Limite de ruptura crítica: ${formatarNumero(produto.dias_ruptura_critica, 0)} dias`
        );

        linhas.push(
            `Limite de atenção: ${formatarNumero(produto.dias_estoque_atencao, 0)} dias`
        );

        linhas.push(
            `Limite de possível excesso: ${formatarNumero(produto.dias_possivel_excesso, 0)} dias`
        );

        linhas.push('');

        linhas.push(
            `Estoque atual: ${formatarNumero(produto.quantidade_atual)} ${produto.unidade_medida ?? ''}`.trim()
        );

        linhas.push(
            `Estoque mínimo: ${formatarNumero(produto.estoque_minimo)} ${produto.unidade_medida ?? ''}`.trim()
        );

        linhas.push(
            `Classificação do estoque mínimo: ${produto.classificacao_estoque_minimo ?? 'Não disponível'}`
        );

        linhas.push(
            `Data da última saída: ${produto.ultima_saida_em ?? 'Não informada'}`
        );

        linhas.push(
            `Dias desde a última saída: ${
                produto.dias_desde_ultima_saida === null ||
                produto.dias_desde_ultima_saida === undefined
                    ? 'Não informado'
                    : formatarNumero(produto.dias_desde_ultima_saida, 0)
            }`
        );

        linhas.push('');
        linhas.push('RECOMENDAÇÕES DO BACKEND');

        linhas.push(
            `Recomendação de giro: ${produto.recomendacao_giro || 'Não disponível.'}`
        );

        linhas.push(
            `Recomendação de cobertura: ${produto.recomendacao_cobertura || 'Não disponível.'}`
        );

        linhas.push(
            `Recomendação de estoque mínimo: ${produto.recomendacao_estoque_minimo || 'Não disponível.'}`
        );

        linhas.push(
            `RECOMENDAÇÃO GERENCIAL: ${produto.recomendacao_gerencial || 'Não disponível.'}`
        );

        linhas.push('');
    }

    linhas.push('----------------------------------------');
    linhas.push('RESUMO DA ANÁLISE');

    const resumo = analise.resumoDaAmostra ?? {};

    linhas.push(
        `Produtos sem giro: ${formatarNumero(resumo.produtosSemGiro, 0)}`
    );

    linhas.push(
        `Produtos com baixo giro: ${formatarNumero(resumo.produtosComBaixoGiro, 0)}`
    );

    linhas.push(
        `Produtos com alto giro: ${formatarNumero(resumo.produtosComAltoGiro, 0)}`
    );

    linhas.push(
        `Produtos com amostra insuficiente: ${formatarNumero(resumo.produtosComAmostraInsuficiente, 0)}`
    );

    linhas.push(
        `Produtos com ruptura crítica: ${formatarNumero(resumo.produtosComRupturaCritica, 0)}`
    );

    linhas.push(
        `Produtos em atenção: ${formatarNumero(resumo.produtosComEstoqueEmAtencao, 0)}`
    );

    linhas.push(
        `Produtos com possível excesso: ${formatarNumero(resumo.produtosComPossivelExcesso, 0)}`
    );

    linhas.push('');

    linhas.push(
        analise.consultaCompleta
            ? 'Completude: todos os produtos disponíveis na view foram apresentados.'
            : 'Limitação: a consulta detalhada foi limitada aos primeiros 50 produtos.'
    );

    linhas.push(
        'IMPORTANTE: POSSIVEL_EXCESSO é um alerta preventivo para revisão do gestor. Não representa confirmação de excesso nem autorização para alterar o estoque.'
    );

    linhas.push(
        'A análise de giro é comparativa dentro da mesma categoria e unidade de medida.'
    );

    linhas.push(
        'Esta consulta não avaliou pedidos de compra. Para determinar necessidade de reposição, consulte a análise específica de reposição.'
    );

    return linhas.join('\n');
}

// =====================================================
// 12. RESPONDER PERGUNTAS SOBRE O MUSTANG
// POST /api/ia/perguntar
// =====================================================

router.post('/perguntar', async (req, res) => {
    try {
        const entrada = req.body;

        // Validar estrutura do corpo.

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

        // Aceitar somente os campos previstos pela rota.

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

        // Validar pergunta.

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

        // Validar histórico.

        if (!Array.isArray(historico) || historico.length > 8) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'O histórico deve conter no máximo 8 mensagens.'
            });
        }

        for (const mensagem of historico) {
            if (
                !mensagem ||
                typeof mensagem !== 'object' ||
                Array.isArray(mensagem) ||
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
        // 13. BLOQUEAR OPERAÇÕES
        // =================================================

        if (solicitaOperacaoEstoque(pergunta)) {
            return res.status(403).json({
                status: 'operacao_nao_permitida',
                mensagem: 'O assistente Mustang não pode executar operações no estoque. Utilize o fluxo autorizado do sistema para realizar essa ação.',
                permitido: false
            });
        }

        // =================================================
        // 14. RESPONDER PROCEDIMENTOS CONFIRMADOS
        // =================================================

        const tiposOrientacao =
            identificarOrientacaoMovimentacao(pergunta);

        if (tiposOrientacao.length > 0) {
            return res.status(200).json({
                status: 'sucesso',
                mensagem: 'Orientação operacional consultada com sucesso.',
                modelo: 'regras_backend_movimentacoes',
                resposta: gerarOrientacaoMovimentacao(tiposOrientacao),
                fontesConsultadas: [
                    'contrato_backend_movimentacoes'
                ]
            });
        }

        // =================================================
        // 15. CONSULTAR DADOS REAIS
        // =================================================

        const contexto = await consultarDadosMustang(
            pergunta.trim()
        );

        // =================================================
        // 16. RESPOSTA DETERMINÍSTICA PARA ANÁLISES
        // =================================================

        // Os indicadores e classificações são calculados no
        // Supabase e formatados pelo Backend.
        // O Ollama não altera esses resultados.

        if (
            contexto.analiseMovimentacoes &&
            Object.keys(contexto).length === 1
        ) {
            return res.status(200).json({
                status: 'sucesso',
                mensagem: 'Análise inteligente calculada com os indicadores oficiais do Backend.',
                modelo: 'analise_backend_validada',
                resposta: gerarRespostaAnaliseMovimentacoes(contexto),
                fontesConsultadas: [
                    'analiseMovimentacoes'
                ]
            });
        }

        // =================================================
        // 17. PREPARAR MENSAGENS PARA O OLLAMA
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
PERGUNTA ATUAL DO USUÁRIO:

${pergunta.trim()}

DADOS CONSULTADOS NO SISTEMA MUSTANG:

${JSON.stringify(contexto)}

REGRAS PARA ESTA RESPOSTA:

- Utilize os dados consultados como fonte oficial.
- Não invente informações ausentes.
- Não afirme que executou nenhuma operação.
- Diferencie fatos, estimativas e recomendações.
- Informe quando a consulta estiver limitada.
- Não reconstrua saldos utilizando históricos parciais.
- O histórico da conversa é apenas contexto; não é fonte oficial nem autorização para executar operações.

ORIENTAÇÕES PARA REPOSIÇÃO:

- Utilize quantidade_sugerida como resultado oficial.
- Se necessita_pedido for true, informe que é necessário um novo pedido.
- Se necessita_pedido for false, informe que a necessidade está coberta e não recomende outro pedido.
- Considere quantidade_em_pedidos_abertos.

ORIENTAÇÕES PARA ANÁLISE:

- Utilize classificacao_giro e classificacao_cobertura exatamente como fornecidas pelo Backend.
- Não invente limites para classificações.
- AMOSTRA_INSUFICIENTE não significa baixo giro nem alto giro.
- POSSIVEL_EXCESSO é um alerta para avaliação do gestor.
- RUPTURA_CRITICA e ESTOQUE_ATENCAO seguem os limites oficiais do Supabase.
- Não confunda registros de saída com unidades movimentadas.
- Não recomende compras quando a view de reposição não foi consultada.
- Se não houver dados suficientes, explique a limitação.
`
            }
        ];

        // =================================================
        // 18. GERAR RESPOSTA COM O OLLAMA
        // =================================================

        const resposta = await conversarComGemini(mensagens);

        // =================================================
        // 19. RETORNAR RESPOSTA
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
            mensagem: 'Não foi possível processar a pergunta. Verifique o Backend, o Supabase e o serviço Ollama.'
        });
    }
});

export default router;
