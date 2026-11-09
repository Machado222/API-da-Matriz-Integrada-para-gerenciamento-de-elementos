
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TABELA = 'mustang_produtos';

const CAMPOS = `
    id,
    created_at,
    codigo,
    nome,
    descricao,
    categoria,
    unidade_medida,
    preco_custo,
    preco_venda,
    estoque_minimo,
    ativo
`;

// =====================================================
// 1. VALIDAR ID
// =====================================================

function validarId(id) {
    return typeof id === 'string' &&
        /^[1-9]\d*$/.test(id) &&
        Number.isSafeInteger(Number(id));
}

// =====================================================
// 2. VALIDAR DADOS DO PRODUTO
// =====================================================

function validarDadosProduto(entrada, criacao = false) {
    if (
        !entrada ||
        typeof entrada !== 'object' ||
        Array.isArray(entrada)
    ) {
        return {
            erro: 'Informe os dados do produto em formato JSON.'
        };
    }

    const camposPermitidos = [
        'codigo',
        'nome',
        'descricao',
        'categoria',
        'unidade_medida',
        'preco_custo',
        'preco_venda',
        'estoque_minimo',
        'ativo'
    ];

    const desconhecidos = Object.keys(entrada).filter(
        campo => !camposPermitidos.includes(campo)
    );

    if (desconhecidos.length > 0) {
        return {
            erro: `Campos não permitidos: ${desconhecidos.join(', ')}.`
        };
    }

    if (Object.keys(entrada).length === 0) {
        return {
            erro: 'Informe pelo menos um campo para atualizar.'
        };
    }

    const dados = {};

    // Campos de texto
    const camposTexto = [
        'codigo',
        'nome',
        'descricao',
        'categoria',
        'unidade_medida'
    ];

    for (const campo of camposTexto) {
        if (!Object.hasOwn(entrada, campo)) {
            continue;
        }

        const valor = entrada[campo];

        if (
            (campo === 'descricao' || campo === 'categoria') &&
            valor === null
        ) {
            dados[campo] = null;
            continue;
        }

        if (typeof valor !== 'string') {
            return {
                erro: `O campo ${campo} deve ser um texto.`
            };
        }

        const texto = valor.trim();

        if (
            !texto &&
            ['codigo', 'nome', 'unidade_medida'].includes(campo)
        ) {
            return {
                erro: `O campo ${campo} não pode ficar vazio.`
            };
        }

        dados[campo] = texto || null;
    }

    // Campos numéricos
    const camposNumericos = [
        'preco_custo',
        'preco_venda',
        'estoque_minimo'
    ];

    for (const campo of camposNumericos) {
        if (!Object.hasOwn(entrada, campo)) {
            continue;
        }

        const valor = entrada[campo];

        if (
            typeof valor !== 'number' &&
            typeof valor !== 'string'
        ) {
            return {
                erro: `O campo ${campo} deve ser numérico.`
            };
        }

        if (typeof valor === 'string' && !valor.trim()) {
            return {
                erro: `O campo ${campo} não pode ficar vazio.`
            };
        }

        const numero = Number(valor);

        if (!Number.isFinite(numero) || numero < 0) {
            return {
                erro: `O campo ${campo} deve ser um número válido e não negativo.`
            };
        }

        dados[campo] = numero;
    }

    // Campo booleano
    if (Object.hasOwn(entrada, 'ativo')) {
        if (typeof entrada.ativo !== 'boolean') {
            return {
                erro: 'O campo ativo deve ser verdadeiro ou falso.'
            };
        }

        dados.ativo = entrada.ativo;
    }

    // Campos obrigatórios no cadastro
    if (criacao) {
        if (!dados.codigo) {
            return {
                erro: 'O código do produto é obrigatório.'
            };
        }

        if (!dados.nome) {
            return {
                erro: 'O nome do produto é obrigatório.'
            };
        }
    }

    return { dados };
}

// =====================================================
// 3. LISTAR PRODUTOS
// GET /api/produtos
// =====================================================

