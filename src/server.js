
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
