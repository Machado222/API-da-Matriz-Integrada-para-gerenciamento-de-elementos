
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TABELA = 'mustang_pedidos_compra';

const CAMPOS = `
    id,
    created_at,
    produto_id,
    fornecedor_id,
    quantidade,
    status,
    data_pedido,
    previsao_entrega,
    data_recebimento,
    observacao
`;

const STATUS_PERMITIDOS = [
    'PENDENTE',
    'APROVADO',
    'PEDIDO_REALIZADO',
    'RECEBIDO',
    'CANCELADO'
];

const STATUS_ABERTOS = [
    'PENDENTE',
    'APROVADO',
    'PEDIDO_REALIZADO'
];

const TRANSICOES = {
    PENDENTE: ['APROVADO', 'CANCELADO'],
    APROVADO: ['PEDIDO_REALIZADO', 'CANCELADO'],
    PEDIDO_REALIZADO: [],
    RECEBIDO: [],
    CANCELADO: []
};

// =====================================================
// 1. VALIDAÇÕES
// =====================================================

function validarId(valor) {
    return (
        typeof valor === 'string' &&
        /^[1-9]\d*$/.test(valor) &&
        Number.isSafeInteger(Number(valor))
    );
}

function validarIdNumerico(valor) {
    return (
        Number.isSafeInteger(valor) &&
        valor > 0
    );
}

function validarPaginacao(pagina, limite) {
    if (
        typeof pagina !== 'string' ||
        !/^[1-9]\d*$/.test(pagina) ||
        typeof limite !== 'string' ||
        !/^[1-9]\d*$/.test(limite)
    ) {
        return false;
    }

    const p = Number(pagina);
    const l = Number(limite);

    return (
        Number.isSafeInteger(p) &&
        Number.isSafeInteger(l) &&
        l <= 100
    );
}

function validarData(valor) {
    if (
        typeof valor !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(valor)
    ) {
        return false;
    }

    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));

    return (
        data.getUTCFullYear() === ano &&
        data.getUTCMonth() === mes - 1 &&
        data.getUTCDate() === dia
    );
}


 // =====================================================
// 2. IDENTIFICAR NECESSIDADES DE REPOSIÇÃO
// GET /api/pedidos-compra/reposicao
// =====================================================