router.get('/', async (req, res) => {
    try {
        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 20);

        if (
            !Number.isInteger(pagina) ||
            pagina < 1 ||
            !Number.isInteger(limite) ||
            limite < 1 ||
            limite > 100
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe uma página válida e um limite entre 1 e 100.'
            });
        }

        let consulta = supabase
            .from(TABELA)
            .select(CAMPOS, { count: 'exact' })
            .order('id', { ascending: true });

        // Filtrar por situação
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

        // Pesquisar pelo nome
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

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        const { data, error, count } = await consulta.range(inicio, fim);

        if (error) {
            console.error('Erro ao listar produtos:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar os produtos.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Produtos consultados com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            produtos: data ?? []
        });

    } catch (error) {
        console.error('Erro ao listar produtos:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 4. CONSULTAR PRODUTO PELO ID
// GET /api/produtos/:id
// =====================================================

router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .select(CAMPOS)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Erro ao consultar produto:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o produto.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Produto não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Produto encontrado.',
            produto: data
        });

    } catch (error) {
        console.error('Erro ao consultar produto:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 5. CADASTRAR PRODUTO
// POST /api/produtos
// =====================================================

router.post('/', async (req, res) => {
    try {
        const validacao = validarDadosProduto(req.body, true);

        if (validacao.erro) {
            return res.status(400).json({
                status: 'erro',
                mensagem: validacao.erro
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .insert(validacao.dados)
            .select(CAMPOS)
            .single();

        if (error) {
            console.error('Erro ao cadastrar produto:', error.message);

            if (error.code === '23505') {
                return res.status(409).json({
                    status: 'conflito',
                    mensagem: 'Já existe um produto cadastrado com esse código.'
                });
            }

            if (error.code === '23514') {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Os dados informados violam uma regra de validação do banco.'
                });
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível cadastrar o produto.'
            });
        }

        return res.status(201).json({
            status: 'sucesso',
            mensagem: 'Produto cadastrado com sucesso.',
            produto: data
        });

    } catch (error) {
        console.error('Erro ao cadastrar produto:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 6. ATUALIZAR PRODUTO
// PUT /api/produtos/:id
// =====================================================

router.put('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        const validacao = validarDadosProduto(req.body);

        if (validacao.erro) {
            return res.status(400).json({
                status: 'erro',
                mensagem: validacao.erro
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .update(validacao.dados)
            .eq('id', id)
            .select(CAMPOS)
            .maybeSingle();

        if (error) {
            console.error('Erro ao atualizar produto:', error.message);

            if (error.code === '23505') {
                return res.status(409).json({
                    status: 'conflito',
                    mensagem: 'Já existe outro produto com esse código.'
                });
            }

            if (error.code === '23514') {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Os dados informados violam uma regra de validação do banco.'
                });
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível atualizar o produto.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Produto não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Produto atualizado com sucesso.',
            produto: data
        });

    } catch (error) {
        console.error('Erro ao atualizar produto:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 7. EXCLUIR PRODUTO DEFINITIVAMENTE
// DELETE /api/produtos/:id/permanente
// =====================================================

router.delete('/:id/permanente', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        // Verificar movimentações vinculadas
        const {
            count: totalMovimentacoes,
            error: erroMovimentacoes
        } = await supabase
            .from('mustang_movimentacoes')
            .select('id', { count: 'exact', head: true })
            .eq('produto_id', id);

        if (erroMovimentacoes) {
            console.error(
                'Erro ao verificar movimentações:',
                erroMovimentacoes.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível verificar o histórico do produto.'
            });
        }

        // Verificar pedidos de compra vinculados
        const {
            count: totalPedidos,
            error: erroPedidos
        } = await supabase
            .from('mustang_pedidos_compra')
            .select('id', { count: 'exact', head: true })
            .eq('produto_id', id);

        if (erroPedidos) {
            console.error(
                'Erro ao verificar pedidos:',
                erroPedidos.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível verificar os pedidos do produto.'
            });
        }

        // Bloquear exclusão se houver dependências
        if (
            (totalMovimentacoes ?? 0) > 0 ||
            (totalPedidos ?? 0) > 0
        ) {
            return res.status(409).json({
                status: 'conflito',
                mensagem: 'O produto não pode ser excluído definitivamente porque possui registros vinculados.',
                dependencias: {
                    movimentacoes: totalMovimentacoes ?? 0,
                    pedidos_compra: totalPedidos ?? 0
                }
            });
        }

        // Excluir definitivamente
        const { data, error } = await supabase
            .from(TABELA)
            .delete()
            .eq('id', id)
            .select(CAMPOS)
            .maybeSingle();

        if (error) {
            console.error('Erro ao excluir produto:', error.message);

            // Proteção adicional pelas restrições do banco
            if (error.code === '23503') {
                return res.status(409).json({
                    status: 'conflito',
                    mensagem: 'A exclusão foi bloqueada porque existem registros vinculados ao produto.'
                });
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível excluir o produto.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Produto não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Produto excluído definitivamente.',
            produto: data
        });

    } catch (error) {
        console.error('Erro ao excluir produto:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 8. DESATIVAR PRODUTO
// DELETE /api/produtos/:id
// =====================================================

router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de produto válido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .update({ ativo: false })
            .eq('id', id)
            .select(CAMPOS)
            .maybeSingle();

        if (error) {
            console.error('Erro ao desativar produto:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível desativar o produto.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Produto não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Produto desativado com sucesso.',
            produto: data
        });

    } catch (error) {
        console.error('Erro ao desativar produto:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

export default router;
