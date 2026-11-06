// ============================================
// MUSTANG SISTEMA INTEGRADO
// Serviço de comunicação com o Backend
// ============================================

async function request(url) {
  let response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao backend. Confira se o servidor está ativo na porta 3000."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Acesso negado pela API. Confira a API_ACCESS_KEY e a configuração do proxy."
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new Error(
      `Erro HTTP ${response.status}: ${
        detail || "Não foi possível consultar os dados."
      }`
    );
  }

  return response.json();
}

// Extrair registros conforme o formato da resposta.
function getRows(payload, key) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.[key])) {
    return payload[key];
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
}

// Buscar todas as páginas.
// O backend permite até 100 registros por página.
async function getAllPages(path, key) {
  const all = [];
  const limit = 100;
  let page = 1;

  while (true) {
    const separator = path.includes("?") ? "&" : "?";

    const payload = await request(
      `${path}${separator}pagina=${page}&limite=${limit}`
    );

    const rows = getRows(payload, key);

    all.push(...rows);

    if (rows.length < limit) {
      break;
    }

    if (page > 1000) {
      throw new Error("Limite de paginação excedido.");
    }

    page++;
  }

  return all;
}

// Normalizar relacionamentos.
// O backend retorna origem e destino como objetos.
function normalizeRelations(relations) {
  return relations.map((relation) => ({
    ...relation,

    origem_id:
      relation.origem?.id ??
      relation.origem_id ??
      null,

    destino_id:
      relation.destino?.id ??
      relation.destino_id ??
      null
  }));
}

// ============================================
// API PRINCIPAL
// ============================================

export const api = {

  // Buscar elementos, relacionamentos e evidências.
  async getOverview() {
    const [elements, relations, evidence] = await Promise.all([
      getAllPages("/api/elementos", "elementos"),

      getAllPages("/api/relacoes", "relacoes"),

      getAllPages("/api/evidencias", "evidencias")
    ]);

    return {
      elements,
      relations: normalizeRelations(relations),
      evidence
    };
  },

  // Consultar impactos de um elemento.
  async getImpacts(id, depth = 5, state = "") {
    const params = new URLSearchParams({
      profundidade: String(depth)
    });

    if (state) {
      params.set("estado", state);
    }

    return request(
      `/api/elementos/${encodeURIComponent(id)}/impactos?${params.toString()}`
    );
  },

  // Testar conexão com o backend.
  async testConnection() {
    return request("/api/teste-conexao");
  }
};