router.get('/reposicao', async (req, res) => {
    try {
        const paginaParam = req.query.pagina ?? '1';
        const limiteParam = req.query.limite ?? '20';

        if (!validarPaginacao(paginaParam, limiteParam)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe uma página válida e um limite entre 1 e 100.'
            });
        }

        const pagina = Number(paginaParam);
        const limite = Number(limiteParam);

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

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
            .gt('quantidade_sugerida', 0)
            .order('quantidade_atual', { ascending: true })
            .order('produto_id', { ascending: true })
            .range(inicio, fim);

        if (error) {
            console.error(
                'Erro ao identificar reposições:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível identificar os produtos para reposição.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Necessidades de reposição consultadas com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            produtos: data ?? []
        });

    } catch (error) {
        console.error('Erro ao consultar reposição:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// =====================================================
// 3. LISTAR PEDIDOS
// GET /api/pedidos-compra
// =====================================================

router.get('/', async (req, res) => {
    try {
        const paginaParam = req.query.pagina ?? '1';
        const limiteParam = req.query.limite ?? '20';

        if (!validarPaginacao(paginaParam, limiteParam)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe uma página válida e um limite entre 1 e 100.'
            });
        }

        const pagina = Number(paginaParam);
        const limite = Number(limiteParam);

        let consulta = supabase
            .from(TABELA)
            .select(CAMPOS, { count: 'exact' })
            .order('data_pedido', { ascending: false })
            .order('id', { ascending: false });

        if (req.query.status !== undefined) {
            if (
                typeof req.query.status !== 'string' ||
                !STATUS_PERMITIDOS.includes(req.query.status)
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Status inválido.',
                    statusPermitidos: STATUS_PERMITIDOS
                });
            }

            consulta = consulta.eq('status', req.query.status);
        }

        if (req.query.produto_id !== undefined) {
            if (!validarId(req.query.produto_id)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'ID de produto inválido.'
                });
            }

            consulta = consulta.eq('produto_id', req.query.produto_id);
        }

        if (req.query.fornecedor_id !== undefined) {
            if (!validarId(req.query.fornecedor_id)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'ID de fornecedor inválido.'
                });
            }

            consulta = consulta.eq('fornecedor_id', req.query.fornecedor_id);
        }

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        const { data, error, count } = await consulta.range(inicio, fim);

        if (error) {
            console.error('Erro ao listar pedidos:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar os pedidos.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Pedidos de compra consultados com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            pedidos: data ?? []
        });

    } catch (error) {
        console.error('Erro ao listar pedidos:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 4. CONSULTAR PEDIDO POR ID
// GET /api/pedidos-compra/:id
// =====================================================

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'ID de pedido inválido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .select(CAMPOS)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Erro ao consultar pedido:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o pedido.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Pedido de compra não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Pedido encontrado com sucesso.',
            pedido: data
        });

    } catch (error) {
        console.error('Erro ao consultar pedido:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 5. CRIAR PEDIDO DE COMPRA
// POST /api/pedidos-compra
// =====================================================

router.post('/', async (req, res) => {
    try {
        const entrada = req.body;

        if (
            !entrada ||
            typeof entrada !== 'object' ||
            Array.isArray(entrada)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe os dados do pedido em formato JSON.'
            });
        }

        const camposPermitidos = [
            'produto_id',
            'fornecedor_id',
            'quantidade',
            'previsao_entrega',
            'observacao'
        ];

        const desconhecidos = Object.keys(entrada).filter(
            campo => !camposPermitidos.includes(campo)
        );

        if (desconhecidos.length > 0) {
            return res.status(400).json({
                status: 'erro',
                mensagem: `Campos não permitidos: ${desconhecidos.join(', ')}.`
            });
        }

        const {
            produto_id,
            fornecedor_id = null,
            quantidade,
            previsao_entrega = null,
            observacao = null
        } = entrada;

        if (!validarIdNumerico(produto_id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        if (
            fornecedor_id !== null &&
            !validarIdNumerico(fornecedor_id)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de fornecedor válido.'
            });
        }

        if (
            typeof quantidade !== 'number' ||
            !Number.isFinite(quantidade) ||
            quantidade <= 0
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'A quantidade deve ser um número maior que zero.'
            });
        }

        if (
            previsao_entrega !== null &&
            !validarData(previsao_entrega)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe uma previsão de entrega válida no formato AAAA-MM-DD.'
            });
        }

        if (
            observacao !== null &&
            (
                typeof observacao !== 'string' ||
                observacao.length > 2000
            )
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'A observação deve ter até 2000 caracteres.'
            });
        }

        const { data: produto, error: erroProduto } = await supabase
            .from('mustang_produtos')
            .select('id, ativo')
            .eq('id', produto_id)
            .maybeSingle();

        if (erroProduto) {
            console.error('Erro ao validar produto:', erroProduto.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível validar o produto.'
            });
        }

        if (!produto) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Produto não encontrado.'
            });
        }

        if (!produto.ativo) {
            return res.status(409).json({
                status: 'erro',
                mensagem: 'Não é permitido criar pedidos para produtos inativos.'
            });
        }

        if (fornecedor_id !== null) {
            const { data: fornecedor, error: erroFornecedor } = await supabase
                .from('mustang_fornecedores')
                .select('id, ativo')
                .eq('id', fornecedor_id)
                .maybeSingle();

            if (erroFornecedor) {
                console.error('Erro ao validar fornecedor:', erroFornecedor.message);

                return res.status(500).json({
                    status: 'erro',
                    mensagem: 'Não foi possível validar o fornecedor.'
                });
            }

            if (!fornecedor) {
                return res.status(404).json({
                    status: 'nao_encontrado',
                    mensagem: 'Fornecedor não encontrado.'
                });
            }

            if (!fornecedor.ativo) {
                return res.status(409).json({
                    status: 'erro',
                    mensagem: 'Não é permitido utilizar um fornecedor inativo.'
                });
            }
        }

        const { data, error } = await supabase
            .from(TABELA)
            .insert({
                produto_id,
                fornecedor_id,
                quantidade,
                status: 'PENDENTE',
                previsao_entrega,
                observacao: observacao?.trim() || null
            })
            .select(CAMPOS)
            .single();

        if (error) {
            console.error('Erro ao criar pedido:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível criar o pedido de compra.'
            });
        }

        return res.status(201).json({
            status: 'sucesso',
            mensagem: 'Pedido de compra criado com sucesso.',
            pedido: data
        });

    } catch (error) {
        console.error('Erro ao criar pedido:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 6. ALTERAR STATUS DO PEDIDO
// PATCH /api/pedidos-compra/:id/status
// =====================================================

router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const entrada = req.body;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'ID de pedido inválido.'
            });
        }

        if (
            !entrada ||
            typeof entrada !== 'object' ||
            Array.isArray(entrada)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe o novo status em formato JSON.'
            });
        }

        const campos = Object.keys(entrada);

        if (
            campos.length !== 1 ||
            campos[0] !== 'status' ||
            typeof entrada.status !== 'string' ||
            !STATUS_PERMITIDOS.includes(entrada.status)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um status válido.',
                statusPermitidos: STATUS_PERMITIDOS
            });
        }

        const { data: pedido, error: erroConsulta } = await supabase
            .from(TABELA)
            .select('id, status')
            .eq('id', id)
            .maybeSingle();

        if (erroConsulta) {
            console.error('Erro ao consultar status:', erroConsulta.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o pedido.'
            });
        }

        if (!pedido) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Pedido de compra não encontrado.'
            });
        }

        const transicoesPermitidas = TRANSICOES[pedido.status] ?? [];

        if (!transicoesPermitidas.includes(entrada.status)) {
            return res.status(409).json({
                status: 'transicao_nao_permitida',
                mensagem: `Não é permitido alterar o pedido de ${pedido.status} para ${entrada.status}.`,
                statusAtual: pedido.status,
                transicoesPermitidas
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .update({
                status: entrada.status
            })
            .eq('id', id)
            .eq('status', pedido.status)
            .select(CAMPOS)
            .maybeSingle();

        if (error) {
            console.error('Erro ao atualizar pedido:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível atualizar o status do pedido.'
            });
        }

        if (!data) {
            return res.status(409).json({
                status: 'conflito',
                mensagem: 'O pedido foi alterado por outra operação. Consulte novamente.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Status do pedido atualizado com sucesso.',
            pedido: data
        });

    } catch (error) {
        console.error('Erro ao atualizar status:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 7. RECEBER PEDIDO E REGISTRAR ENTRADA NO ESTOQUE
// POST /api/pedidos-compra/:id/receber
// =====================================================

router.post('/:id/receber', async (req, res) => {
    try {
        const { id } = req.params;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'ID de pedido inválido.'
            });
        }

        const { data, error } = await supabase.rpc(
            'mustang_receber_pedido_compra',
            {
                p_pedido_id: Number(id)
            }
        );

        if (error) {
            const mensagem = error.message ?? '';

            console.error('Erro ao receber pedido:', mensagem);

            const erros = {
                PEDIDO_ID_INVALIDO: {
                    http: 400,
                    descricao: 'ID de pedido inválido.'
                },
                PEDIDO_NAO_ENCONTRADO: {
                    http: 404,
                    descricao: 'Pedido de compra não encontrado.'
                },
                PEDIDO_NAO_ELEGIVEL_RECEBIMENTO: {
                    http: 409,
                    descricao: 'Somente pedidos com status PEDIDO_REALIZADO podem ser recebidos.'
                },
                PRODUTO_NAO_ENCONTRADO: {
                    http: 404,
                    descricao: 'Produto vinculado ao pedido não encontrado.'
                },
                FORNECEDOR_NAO_ENCONTRADO: {
                    http: 404,
                    descricao: 'Fornecedor vinculado ao pedido não encontrado.'
                },
                PRODUTO_INATIVO: {
                    http: 409,
                    descricao: 'O produto está inativo e não pode receber movimentações.'
                },
                FORNECEDOR_INATIVO: {
                    http: 409,
                    descricao: 'O fornecedor está inativo e não pode ser utilizado.'
                }
            };

            for (const [codigo, detalhe] of Object.entries(erros)) {
                if (mensagem.includes(codigo)) {
                    return res.status(detalhe.http).json({
                        status: 'erro',
                        mensagem: detalhe.descricao
                    });
                }
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível receber o pedido.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Pedido recebido e entrada registrada no estoque.',
            resultado: data
        });

    } catch (error) {
        console.error('Erro ao receber pedido:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

export default router;
