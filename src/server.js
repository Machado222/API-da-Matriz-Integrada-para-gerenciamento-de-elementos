
// src/server.js

import express from 'express';
import { supabase } from './supabase.js';


const app = express();

app.use(express.json());

// Verificar se a chave de acesso foi configurada
const apiAccessKey = process.env.API_ACCESS_KEY;

if (!apiAccessKey) {
    throw new Error(
        'API_ACCESS_KEY não configurada no arquivo .env'
    );
}

// ROTA PUBLICA PARA VERIFICAR O SERVIDOR
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        mensagem: 'Servidor funcionando.'
    });
});

// PROTEGER TODAS AS ROTAS DA API
app.use('/api', (req, res, next) => {

    const chaveRecebida = req.get('x-api-key');

    if (!chaveRecebida || chaveRecebida !== apiAccessKey) {
        return res.status(401).json({
            status: 'nao_autorizado',
            mensagem: 'Chave de acesso inválida ou não informada.'
        });
    }

    next();
});


// ROTA INICIAL
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        mensagem: 'API da Matriz Integrada funcionando!'
    });
});

// TESTAR CONEXAO COM O SUPABASE
app.get('/api/teste-conexao', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('elemento')
            .select('id, nome')
            .limit(1);

        if (error) {
            console.error('Erro Supabase:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o banco de dados.'
            });
        }

        return res.status(200).json({
            status: 'conectado',
            mensagem: 'API conectada ao Supabase com sucesso!',
            tabela: 'elemento',
            registrosEncontrados: data.length,
            exemplo: data[0] ?? null
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// ROTA: LISTAR ELEMENTOS
app.get('/api/elementos', async (req, res) => {
    try {
        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 20);

        // Validar paginação
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

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        // Consultar elementos
        let consulta = supabase
            .from('elemento')
            .select('id, tipo, nome, descricao, estado', {
                count: 'exact'
            })
            .order('id', { ascending: true });

        // Aplicar filtros opcionais
        const tipo = req.query.tipo?.toString().trim();
        const estado = req.query.estado?.toString().trim();

        if (tipo) {
            consulta = consulta.eq('tipo', tipo);
        }

        if (estado) {
            consulta = consulta.eq('estado', estado);
        }

        const { data, error, count } = await consulta.range(inicio, fim);

        if (error) {
            console.error('Erro ao listar elementos:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível listar os elementos.'
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Elementos consultados com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: data?.length ?? 0,
            elementos: data ?? []
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

// ROTA: LISTAR TODOS OS RELACIONAMENTOS
app.get('/api/relacoes', async (req, res) => {
    try {
        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 20);

        // Validar paginação
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

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        // Preparar consulta
        let consulta = supabase
            .from('relacao')
            .select(
                'id, origem_id, destino_id, tipo_relacao, estado',
                { count: 'exact' }
            )
            .order('id', { ascending: true });

        // Aplicar filtros opcionais
        const tipoRelacao = req.query.tipo_relacao?.toString().trim();
        const estado = req.query.estado?.toString().trim();
        const origemId = req.query.origem_id?.toString().trim();
        const destinoId = req.query.destino_id?.toString().trim();

        if (tipoRelacao) {
            consulta = consulta.eq('tipo_relacao', tipoRelacao);
        }

        if (estado) {
            consulta = consulta.eq('estado', estado);
        }

        if (origemId) {
            consulta = consulta.eq('origem_id', origemId);
        }

        if (destinoId) {
            consulta = consulta.eq('destino_id', destinoId);
        }

        // Executar consulta paginada
        const { data, error, count } = await consulta.range(inicio, fim);

        if (error) {
            console.error('Erro ao listar relacionamentos:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível listar os relacionamentos.'
            });
        }

        const relacoes = data ?? [];

        // Quando não houver relacionamentos
        if (relacoes.length === 0) {
            return res.status(200).json({
                status: 'sucesso',
                mensagem: 'Relacionamentos consultados com sucesso.',
                pagina,
                limite,
                total: count ?? 0,
                totalPaginas: Math.ceil((count ?? 0) / limite),
                quantidade: 0,
                relacoes: []
            });
        }

        // Identificar os elementos envolvidos
        const idsRelacionados = [
            ...new Set(
                relacoes.flatMap(relacao => [
                    relacao.origem_id,
                    relacao.destino_id
                ])
            )
        ];

        // Consultar os elementos
        const { data: elementos, error: erroElementos } = await supabase
            .from('elemento')
            .select('id, tipo, nome, descricao, estado')
            .in('id', idsRelacionados);

        if (erroElementos) {
            console.error(
                'Erro ao consultar elementos relacionados:',
                erroElementos.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar os elementos relacionados.'
            });
        }

        // Criar mapa para relacionar os elementos
        const mapaElementos = new Map(
            elementos.map(elemento => [elemento.id, elemento])
        );

        // Organizar os relacionamentos
        const resultado = relacoes.map(relacao => ({
            id: relacao.id,
            tipo_relacao: relacao.tipo_relacao,
            estado: relacao.estado,
            origem: mapaElementos.get(relacao.origem_id) ?? null,
            destino: mapaElementos.get(relacao.destino_id) ?? null
        }));

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Relacionamentos consultados com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: resultado.length,
            relacoes: resultado
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// ROTA: LISTAR EVIDÊNCIAS
app.get('/api/evidencias', async (req, res) => {
    try {
        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 20);

        const fonte = req.query.fonte?.toString().trim();
        const elementoId = req.query.elemento_id?.toString().trim();
        const relacaoId = req.query.relacao_id?.toString().trim();
        const dataInicio = req.query.data_inicio?.toString().trim();
        const dataFim = req.query.data_fim?.toString().trim();

        // Validar paginação
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

        // Validar datas no formato YYYY-MM-DD
        const dataValida = valor => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
                return false;
            }

            const data = new Date(`${valor}T00:00:00.000Z`);

            return (
                !Number.isNaN(data.getTime()) &&
                data.toISOString().slice(0, 10) === valor
            );
        };

        if (
            (dataInicio && !dataValida(dataInicio)) ||
            (dataFim && !dataValida(dataFim))
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe datas válidas no formato YYYY-MM-DD.'
            });
        }

        if (dataInicio && dataFim && dataInicio > dataFim) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'A data inicial não pode ser posterior à data final.'
            });
        }

        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite - 1;

        // Preparar consulta de evidências
        let consulta = supabase
            .from('evidencia')
            .select(
                'id, fonte, referencia, data_coleta, responsavel_revisao, elemento_id, relacao_id',
                { count: 'exact' }
            )
            .order('data_coleta', { ascending: false })
            .order('id', { ascending: true });

        // Aplicar filtros opcionais
        if (fonte) {
            consulta = consulta.eq('fonte', fonte);
        }

        if (elementoId) {
            consulta = consulta.eq('elemento_id', elementoId);
        }

        if (relacaoId) {
            consulta = consulta.eq('relacao_id', relacaoId);
        }

        if (dataInicio) {
            consulta = consulta.gte('data_coleta', dataInicio);
        }

        if (dataFim) {
            consulta = consulta.lte('data_coleta', dataFim);
        }

        // Executar consulta paginada
        const { data, error, count } = await consulta.range(inicio, fim);

        if (error) {
            console.error('Erro ao listar evidências:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível listar as evidências.'
            });
        }

        const evidencias = data ?? [];

        // Retornar lista vazia quando não houver resultados
        if (evidencias.length === 0) {
            return res.status(200).json({
                status: 'sucesso',
                mensagem: 'Evidências consultadas com sucesso.',
                pagina,
                limite,
                total: count ?? 0,
                totalPaginas: Math.ceil((count ?? 0) / limite),
                quantidade: 0,
                evidencias: []
            });
        }

        // Identificar relacionamentos associados
        const idsRelacoes = [
            ...new Set(
                evidencias
                    .map(item => item.relacao_id)
                    .filter(Boolean)
            )
        ];

        let relacoes = [];

        if (idsRelacoes.length > 0) {
            const { data: dadosRelacoes, error: erroRelacoes } =
                await supabase
                    .from('relacao')
                    .select('id, origem_id, destino_id, tipo_relacao, estado')
                    .in('id', idsRelacoes);

            if (erroRelacoes) {
                console.error(
                    'Erro ao consultar relacionamentos das evidências:',
                    erroRelacoes.message
                );

                return res.status(500).json({
                    status: 'erro',
                    mensagem: 'Não foi possível consultar os relacionamentos das evidências.'
                });
            }

            relacoes = dadosRelacoes ?? [];
        }

        // Identificar todos os elementos associados
        const idsElementos = [
            ...new Set([
                ...evidencias
                    .map(item => item.elemento_id)
                    .filter(Boolean),

                ...relacoes.flatMap(relacao => [
                    relacao.origem_id,
                    relacao.destino_id
                ])
            ])
        ];

        let elementos = [];

        if (idsElementos.length > 0) {
            const { data: dadosElementos, error: erroElementos } =
                await supabase
                    .from('elemento')
                    .select('id, tipo, nome, descricao, estado')
                    .in('id', idsElementos);

            if (erroElementos) {
                console.error(
                    'Erro ao consultar elementos das evidências:',
                    erroElementos.message
                );

                return res.status(500).json({
                    status: 'erro',
                    mensagem: 'Não foi possível consultar os elementos das evidências.'
                });
            }

            elementos = dadosElementos ?? [];
        }

        // Criar mapas de consulta rápida
        const mapaElementos = new Map(
            elementos.map(elemento => [elemento.id, elemento])
        );

        const mapaRelacoes = new Map(
            relacoes.map(relacao => [relacao.id, relacao])
        );

        // Organizar as evidências com seus vínculos
        const resultado = evidencias.map(evidencia => {
            const relacao = mapaRelacoes.get(evidencia.relacao_id);

            return {
                ...evidencia,

                elemento: evidencia.elemento_id
                    ? mapaElementos.get(evidencia.elemento_id) ?? null
                    : null,

                relacao: relacao
                    ? {
                        ...relacao,
                        origem: mapaElementos.get(relacao.origem_id) ?? null,
                        destino: mapaElementos.get(relacao.destino_id) ?? null
                    }
                    : null
            };
        });

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Evidências consultadas com sucesso.',
            pagina,
            limite,
            total: count ?? 0,
            totalPaginas: Math.ceil((count ?? 0) / limite),
            quantidade: resultado.length,
            evidencias: resultado
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});

