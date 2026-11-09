
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TABELA = 'mustang_movimentacoes';

const CAMPOS = `
    id,
    created_at,
    produto_id,
    fornecedor_id,
    tipo,
    quantidade,
    motivo,
    data_movimentacao,
    observacao
`;

// =====================================================
// 1. VALIDAÇÕES
// =====================================================

function validarId(valor) {
    return typeof valor === 'string' &&
        /^[1-9]\d*$/.test(valor) &&
        Number.isSafeInteger(Number(valor));
}

function validarData(valor) {
    if (typeof valor !== 'string') return false;

    const data = new Date(valor);

    return !Number.isNaN(data.getTime());
}

function validarPaginacao(pagina, limite) {
    return (
        typeof pagina === 'string' &&
        /^[1-9]\d*$/.test(pagina) &&
        typeof limite === 'string' &&
        /^[1-9]\d*$/.test(limite) &&
        Number.isSafeInteger(Number(pagina)) &&
        Number.isSafeInteger(Number(limite)) &&
        Number(limite) <= 100
    );
}

// =====================================================
// 2. LISTAR MOVIMENTAÇÕES
// GET /api/movimentacoes
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
            .order('data_movimentacao', { ascending: false })
            .order('id', { ascending: false });

        // Filtrar por produto
        if (req.query.produto_id !== undefined) {
            if (!validarId(req.query.produto_id)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'ID de produto inválido.'
                });
            }

            consulta = consulta.eq(
                'produto_id',
                req.query.produto_id
            );
        }

        // Filtrar por fornecedor
        if (req.query.fornecedor_id !== undefined) {
            if (!validarId(req.query.fornecedor_id)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'ID de fornecedor inválido.'
                });
            }

            consulta = consulta.eq(
                'fornecedor_id',
                req.query.fornecedor_id
            );
        }

        // Filtrar por tipo
        if (req.query.tipo !== undefined) {
            if (!['ENTRADA', 'SAIDA'].includes(req.query.tipo)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Tipo inválido. Utilize ENTRADA ou SAIDA.'
                });
            }

            consulta = consulta.eq('tipo', req.query.tipo);
        }

        // Filtrar data inicial
        if (req.query.data_inicio !== undefined) {
            if (!validarData(req.query.data_inicio)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Data inicial inválida.'
                });
            }

            consulta = consulta.gte(
                'data_movimentacao',
                req.query.data_inicio
            );
        }

        // Filtrar data final
        if (req.query.data_fim !== undefined) {
            if (!validarData(req.query.data_fim)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Data final inválida.'
                });
            }

            consulta = consulta.lte(
                'data_movimentacao',
                req.query.data_fim
            );
        }

        if (
            req.query.data_inicio &&
            req.query.data_fim &&
            new Date(req.query.data_inicio) > new Date(req.query.data_fim)
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'A data inicial não pode ser posterior à data final.'
            });
        }

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        const { data, error, count } = await consulta.range(
            inicio,
            fim
        );

        if (error) {
            console.error('Erro ao listar movimentações:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar as movimentações.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Movimentações consultadas com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            movimentacoes: data ?? []
        });

    } catch (error) {
        console.error('Erro ao listar movimentações:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 3. CONSULTAR MOVIMENTAÇÃO POR ID
// GET /api/movimentacoes/:id
// =====================================================

router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'ID de movimentação inválido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .select(CAMPOS)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Erro ao consultar movimentação:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar a movimentação.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Movimentação não encontrada.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Movimentação encontrada.',
            movimentacao: data
        });

    } catch (error) {
        console.error('Erro ao consultar movimentação:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 4. REGISTRAR ENTRADA OU SAÍDA
// POST /api/movimentacoes
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
                mensagem: 'Informe os dados da movimentação em formato JSON.'
            });
        }

        const camposPermitidos = [
            'produto_id',
            'fornecedor_id',
            'tipo',
            'quantidade',
            'motivo',
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
            tipo,
            quantidade,
            motivo,
            observacao = null
        } = entrada;

        if (
            !Number.isSafeInteger(produto_id) ||
            produto_id <= 0
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        if (
            fornecedor_id !== null &&
            (
                !Number.isSafeInteger(fornecedor_id) ||
                fornecedor_id <= 0
            )
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de fornecedor válido.'
            });
        }

        if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Tipo inválido. Utilize ENTRADA ou SAIDA.'
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
            typeof motivo !== 'string' ||
            !motivo.trim() ||
            motivo.trim().length > 500
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um motivo válido com até 500 caracteres.'
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
                mensagem: 'A observação deve ser um texto de até 2000 caracteres.'
            });
        }

        // Executar função transacional no PostgreSQL
        const { data, error } = await supabase.rpc(
            'mustang_registrar_movimentacao',
            {
                p_produto_id: produto_id,
                p_tipo: tipo,
                p_quantidade: quantidade,
                p_motivo: motivo.trim(),
                p_fornecedor_id: fornecedor_id,
                p_observacao: observacao?.trim() || null
            }
        );

        if (error) {
            const mensagem = error.message ?? '';

            console.error(
                'Erro ao registrar movimentação:',
                mensagem
            );

            const errosValidacao = {
                PRODUTO_ID_INVALIDO: 'ID de produto inválido.',
                TIPO_MOVIMENTACAO_INVALIDO: 'Tipo de movimentação inválido.',
                QUANTIDADE_INVALIDA: 'Quantidade inválida.',
                MOTIVO_OBRIGATORIO: 'O motivo é obrigatório.',
                PRODUTO_NAO_ENCONTRADO: 'Produto não encontrado.',
                PRODUTO_INATIVO: 'Não é permitido movimentar um produto inativo.',
                FORNECEDOR_ID_INVALIDO: 'ID de fornecedor inválido.',
                FORNECEDOR_NAO_ENCONTRADO: 'Fornecedor não encontrado.',
                FORNECEDOR_INATIVO: 'Não é permitido utilizar um fornecedor inativo.'
            };

            for (const [codigo, descricao] of Object.entries(errosValidacao)) {
                if (mensagem.includes(codigo)) {
                    return res.status(
                        codigo.includes('NAO_ENCONTRADO') ? 404 : 400
                    ).json({
                        status: 'erro',
                        mensagem: descricao
                    });
                }
            }

            if (mensagem.includes('SALDO_INSUFICIENTE')) {
                return res.status(409).json({
                    status: 'saldo_insuficiente',
                    mensagem: 'A quantidade solicitada é superior ao estoque disponível.',
                    detalhes: mensagem
                });
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível registrar a movimentação.'
            });
        }

        return res.status(201).json({
            status: 'sucesso',
            mensagem: 'Movimentação registrada com sucesso.',
            resultado: data
        });

    } catch (error) {
        console.error('Erro ao registrar movimentação:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

export default router;
