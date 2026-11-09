
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

const TABELA = 'mustang_fornecedores';

const CAMPOS = `
    id,
    created_at,
    nome,
    cnpj,
    telefone,
    email,
    endereco,
    ativo
`;

// =====================================================
// 1. VALIDAR ID
// =====================================================

function validarId(id) {
    return typeof id === 'string' &&
        /^[1-9]\d*$/.test(id);
}

// =====================================================
// 2. NORMALIZAR CNPJ
// =====================================================

function normalizarCnpj(valor) {
    if (valor === null) {
        return null;
    }

    const normalizado = valor
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

    return normalizado || null;
}

// =====================================================
// 3. VALIDAR DADOS DO FORNECEDOR
// =====================================================

function validarDadosFornecedor(entrada, criacao = false) {
    if (
        !entrada ||
        typeof entrada !== 'object' ||
        Array.isArray(entrada)
    ) {
        return {
            erro: 'Informe os dados do fornecedor em formato JSON.'
        };
    }

    const camposPermitidos = [
        'nome',
        'cnpj',
        'telefone',
        'email',
        'endereco',
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
            erro: 'Informe pelo menos um campo para a operação.'
        };
    }

    const dados = {};

    // Nome obrigatório
    if (Object.hasOwn(entrada, 'nome')) {
        if (typeof entrada.nome !== 'string') {
            return {
                erro: 'O nome do fornecedor deve ser um texto.'
            };
        }

        dados.nome = entrada.nome.trim();

        if (!dados.nome) {
            return {
                erro: 'O nome do fornecedor não pode ficar vazio.'
            };
        }
    }

    // Campos opcionais
    const camposTexto = [
        'telefone',
        'email',
        'endereco'
    ];

    for (const campo of camposTexto) {
        if (!Object.hasOwn(entrada, campo)) {
            continue;
        }

        const valor = entrada[campo];

        if (valor === null) {
            dados[campo] = null;
            continue;
        }

        if (typeof valor !== 'string') {
            return {
                erro: `O campo ${campo} deve ser um texto.`
            };
        }

        dados[campo] = valor.trim() || null;
    }

    // CNPJ
    if (Object.hasOwn(entrada, 'cnpj')) {
        const valor = entrada.cnpj;

        if (valor !== null && typeof valor !== 'string') {
            return {
                erro: 'O CNPJ deve ser informado como texto.'
            };
        }

        if (valor === null) {
            dados.cnpj = null;
        } else {
            dados.cnpj = normalizarCnpj(valor);
        }
    }

    // Situação do fornecedor
    if (Object.hasOwn(entrada, 'ativo')) {
        if (typeof entrada.ativo !== 'boolean') {
            return {
                erro: 'O campo ativo deve ser verdadeiro ou falso.'
            };
        }

        dados.ativo = entrada.ativo;
    }

    // Validar obrigatoriedade no cadastro
    if (criacao && !dados.nome) {
        return {
            erro: 'O nome do fornecedor é obrigatório.'
        };
    }

    return { dados };
}

// =====================================================
// 4. LISTAR FORNECEDORES
// GET /api/fornecedores
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

        // Filtrar por CNPJ
        if (req.query.cnpj !== undefined) {
            if (
                typeof req.query.cnpj !== 'string' ||
                !req.query.cnpj.trim()
            ) {
                return res.status(400).json({
                    status: 'erro',
                    mensagem: 'Informe um CNPJ válido.'
                });
            }

            consulta = consulta.eq(
                'cnpj',
                normalizarCnpj(req.query.cnpj)
            );
        }

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        const { data, error, count } = await consulta.range(inicio, fim);

        if (error) {
            console.error(
                'Erro ao listar fornecedores:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar os fornecedores.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Fornecedores consultados com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            fornecedores: data ?? []
        });

    } catch (error) {
        console.error('Erro ao listar fornecedores:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 5. CONSULTAR FORNECEDOR PELO ID
// GET /api/fornecedores/:id
// =====================================================

router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de fornecedor válido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .select(CAMPOS)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error(
                'Erro ao consultar fornecedor:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o fornecedor.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Fornecedor não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Fornecedor encontrado.',
            fornecedor: data
        });

    } catch (error) {
        console.error('Erro ao consultar fornecedor:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 6. CADASTRAR FORNECEDOR
// POST /api/fornecedores
// =====================================================

router.post('/', async (req, res) => {
    try {
        const validacao = validarDadosFornecedor(req.body, true);

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
            console.error(
                'Erro ao cadastrar fornecedor:',
                error.message
            );

            if (error.code === '23505') {
                return res.status(409).json({
                    status: 'conflito',
                    mensagem: 'Já existe um fornecedor cadastrado com esse CNPJ.'
                });
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível cadastrar o fornecedor.'
            });
        }

        return res.status(201).json({
            status: 'sucesso',
            mensagem: 'Fornecedor cadastrado com sucesso.',
            fornecedor: data
        });

    } catch (error) {
        console.error('Erro ao cadastrar fornecedor:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 7. ATUALIZAR FORNECEDOR
// PUT /api/fornecedores/:id
// =====================================================

router.put('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de fornecedor válido.'
            });
        }

        const validacao = validarDadosFornecedor(req.body);

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
            console.error(
                'Erro ao atualizar fornecedor:',
                error.message
            );

            if (error.code === '23505') {
                return res.status(409).json({
                    status: 'conflito',
                    mensagem: 'Já existe outro fornecedor cadastrado com esse CNPJ.'
                });
            }

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível atualizar o fornecedor.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Fornecedor não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Fornecedor atualizado com sucesso.',
            fornecedor: data
        });

    } catch (error) {
        console.error('Erro ao atualizar fornecedor:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// =====================================================
// 8. DESATIVAR FORNECEDOR
// DELETE /api/fornecedores/:id
// =====================================================

router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!validarId(id)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um ID de fornecedor válido.'
            });
        }

        const { data, error } = await supabase
            .from(TABELA)
            .update({ ativo: false })
            .eq('id', id)
            .select(CAMPOS)
            .maybeSingle();

        if (error) {
            console.error(
                'Erro ao desativar fornecedor:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível desativar o fornecedor.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Fornecedor não encontrado.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Fornecedor desativado com sucesso.',
            fornecedor: data
        });

    } catch (error) {
        console.error('Erro ao desativar fornecedor:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

export default router;