/* ROTA: INDICADORES GERAIS DA MATRIZ */
app.get('/api/indicadores', async (req, res) => {
    try {
        // Função para contar registros no Supabase
        const contarRegistros = async (tabela, estado = null) => {
            let consulta = supabase
                .from(tabela)
                .select('id', {
                    count: 'exact',
                    head: true
                });

            if (estado) {
                consulta = consulta.eq('estado', estado);
            }

            const { count, error } = await consulta;

            if (error) {
                throw error;
            }

            return count ?? 0;
        };

        const estados = [
            'EXTRAIDO',
            'SUGERIDO',
            'VALIDADO',
            'DESATUALIZADO'
        ];

        // Executar as contagens em paralelo
        const resultados = await Promise.all([
            contarRegistros('elemento'),
            contarRegistros('relacao'),
            contarRegistros('evidencia'),

            ...estados.map(estado =>
                contarRegistros('elemento', estado)
            ),

            ...estados.map(estado =>
                contarRegistros('relacao', estado)
            )
        ]);

        const [
            totalElementos,
            totalRelacionamentos,
            totalEvidencias,
            ...contagens
        ] = resultados;

        // Organizar contagens por estado
        const elementosPorEstado = {};
        const relacionamentosPorEstado = {};

        estados.forEach((estado, indice) => {
            elementosPorEstado[estado] = contagens[indice];

            relacionamentosPorEstado[estado] =
                contagens[indice + estados.length];
        });

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Indicadores consultados com sucesso.',

            indicadores: {
                totalElementos,
                totalRelacionamentos,
                totalEvidencias,
                elementosPorEstado,
                relacionamentosPorEstado
            }
        });

    } catch (error) {
        console.error('Erro ao consultar indicadores:', error.message);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Não foi possível consultar os indicadores.'
        });
    }
});

