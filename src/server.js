
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { supabase } from './supabase.js';

// Rotas do Mustang
import produtosRoutes from './routes/produtos.routes.js';
import fornecedoresRoutes from './routes/fornecedores.routes.js';
import estoqueRoutes from './routes/estoque.routes.js';
import movimentacoesRoutes from './routes/movimentacoes.routes.js';
import pedidosCompraRoutes from './routes/pedidos-compra.routes.js';
import indicadoresRoutes from './routes/indicadores.routes.js';
import iaRoutes from './routes/ia.routes.js';

const app = express();

// =====================================================
// 1. CONFIGURAÇÕES INICIAIS
// =====================================================

// Configuração de origens autorizadas
const origensPermitidas = (
    process.env.CORS_ORIGINS || 'http://localhost:5173'
)
    .split(',')
    .map(origem => origem.trim())
    .filter(Boolean);

// Configuração do CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origensPermitidas.includes(origin)) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    methods: [
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS'
    ],
    allowedHeaders: [
        'Content-Type',
        'x-api-key',
        'Authorization'
    ],
    optionsSuccessStatus: 204
}));

// Permitir recebimento de JSON
app.use(express.json({ limit: '1mb' }));


// =====================================================
// 2. CONFIGURAÇÃO DA CHAVE DE ACESSO
// =====================================================

const apiAccessKey = process.env.API_ACCESS_KEY;

if (!apiAccessKey) {
    throw new Error(
        'API_ACCESS_KEY não configurada nas variáveis de ambiente.'
    );
}


// =====================================================
// 3. ROTAS PÚBLICAS
// =====================================================

// Verificar funcionamento do servidor
app.get('/health', (req, res) => {
    return res.status(200).json({
        status: 'healthy',
        sistema: 'Mustang Sistema Integrado',
        mensagem: 'Servidor funcionando.'
    });
});

// Rota inicial
app.get('/', (req, res) => {
    return res.status(200).json({
        status: 'online',
        sistema: 'Mustang Sistema Integrado',
        mensagem: 'API Mustang funcionando!'
    });
});


// =====================================================
// 4. AUTENTICAÇÃO DAS ROTAS DA API
// =====================================================

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


// =====================================================
// 5. TESTAR CONEXÃO COM O SUPABASE
// =====================================================

app.get('/api/teste-conexao', async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('mustang_produtos')
            .select('id', {
                count: 'exact',
                head: true
            });

        if (error) {
            console.error(
                'Erro ao conectar ao Supabase:',
                error.message
            );

            return res.status(500).json({
                status: 'erro',
                mensagem: 'Não foi possível consultar o banco de dados.'
            });
        }

        return res.status(200).json({
            status: 'conectado',
            sistema: 'Mustang Sistema Integrado',
            mensagem: 'API conectada ao Supabase com sucesso!',
            tabela: 'mustang_produtos',
            registrosEncontrados: count ?? 0
        });

    } catch (error) {
        console.error('Erro interno:', error);

        return res.status(500).json({
            status: 'erro',
            mensagem: 'Erro interno do servidor.'
        });
    }
});


// =====================================================
// 6. ROTAS DO SISTEMA MUSTANG
// =====================================================

// Gestão de produtos
app.use('/api/produtos', produtosRoutes);

// Gestão de fornecedores
app.use('/api/fornecedores', fornecedoresRoutes);

// Consulta do estoque atual
app.use('/api/estoque', estoqueRoutes);

// Entradas e saídas
app.use('/api/movimentacoes', movimentacoesRoutes);

// Gestão de pedidos de compra
app.use('/api/pedidos-compra', pedidosCompraRoutes);

// Indicadores e estatísticas
app.use('/api/indicadores', indicadoresRoutes);

// Assistente de inteligência artificial
app.use('/api/ia', iaRoutes);


// =====================================================
// 7. ROTA PARA ENDEREÇOS NÃO ENCONTRADOS
// =====================================================

app.use((req, res) => {
    return res.status(404).json({
        status: 'nao_encontrado',
        mensagem: 'Rota não encontrada.',
        caminho: req.originalUrl
    });
});


// =====================================================
// 8. TRATAMENTO DE ERROS
// =====================================================

app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        status: 'erro',
        mensagem: 'Erro interno do servidor.'
    });
});


// =====================================================
// 9. INICIALIZAÇÃO DO SERVIDOR
// =====================================================

const PORT = Number(process.env.PORT) || 3000;

// Inicialização local
if (process.env.VERCEL !== '1') {
    const servidor = app.listen(PORT, '0.0.0.0', () => {
        console.log('=================================');
        console.log(' MUSTANG SISTEMA INTEGRADO');
        console.log(` Servidor: http://localhost:${PORT}`);
        console.log('=================================');
    });

    servidor.on('error', error => {
        console.error('Erro ao iniciar o servidor:', error);
        process.exit(1);
    });
}

// Exportação para a Vercel
export default app;
