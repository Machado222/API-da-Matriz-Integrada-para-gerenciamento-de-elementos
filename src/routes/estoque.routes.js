
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TABELA = 'mustang_estoque_atual';

const CAMPOS = `
    produto_id,
    codigo,
    nome,
    categoria,
    unidade_medida,
    preco_custo,
    preco_venda,
    estoque_minimo,
    ativo,
    quantidade_atual,
    situacao_estoque
`;

const SITUACOES_PERMITIDAS = [
    'SEM_ESTOQUE',
    'ESTOQUE_BAIXO',
    'NORMAL'
];

// =====================================================
// 1. VALIDAR ID DO PRODUTO
// =====================================================

function validarId(id) {
    return typeof id === 'string' &&
        /^[1-9]\d*$/.test(id);
}

// =====================================================
// 2. VALIDAR PAGINAÇÃO
// =====================================================

function validarPaginacao(pagina, limite) {
    if (
        typeof pagina !== 'string' ||
        !/^[1-9]\d*$/.test(pagina) ||
        typeof limite !== 'string' ||
        !/^[1-9]\d*$/.test(limite)
    ) {
        return false;
    }

    const numeroPagina = Number(pagina);
    const numeroLimite = Number(limite);

    return (
        Number.isSafeInteger(numeroPagina) &&
        Number.isSafeInteger(numeroLimite) &&
        numeroPagina >= 1 &&
        numeroLimite >= 1 &&
        numeroLimite <= 100
    );
}

// =====================================================
// 3. LISTAR ESTOQUE ATUAL
// GET /api/estoque
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
            .order('produto_id', { ascending: true });

        // Filtrar por situação do estoque
        if (req.query.situacao_estoque !== undefined) {
            const situacao = req.query.situacao_estoque;

            if (
                typeof situacao !== 'string' ||
                !SITUACOES_PERMITIDAS.includes(situacao)
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Situação de estoque inválida.',
                    situacoesPermitidas: SITUACOES_PERMITIDAS
                });
            }

            consulta = consulta.eq(
                'situacao_estoque',
                situacao
            );
        }

        // Filtrar por situação do produto
        if (req.query.ativo !== undefined) {
            if (!['true', 'false'].includes(req.query.ativo)) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'O filtro ativo deve ser true ou false.'
                });
            }

            consulta = consulta.eq(
                'ativo',
                req.query.ativo === 'true'
            );
        }

        // Filtrar por categoria
        if (req.query.categoria !== undefined) {
            if (
                typeof req.query.categoria !== 'string' ||
                !req.query.categoria.trim()
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Informe uma categoria válida.'
                });
            }

            consulta = consulta.eq(
                'categoria',
                req.query.categoria.trim()
            );
        }

        // Filtrar por código
        if (req.query.codigo !== undefined) {
            if (
                typeof req.query.codigo !== 'string' ||
                !req.query.codigo.trim()
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Informe um código válido.'
                });
            }

            consulta = consulta.eq(
                'codigo',
                req.query.codigo.trim()
            );
        }

        // Pesquisar por nome
        if (req.query.nome !== undefined) {
            if (
                typeof req.query.nome !== 'string' ||
                !req.query.nome.trim() ||
                req.query.nome.length > 100
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Informe um nome válido com até 100 caracteres.'
                });
            }

            consulta = consulta.ilike(
                'nome',
                `%${req.query.nome.trim()}%`
            );
        }

        // Aplicar paginação
        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        const { data, error, count } = await consulta.range(
            inicio,
            fim
        );

        if (error) {
            console.error(
                'Erro ao consultar estoque:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o estoque.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Estoque consultado com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            estoques: data ?? []
        });

    } catch (error) {
        console.error('Erro ao listar estoque:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 4. CONSULTAR ESTOQUE DE UM PRODUTO
// GET /api/estoque/:produtoId
// =====================================================

router.get('/:produtoId', async (req, res) => {
    try {
        const produtoId = req.params.produtoId;

        if (!validarId(produtoId)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .select(CAMPOS)
            .eq('produto_id', produtoId)
            .maybeSingle();

        if (error) {
            console.error(
                'Erro ao consultar estoque do produto:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o estoque do produto.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Produto não encontrado no estoque.',
                produtoId
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Estoque do produto consultado com sucesso.',
            estoque: data
        });

    } catch (error) {
        console.error('Erro ao consultar estoque:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

export default router;