// ROTA 1: CONSULTAR ELEMENTO PELO ID
app.get('/api/elementos/:id', async (req, res) => {
    try {
        const id = req.params.id.trim();

        const { data, error } = await supabase
            .from('elemento')
            .select('id, tipo, nome, descricao, estado')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Erro ao consultar elemento:', error.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o elemento.'
            });
        }

        if (!data) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Elemento não encontrado no catálogo.',
                idPesquisado: id
            });
        }

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Elemento encontrado.',
            elemento: data
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// ROTA 2: CONSULTAR RELACIONAMENTOS DE UM ELEMENTO
app.get('/api/elementos/:id/relacoes', async (req, res) => {
    try {
        const id = req.params.id.trim();

        // Verificar se o elemento existe
        const { data: elemento, error: erroElemento } = await supabase
            .from('elemento')
            .select('id, tipo, nome, descricao, estado')
            .eq('id', id)
            .maybeSingle();

        if (erroElemento) {
            console.error(erroElemento.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Erro ao consultar elemento.'
            });
        }

        if (!elemento) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Elemento não encontrado no catálogo.',
                idPesquisado: id
            });
        }

        // Buscar relações em que o elemento é a origem
        // e relações em que é o destino
        const [origemResult, destinoResult] = await Promise.all([
            supabase
                .from('relacao')
                .select('id, origem_id, destino_id, tipo_relacao, estado')
                .eq('origem_id', id),

            supabase
                .from('relacao')
                .select('id, origem_id, destino_id, tipo_relacao, estado')
                .eq('destino_id', id)
        ]);

        if (origemResult.error || destinoResult.error) {
            console.error(
                origemResult.error?.message ||
                destinoResult.error?.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Erro ao consultar relacionamentos.'
            });
        }

        const relacoes = [
            ...origemResult.data,
            ...destinoResult.data
        ];

        // Se não existirem relações, retornar lista vazia
        if (relacoes.length === 0) {
            return res.status(200).json({
                status: 'sucesso',
                elemento,
                totalRelacoes: 0,
                relacoes: []
            });
        }

        // Identificar todos os elementos relacionados
        const idsRelacionados = [
            ...new Set(
                relacoes.flatMap(relacao => [
                    relacao.origem_id,
                    relacao.destino_id
                ])
            )
        ];

        // Buscar os dados dos elementos relacionados
        const { data: elementos, error: erroRelacionados } =
            await supabase
                .from('elemento')
                .select('id, tipo, nome')
                .in('id', idsRelacionados);

        if (erroRelacionados) {
            console.error(erroRelacionados.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Erro ao consultar elementos relacionados.'
            });
        }

        const mapaElementos = new Map(
            elementos.map(item => [item.id, item])
        );

        // Organizar a resposta
        const resultado = relacoes.map(relacao => ({
            id: relacao.id,
            tipo_relacao: relacao.tipo_relacao,
            estado: relacao.estado,
            origem: mapaElementos.get(relacao.origem_id),
            destino: mapaElementos.get(relacao.destino_id)
        }));

        return res.status(200).json({
            status: 'sucesso',
            elemento,
            totalRelacoes: resultado.length,
            relacoes: resultado
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// ROTA 3: PESQUISAR IMPACTOS DIRETOS E INDIRETOS
app.get('/api/elementos/:id/impactos', async (req, res) => {
    try {
        const id = req.params.id.trim();

        // Definir a profundidade máxima da pesquisa
        const profundidade = Number(req.query.profundidade ?? 5);

        if (
            !Number.isInteger(profundidade) ||
            profundidade < 1 ||
            profundidade > 5
        ) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'A profundidade deve ser um número inteiro entre 1 e 5.'
            });
        }

        // Verificar se foi solicitado um filtro de estado
        const estado = req.query.estado
            ? String(req.query.estado).trim().toUpperCase()
            : null;

        const estadosPermitidos = [
            'EXTRAIDO',
            'SUGERIDO',
            'VALIDADO',
            'DESATUALIZADO'
        ];

        if (estado && !estadosPermitidos.includes(estado)) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Estado de relacionamento inválido.'
            });
        }

        // Verificar se o elemento pesquisado existe
        const { data: elemento, error: erroElemento } = await supabase
            .from('elemento')
            .select('id, tipo, nome, descricao, estado')
            .eq('id', id)
            .maybeSingle();

        if (erroElemento) {
            console.error(erroElemento.message);

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Erro ao consultar elemento.'
            });
        }

        if (!elemento) {
            return res.status(404).json({
                status: 'nao_encontrado',
                mensagem: 'Elemento não encontrado no catálogo.',
                idPesquisado: id
            });
        }

        // Controle da pesquisa em cadeia
        let fronteira = [id];

        const visitados = new Set([id]);
        const impactos = new Map();

        // Percorrer os relacionamentos até a profundidade definida
        for (
            let nivel = 1;
            nivel <= profundidade && fronteira.length > 0;
            nivel++
        ) {
            let consulta = supabase
                .from('relacao')
                .select('id, origem_id, destino_id, tipo_relacao, estado')
                .in('destino_id', fronteira);

            // Aplicar filtro de estado, caso solicitado
            if (estado) {
                consulta = consulta.eq('estado', estado);
            }

            const { data: relacoesNivel, error: erroRelacoes } =
                await consulta;

            if (erroRelacoes) {
                console.error(erroRelacoes.message);

                return res.status(500).json({
                    status: 'erro',
                    mensagem: 'Erro ao pesquisar relacionamentos.'
                });
            }

            const proximaFronteira = [];

            for (const relacao of relacoesNivel ?? []) {
                const origemId = relacao.origem_id;

                // Evitar retornar o próprio elemento pesquisado
                if (origemId === id) {
                    continue;
                }

                // Registrar o elemento impactado
                if (!impactos.has(origemId)) {
                    impactos.set(origemId, {
                        id: origemId,
                        distancia: nivel,
                        relacoes: []
                    });
                }

                const impacto = impactos.get(origemId);

                // Evitar repetir a mesma relação
                if (!impacto.relacoes.some(r => r.id === relacao.id)) {
                    impacto.relacoes.push({
                        id: relacao.id,
                        tipo_relacao: relacao.tipo_relacao,
                        estado: relacao.estado
                    });
                }

                // Preparar o próximo nível da pesquisa
                if (!visitados.has(origemId)) {
                    visitados.add(origemId);
                    proximaFronteira.push(origemId);
                }
            }

            fronteira = proximaFronteira;
        }

        // Se nenhum impacto for encontrado
        if (impactos.size === 0) {
            return res.status(200).json({
                status: 'sucesso',
                elemento,
                parametros: {
                    profundidadeMaxima: profundidade,
                    estado: estado ?? 'TODOS'
                },
                totalImpactos: 0,
                impactos: []
            });
        }

        // Coletar IDs dos elementos e relacionamentos encontrados
        const idsImpactados = [...impactos.keys()];

        const idsRelacoes = [
            ...new Set(
                [...impactos.values()].flatMap(
                    impacto => impacto.relacoes.map(r => r.id)
                )
            )
        ];

        // Buscar elementos e evidências em paralelo
        const [elementosResult, evidenciasResult] = await Promise.all([
            supabase
                .from('elemento')
                .select('id, tipo, nome')
                .in('id', idsImpactados),

            supabase
                .from('evidencia')
                .select('id, fonte, referencia, data_coleta, responsavel_revisao, relacao_id')
                .in('relacao_id', idsRelacoes)
        ]);

        if (elementosResult.error || evidenciasResult.error) {
            console.error(
                elementosResult.error?.message ||
                evidenciasResult.error?.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Erro ao buscar elementos ou evidências.'
            });
        }

        // Organizar os elementos por ID
        const mapaElementos = new Map(
            (elementosResult.data ?? []).map(e => [e.id, e])
        );

        // Organizar as evidências por relacionamento
        const mapaEvidencias = new Map();

        for (const evidencia of evidenciasResult.data ?? []) {
            if (!mapaEvidencias.has(evidencia.relacao_id)) {
                mapaEvidencias.set(evidencia.relacao_id, []);
            }

            mapaEvidencias.get(evidencia.relacao_id).push({
                id: evidencia.id,
                fonte: evidencia.fonte,
                referencia: evidencia.referencia,
                data_coleta: evidencia.data_coleta,
                responsavel_revisao: evidencia.responsavel_revisao
            });
        }

        // Montar os resultados finais
        const resultado = [...impactos.values()]
            .map(impacto => {
                const elementoImpactado = mapaElementos.get(impacto.id);

                if (!elementoImpactado) {
                    return null;
                }

                return {
                    ...elementoImpactado,
                    distancia: impacto.distancia,
                    classificacao: impacto.distancia === 1
                        ? 'IMPACTO DIRETO'
                        : 'IMPACTO INDIRETO',

                    relacoes: impacto.relacoes.map(relacao => ({
                        ...relacao,
                        evidencias: mapaEvidencias.get(relacao.id) ?? []
                    }))
                };
            })
            .filter(Boolean)
            .sort((a, b) =>
                a.distancia - b.distancia ||
                a.tipo.localeCompare(b.tipo) ||
                a.nome.localeCompare(b.nome)
            );

        return res.status(200).json({
            status: 'sucesso',
            mensagem: 'Pesquisa de impactos realizada com sucesso.',
            elemento,
            parametros: {
                profundidadeMaxima: profundidade,
                estado: estado ?? 'TODOS'
            },
            totalImpactos: resultado.length,
            impactos: resultado
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// ROTA 4: PESQUISAR ELEMENTOS POR NOME OU DESCRICAO
app.get('/api/busca', async (req, res) => {
    try {
        const termo = req.query.q;

        // Validar o termo de pesquisa
        if (typeof termo !== 'string' || !termo.trim()) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'Informe um termo de pesquisa utilizando o parâmetro q.'
            });
        }

        const busca = termo.trim();

        if (busca.length > 100) {
            return res.status(400).json({
                status: 'erro',
                mensagem: 'O termo de pesquisa deve ter no máximo 100 caracteres.'
            });
        }

        // Pesquisar simultaneamente no nome e na descrição
        const [nomeResult, descricaoResult] = await Promise.all([
            supabase
                .from('elemento')
                .select('id, tipo, nome, descricao, estado')
                .ilike('nome', `%${busca}%`)
                .limit(50),

            supabase
                .from('elemento')
                .select('id, tipo, nome, descricao, estado')
                .ilike('descricao', `%${busca}%`)
                .limit(50)
        ]);

        if (nomeResult.error || descricaoResult.error) {
            console.error(
                nomeResult.error?.message ||
                descricaoResult.error?.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível realizar a pesquisa.'
            });
        }

        // Unir os resultados e evitar elementos duplicados
        const elementosUnidos = [
            ...(nomeResult.data ?? []),
            ...(descricaoResult.data ?? [])
        ];

        const elementosUnicos = new Map();

        for (const elemento of elementosUnidos) {
            elementosUnicos.set(elemento.id, elemento);
        }

        const resultados = [...elementosUnicos.values()]
            .sort((a, b) =>
                a.tipo.localeCompare(b.tipo) ||
                a.nome.localeCompare(b.nome)
            );

        return res.status(200).json({
            status: 'sucesso',
            termoPesquisado: busca,
            totalResultados: resultados.length,
            resultados
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// INICIAR SERVIDOR
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
    console.log('=================================');
    console.log(' API MATRIZ INTEGRADA');
    console.log(` Servidor: http://localhost:${PORT}`);
    console.log('=================================');
});
