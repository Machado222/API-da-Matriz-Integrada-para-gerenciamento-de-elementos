
const BASE_URL = "/api";

async function request(path, options = {}) {
    const {
        method = "GET",
        body,
        signal
    } = options;

    const headers = {
        Accept: "application/json"
    };

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    let response;

    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined
                ? JSON.stringify(body)
                : undefined,
            signal
        });
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }

        throw new Error(
            "Não foi possível conectar ao Backend Mustang. Verifique se o servidor está ativo."
        );
    }

    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        const mensagem =
            typeof data === "object"
                ? data?.mensagem
                : data;

        throw new Error(
            mensagem || `Erro HTTP ${response.status}.`
        );
    }

    return data;
}

function criarParametros(filtros = {}) {
    const parametros = new URLSearchParams();

    parametros.set("pagina", filtros.pagina ?? "1");
    parametros.set("limite", filtros.limite ?? "100");

    Object.entries(filtros).forEach(([chave, valor]) => {
        if (
            !["pagina", "limite"].includes(chave) &&
            valor !== undefined &&
            valor !== null &&
            valor !== ""
        ) {
            parametros.set(chave, String(valor));
        }
    });

    return `?${parametros.toString()}`;
}

// =====================================================
// API PRINCIPAL DO MUSTANG
// =====================================================

export const api = {

    // CONEXÃO

    async testarConexao() {
        return request("/teste-conexao");
    },

    // PRODUTOS

    async listarProdutos(filtros = {}) {
        const resposta = await request(
            `/produtos${criarParametros(filtros)}`
        );

        return resposta.produtos ?? [];
    },

    async consultarProduto(id) {
        const resposta = await request(`/produtos/${id}`);
        return resposta.produto;
    },

    async cadastrarProduto(dados) {
        const resposta = await request("/produtos", {
            method: "POST",
            body: dados
        });

        return resposta.produto;
    },

    async atualizarProduto(id, dados) {
        const resposta = await request(`/produtos/${id}`, {
            method: "PUT",
            body: dados
        });

        return resposta.produto;
    },

    async desativarProduto(id) {
        return request(`/produtos/${id}`, {
            method: "DELETE"
        });
    },

    // ESTOQUE

    async listarEstoque(filtros = {}) {
        const resposta = await request(
            `/estoque${criarParametros(filtros)}`
        );

        return resposta.estoques ?? [];
    },

    async consultarEstoqueProduto(id) {
        return request(`/estoque/${id}`);
    },

    // MOVIMENTAÇÕES

    async listarMovimentacoes(filtros = {}) {
        const resposta = await request(
            `/movimentacoes${criarParametros(filtros)}`
        );

        return resposta.movimentacoes ?? [];
    },

    async registrarMovimentacao(dados) {
        return request("/movimentacoes", {
            method: "POST",
            body: dados
        });
    },

    // FORNECEDORES

    async listarFornecedores(filtros = {}) {
        const resposta = await request(
            `/fornecedores${criarParametros(filtros)}`
        );

        return resposta.fornecedores ?? [];
    },

    async cadastrarFornecedor(dados) {
        const resposta = await request("/fornecedores", {
            method: "POST",
            body: dados
        });

        return resposta.fornecedor;
    },

    // REPOSIÇÃO

    async listarNecessidadesReposicao(filtros = {}) {
        const resposta = await request(
            `/pedidos-compra/reposicao${criarParametros(filtros)}`
        );

        return resposta.produtos ?? [];
    },

    // PEDIDOS DE COMPRA

    async listarPedidos(filtros = {}) {
        const resposta = await request(
            `/pedidos-compra${criarParametros(filtros)}`
        );

        return resposta.pedidos ?? [];
    },

    async cadastrarPedido(dados) {
        const resposta = await request("/pedidos-compra", {
            method: "POST",
            body: dados
        });

        return resposta.pedido;
    },

    async atualizarStatusPedido(id, status) {
        return request(`/pedidos-compra/${id}/status`, {
            method: "PATCH",
            body: { status }
        });
    },

    async receberPedido(id) {
        return request(`/pedidos-compra/${id}/receber`, {
            method: "POST",
            body: {}
        });
    },

    // ASSISTENTE IA

    async perguntarIA(pergunta, historico = []) {
        return request("/ia/perguntar", {
            method: "POST",
            body: {
                pergunta,
                historico
            }
        });
    }
};
