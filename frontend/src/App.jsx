
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaHorseHead, FaGear } from "react-icons/fa6";

import {
  LuLayoutDashboard,
  LuPackage,
  LuWarehouse,
  LuArrowLeftRight,
  LuPackagePlus,
  LuTruck,
  LuSparkles
} from "react-icons/lu";

import { api } from "./services/api";

// =====================================================
// CONFIGURACOES
// =====================================================

const MENU = [
  {
    id: "inicio",
    icon: <LuLayoutDashboard />,
    label: "Visão geral"
  },
  {
    id: "produtos",
    icon: <LuPackage />,
    label: "Produtos"
  },
  {
    id: "estoque",
    icon: <LuWarehouse />,
    label: "Estoque"
  },
  {
    id: "movimentacoes",
    icon: <LuArrowLeftRight />,
    label: "Movimentações"
  },
  {
    id: "reposicao",
    icon: <LuPackagePlus />,
    label: "Reposição"
  },
  {
    id: "fornecedores",
    icon: <LuTruck />,
    label: "Fornecedores"
  },
  {
    id: "ia",
    icon: <LuSparkles />,
    label: "Assistente IA"
  }
];

const FORM_PRODUTO_INICIAL = {
  codigo: "",
  nome: "",
  categoria: "",
  descricao: "",
  unidade_medida: "UN",
  preco_custo: "0",
  preco_venda: "0",
  estoque_minimo: "0",
  imagem_url: "",
  veiculo_marca: "",
  veiculo_modelo: "",
  veiculo_ano: "",
  veiculo_motor: ""
};

const FORM_MOVIMENTACAO_INICIAL = {
  produto_id: "",
  fornecedor_id: "",
  tipo: "ENTRADA",
  quantidade: "",
  motivo: "",
  observacao: ""
};

const FORM_FORNECEDOR_INICIAL = {
  nome: "",
  cnpj: "",
  telefone: "",
  email: "",
  endereco: ""
};

// =====================================================
// FUNCOES AUXILIARES
// =====================================================

const moeda = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const numero = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR");

const normalizarTexto = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const formatarData = (valor, horario = false) => {
  if (!valor) return "—";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return "—";

  return horario
    ? data.toLocaleString("pt-BR")
    : data.toLocaleDateString("pt-BR");
};
const SUGESTOES_INICIAIS = [
  "Quais produtos precisam de reposição?",
  "Quais produtos estão com estoque baixo?",
  "Analise o giro do estoque."
];

const BANCO_SUGESTOES = {
  reposicao: [
    "Quais produtos têm maior prioridade de reposição?",
    "Qual quantidade deve ser comprada de cada produto?",
    "Há pedidos em aberto que cobrem as necessidades?",
    "Quais produtos estão sem estoque e precisam de compra?",
    "Quais itens podem entrar em ruptura primeiro?",
    "Quais fornecedores podem atender os itens pendentes?"
  ],

  estoque: [
    "Quais produtos estão mais próximos do estoque mínimo?",
    "Quais peças estão sem saldo disponível?",
    "Quais produtos apresentam maior risco de ruptura?",
    "Qual é a quantidade atual de cada produto?",
    "Quais itens estão abaixo do estoque mínimo?",
    "Quais produtos têm maior disponibilidade?"
  ],

  giro: [
    "Quais produtos têm maior giro?",
    "Quais peças apresentam menor saída?",
    "Quais produtos podem estar com excesso de estoque?",
    "Quais produtos apresentam consumo crescente?",
    "Quais itens podem ficar parados no estoque?",
    "Qual é a tendência de consumo dos produtos?"
  ],

  movimentacoes: [
    "Quais foram as últimas entradas registradas?",
    "Quais produtos tiveram mais saídas?",
    "Qual foi o saldo de entradas e saídas?",
    "Quais movimentações merecem atenção?",
    "Como foram as movimentações nos últimos sete dias?",
    "Quais produtos tiveram mais retiradas?"
  ],

  fornecedores: [
    "Quais fornecedores estão cadastrados?",
    "Quais fornecedores possuem telefone e e-mail?",
    "Quais fornecedores estão relacionados aos pedidos?",
    "Quais produtos precisam de fornecedor vinculado?"
  ],

  geral: [
    "Faça um resumo da situação atual do estoque.",
    "Quais pontos merecem atenção no estoque?",
    "Quais produtos exigem acompanhamento?",
    "Compare o estoque atual com os níveis mínimos.",
    "Quais análises ajudam no planejamento de compras?",
    "Quais informações devo acompanhar diariamente?"
  ]
};

function gerarSugestoesRelacionadas(pergunta, resposta, excluidas = []) {
 const texto = normalizarTexto(`${pergunta} ${resposta}`);
  let tema = "geral";

  if (texto.includes("FORNECEDOR")) {
    tema = "fornecedores";
  } else if (
    texto.includes("MOVIMENT") ||
    texto.includes("ENTRADA") ||
    texto.includes("SAIDA")
  ) {
    tema = "movimentacoes";
  } else if (
    texto.includes("GIRO") ||
    texto.includes("CONSUMO") ||
    texto.includes("VENDA")
  ) {
    tema = "giro";
  } else if (
    texto.includes("REPOSI") ||
    texto.includes("COMPRA") ||
    texto.includes("PEDIDO")
  ) {
    tema = "reposicao";
  } else if (
    texto.includes("ESTOQUE") ||
    texto.includes("SALDO") ||
    texto.includes("RUPTURA") ||
    texto.includes("BAIXO") ||
    texto.includes("FALTA")
  ) {
    tema = "estoque";
  }

  const jaUtilizadas = new Set(
    excluidas.map((item) => normalizarTexto(item))
  );

  const outrasSugestoes = Object.entries(BANCO_SUGESTOES)
    .filter(([nome]) => nome !== tema && nome !== "geral")
    .flatMap(([, perguntas]) => perguntas);

  const candidatas = [
    ...BANCO_SUGESTOES[tema],
    ...BANCO_SUGESTOES.geral,
    ...outrasSugestoes
  ];

  return [...new Set(candidatas)]
    .filter(
      (item) => !jaUtilizadas.has(normalizarTexto(item))
    )
    .slice(0, 3);
}

function classificarEstoque(item) {
  const quantidade = Number(item?.quantidade_atual ?? 0);
  const minimo = Number(item?.estoque_minimo ?? 0);

  if (quantidade <= 0) return "SEM ESTOQUE";
  if (minimo > 0 && quantidade <= minimo) return "BAIXO";

  return "NORMAL";
}

function obterNomeProduto(produtoId, produtos) {
  const produto = produtos.find(
    (item) => Number(item.id) === Number(produtoId)
  );

  return produto?.nome || `Produto #${produtoId ?? "—"}`;
}

function obterNecessidade(item) {
  const flag = item?.necessita_pedido;

  const flagAtivo =
    flag === true ||
    flag === 1 ||
    String(flag).toLowerCase() === "true" ||
    String(flag).toLowerCase() === "sim";

  const saldo = Number(item?.quantidade_atual ?? 0);
  const minimo = Number(item?.estoque_minimo ?? 0);
  const sugerida = Number(item?.quantidade_sugerida ?? 0);

  return flagAtivo || (sugerida > 0 && saldo <= minimo);
}

// =====================================================
// COMPONENTES VISUAIS
// =====================================================

function HorseMark() {
  return <FaHorseHead aria-label="Mustang" />;
}

function Botao({ children, secundario = false, ...props }) {
  return (
    <button
      className={`button ${
        secundario ? "button-secondary" : "button-primary"
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

function Titulo({ eyebrow, title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {action || null}
    </div>
  );
}

function Indicador({ label, value, detail, icon }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-symbol">{icon}</span>
      </div>

      <strong className="metric-value">{value}</strong>

      <span className="metric-detail">{detail}</span>
    </article>
  );
}

function Estado({ value }) {
  const estado = String(value || "NÃO INFORMADO").toUpperCase();

  let classe = "status";

  if (
    estado.includes("BAIXO") ||
    estado.includes("RUPTURA") ||
    estado.includes("CRITICO") ||
    estado.includes("SEM ESTOQUE") ||
    estado.includes("PRECISA") ||
    estado.includes("PENDENTE")
  ) {
    classe += " status-warning";
  } else if (
    estado.includes("NORMAL") ||
    estado.includes("RECEBIDO") ||
    estado.includes("VALIDADO") ||
    estado.includes("COBERTO") ||
    estado.includes("ATIVO")
  ) {
    classe += " status-success";
  }

  return (
    <span className={classe}>
      {estado.replaceAll("_", " ")}
    </span>
  );
}

function Feedback({ message, type = "success" }) {
  if (!message) return null;

  return (
    <div className={`feedback feedback-${type}`}>
      {message}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function Tabela({
  columns,
  rows,
  empty = "Nenhum registro encontrado."
}) {
  if (!rows?.length) {
    return <div className="empty-state">{empty}</div>;
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((item, index) => (
            <tr key={item.id ?? item.produto_id ?? item.codigo ?? index}>
              {columns.map((column) => (
                <td key={column.label}>
                  {column.render
                    ? column.render(item)
                    : item[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FotoProduto({ url, nome }) {
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    setFalhou(false);
  }, [url]);

  if (!url || falhou) {
    return (
      <div className="product-image-placeholder">
        <span>▦</span>
        <small>Imagem da peça</small>
      </div>
    );
  }

  return (
    <img
      className="product-image"
      src={url}
      alt={nome}
      loading="lazy"
      onError={() => setFalhou(true)}
    />
  );
}

// =====================================================
// GRAFICO DE ROSCA
// =====================================================

function GraficoRosca({ title, subtitle, data }) {
  const total = data.reduce(
    (soma, item) => soma + item.value,
    0
  );

  const cores = [
    "#111111",
    "#777777",
    "#bdbdbd",
    "#e5e5e5"
  ];

  let acumulado = 0;

  const gradiente = total > 0
    ? `conic-gradient(${data.map((item, index) => {
        const inicio = acumulado;
        acumulado += (item.value / total) * 100;

        return `${cores[index % cores.length]} ${inicio}% ${acumulado}%`;
      }).join(", ")})`
    : "conic-gradient(#e5e5e5 0% 100%)";

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="donut-layout">
        <div
          className="donut-chart"
          style={{ background: gradiente }}
        >
          <div className="donut-hole">
            <strong>{total}</strong>
            <small>PRODUTOS</small>
          </div>
        </div>

        <div className="donut-legend">
          {data.map((item, index) => (
            <div className="legend-item" key={item.label}>
              <span
                className="legend-color"
                style={{
                  backgroundColor: cores[index % cores.length]
                }}
              />

              <span className="legend-label">
                {item.label}
              </span>

              <strong>{item.value}</strong>

              <small>
                {total
                  ? `${Math.round((item.value / total) * 100)}%`
                  : "0%"}
              </small>
            </div>
          ))}

          {!total && (
            <p className="chart-empty">
              Sem dados disponíveis.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// DADOS DO GRAFICO DE MOVIMENTACOES
// =====================================================

function criarDadosMovimentacoes(movimentacoes) {
  const dias = [];

  for (let i = 6; i >= 0; i--) {
    const data = new Date();
    data.setDate(data.getDate() - i);

    const chave = [
      data.getFullYear(),
      String(data.getMonth() + 1).padStart(2, "0"),
      String(data.getDate()).padStart(2, "0")
    ].join("-");

    dias.push({
      chave,
      label: data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit"
      }),
      entrada: 0,
      saida: 0
    });
  }

  movimentacoes.forEach((item) => {
    const valorData =
      item.data_movimentacao ||
      item.created_at ||
      item.data;

    if (!valorData) return;

    const data = new Date(valorData);

    if (Number.isNaN(data.getTime())) return;

    const chave = [
      data.getFullYear(),
      String(data.getMonth() + 1).padStart(2, "0"),
      String(data.getDate()).padStart(2, "0")
    ].join("-");

    const dia = dias.find(
      (registro) => registro.chave === chave
    );

    if (!dia) return;

    const tipo = normalizarTexto(item.tipo);
    const quantidade = Number(item.quantidade ?? 0);

    if (tipo.includes("ENTRAD")) {
      dia.entrada += quantidade;
    } else if (
      tipo.includes("SAID") ||
      tipo.includes("RETIR")
    ) {
      dia.saida += quantidade;
    }
  });

  return dias;
}

function GraficoMovimentacoes({ data }) {
  const maximo = Math.max(
    1,
    ...data.flatMap((item) => [
      item.entrada,
      item.saida
    ])
  );

  return (
    <section className="panel chart-panel movement-panel">
      <div className="panel-heading">
        <div>
          <h2>Movimentações</h2>
          <p>Entradas e saídas nos últimos sete dias, em unidades.</p>
        </div>
      </div>

      <div className="movement-legend">
        <span><i className="legend-entry" /> Entradas</span>
        <span><i className="legend-exit" /> Saídas</span>
      </div>

      <div className="movement-chart">
        {data.map((item) => (
          <div className="movement-day" key={item.chave}>
            <div className="movement-bars">
              <div className="movement-bar-column">
                <span>{numero(item.entrada)}</span>
                <div
                  className="movement-bar movement-bar-entry"
                  style={{
                    height: item.entrada
                      ? `${Math.max(4, (item.entrada / maximo) * 115)}px`
                      : 0
                  }}
                />
              </div>

              <div className="movement-bar-column">
                <span>{numero(item.saida)}</span>
                <div
                  className="movement-bar movement-bar-exit"
                  style={{
                    height: item.saida
                      ? `${Math.max(4, (item.saida / maximo) * 115)}px`
                      : 0
                  }}
                />
              </div>
            </div>

            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================
// GRAFICO DE ESTOQUE
// =====================================================

function GraficoEstoque({ data }) {
  const maior = Math.max(
    1,
    ...data.map((item) => Number(item.quantidade_atual ?? 0))
  );

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Produtos em estoque</h2>
          <p>Produtos com maior quantidade disponível.</p>
        </div>
      </div>

      {data.length ? (
        <div className="horizontal-chart">
          {data.map((item) => {
            const quantidade = Number(item.quantidade_atual ?? 0);

            return (
              <div
                className="horizontal-bar-row"
                key={item.id ?? item.codigo}
              >
                <div className="horizontal-bar-info">
                  <span>
                    {item.nome || item.codigo || "Produto"}
                  </span>

                  <strong>{numero(quantidade)}</strong>
                </div>

                <div className="horizontal-bar-track">
                  <div
                    className="horizontal-bar-fill"
                    style={{
                      width: `${(quantidade / maior) * 100}%`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          Sem produtos cadastrados no catálogo.
        </div>
      )}
    </section>
  );
}

// =====================================================
// GRAFICO DE REPOSICAO
// =====================================================

function GraficoReposicao({ data }) {
  const maior = Math.max(
    1,
    ...data.map((item) => Number(item.quantidade_sugerida || 0))
  );

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Necessidade de reposição</h2>
          <p>Peças com maior quantidade sugerida para compra.</p>
        </div>
      </div>

      {data.length ? (
        <div className="horizontal-chart">
          {data.slice(0, 6).map((item) => {
            const quantidade = Number(item.quantidade_sugerida || 0);

            return (
              <div
                className="horizontal-bar-row"
                key={item.produto_id ?? item.codigo}
              >
                <div className="horizontal-bar-info">
                  <span>{item.nome || item.codigo}</span>
                  <strong>{numero(quantidade)} un.</strong>
                </div>

                <div className="horizontal-bar-track">
                  <div
                    className="horizontal-bar-fill"
                    style={{
                      width: `${(quantidade / maior) * 100}%`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          Nenhuma necessidade de reposição encontrada.
        </div>
      )}
    </section>
  );
}

// =====================================================
// APLICACAO PRINCIPAL
// =====================================================

export default function App() {
  const [pagina, setPagina] = useState("inicio");

  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [produtos, setProdutos] = useState([]);
  const [estoques, setEstoques] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [reposicoes, setReposicoes] = useState([]);

  const [busca, setBusca] = useState("");
  const [buscaEstoque, setBuscaEstoque] = useState("");
  const [filtroEstoque, setFiltroEstoque] = useState("TODOS");

  const [buscaMovimentacao, setBuscaMovimentacao] = useState("");
  const [filtroMovimentacao, setFiltroMovimentacao] = useState("TODOS");

  const [buscaFornecedor, setBuscaFornecedor] = useState("");

  const [modalProduto, setModalProduto] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [formProduto, setFormProduto] = useState({
    ...FORM_PRODUTO_INICIAL
  });

  const [modalFornecedor, setModalFornecedor] = useState(false);
  const [formFornecedor, setFormFornecedor] = useState({
    ...FORM_FORNECEDOR_INICIAL
  });

  const [modalConfiguracoes, setModalConfiguracoes] = useState(false);

  const [formMovimentacao, setFormMovimentacao] = useState({
    ...FORM_MOVIMENTACAO_INICIAL
  });

  // IA preservada.
 const [pergunta, setPergunta] = useState("");
const [historicoIA, setHistoricoIA] = useState([]);
const [carregandoIA, setCarregandoIA] = useState(false);

const [sugestoesIA, setSugestoesIA] = useState(
  SUGESTOES_INICIAIS
);

const [sugestoesExibidasIA, setSugestoesExibidasIA] = useState([]);

  // =====================================================
  // CARREGAMENTO DOS DADOS
  // =====================================================

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErro("");

    const consultas = [
      {
        nome: "produtos",
        executar: () => api.listarProdutos({ ativo: true }),
        atualizar: setProdutos
      },
      {
        nome: "estoque",
        executar: () => api.listarEstoque({ ativo: true }),
        atualizar: setEstoques
      },
      {
        nome: "movimentações",
        executar: () => api.listarMovimentacoes(),
        atualizar: setMovimentacoes
      },
      {
        nome: "fornecedores",
        executar: () => api.listarFornecedores({ ativo: true }),
        atualizar: setFornecedores
      },
      {
        nome: "reposição",
        executar: () => api.listarNecessidadesReposicao(),
        atualizar: setReposicoes
      }
    ];

    const resultados = await Promise.allSettled(
      consultas.map((consulta) => consulta.executar())
    );

    const falhas = [];

    resultados.forEach((resultado, index) => {
      const consulta = consultas[index];

      if (resultado.status === "fulfilled") {
        consulta.atualizar(
          Array.isArray(resultado.value)
            ? resultado.value
            : []
        );
      } else {
        falhas.push(consulta.nome);

        console.error(
          `Erro ao carregar ${consulta.nome}:`,
          resultado.reason
        );
      }
    });

    if (falhas.length === consultas.length) {
      setErro(
        "Não foi possível carregar os dados. Verifique o Backend e as rotas da API."
      );
    } else if (falhas.length) {
      setAviso(`Algumas consultas falharam: ${falhas.join(", ")}.`);
    } else {
      setAviso("");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // =====================================================
  // DADOS CALCULADOS
  // =====================================================

  const produtosCatalogo = useMemo(
    () =>
      produtos.filter(
        (produto) =>
          !String(produto.codigo || "")
            .toUpperCase()
            .startsWith("TESTE-")
      ),
    [produtos]
  );

  const produtosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    if (!termo) return produtosCatalogo;

    return produtosCatalogo.filter((produto) => {
      const texto = [
        produto.codigo,
        produto.nome,
        produto.categoria,
        produto.veiculo_marca,
        produto.veiculo_modelo,
        produto.veiculo_ano
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [produtosCatalogo, busca]);

  const estoqueBaixo = useMemo(
    () =>
      estoques.filter(
        (item) =>
          Number(item.quantidade_atual ?? 0) <=
          Number(item.estoque_minimo ?? 0)
      ),
    [estoques]
  );

  const totalUnidades = useMemo(
    () =>
      estoques.reduce(
        (total, item) =>
          total + Number(item.quantidade_atual ?? 0),
        0
      ),
    [estoques]
  );

  const situacaoEstoque = useMemo(
    () => [
      {
        label: "Normal",
        value: estoques.filter(
          (item) => classificarEstoque(item) === "NORMAL"
        ).length
      },
      {
        label: "Estoque baixo",
        value: estoques.filter(
          (item) => classificarEstoque(item) === "BAIXO"
        ).length
      },
      {
        label: "Sem estoque",
        value: estoques.filter(
          (item) => classificarEstoque(item) === "SEM ESTOQUE"
        ).length
      }
    ],
    [estoques]
  );

  const dadosMovimentacoes = useMemo(
    () => criarDadosMovimentacoes(movimentacoes),
    [movimentacoes]
  );

  // =====================================================
  // GRAFICO DE ESTOQUE
  // =====================================================

  const produtosComEstoque = useMemo(() => {
    const catalogoComSaldo = produtosCatalogo.map((produto) => {
      const registroPorId = estoques.find(
        (item) =>
          Number(item.produto_id) === Number(produto.id)
      );

      const registroPorCodigo = registroPorId
        ? null
        : estoques.find(
            (item) =>
              item.codigo &&
              String(item.codigo).trim() ===
                String(produto.codigo).trim()
          );

      const registroEstoque = registroPorId || registroPorCodigo;

      return {
        ...produto,
        quantidade_atual: Number(
          registroEstoque?.quantidade_atual ?? 0
        )
      };
    });

    return catalogoComSaldo
      .sort(
        (a, b) =>
          b.quantidade_atual - a.quantidade_atual
      )
      .slice(0, 6);
  }, [produtosCatalogo, estoques]);

  const estoqueFiltrado = useMemo(() => {
    const termo = buscaEstoque.toLowerCase().trim();

    return estoques
      .filter((item) => {
        const texto = [
          item.codigo,
          item.nome,
          item.categoria
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return !termo || texto.includes(termo);
      })
      .filter(
        (item) =>
          filtroEstoque === "TODOS" ||
          classificarEstoque(item) === filtroEstoque
      )
      .sort((a, b) => {
        const prioridade = {
          "SEM ESTOQUE": 0,
          "BAIXO": 1,
          "NORMAL": 2
        };

        return (
          prioridade[classificarEstoque(a)] -
          prioridade[classificarEstoque(b)]
        );
      });
  }, [estoques, buscaEstoque, filtroEstoque]);

  const reposicoesNecessarias = useMemo(
    () => reposicoes.filter(obterNecessidade),
    [reposicoes]
  );

  const totalSugerido = useMemo(
    () =>
      reposicoesNecessarias.reduce(
        (total, item) =>
          total + Number(item.quantidade_sugerida || 0),
        0
      ),
    [reposicoesNecessarias]
  );

  const movimentacoesFiltradas = useMemo(() => {
    const termo = buscaMovimentacao.toLowerCase().trim();

    return movimentacoes.filter((item) => {
      const tipo = normalizarTexto(item.tipo);

      const correspondeTipo =
        filtroMovimentacao === "TODOS" ||
        (filtroMovimentacao === "ENTRADA" &&
          tipo.includes("ENTRAD")) ||
        (filtroMovimentacao === "SAIDA" &&
          (tipo.includes("SAID") || tipo.includes("RETIR")));

      const nomeProduto = obterNomeProduto(
        item.produto_id,
        produtos
      );

      const texto = [
        item.produto_id,
        nomeProduto,
        item.tipo,
        item.motivo,
        item.quantidade
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return correspondeTipo && (!termo || texto.includes(termo));
    });
  }, [
    movimentacoes,
    produtos,
    buscaMovimentacao,
    filtroMovimentacao
  ]);

  const fornecedoresFiltrados = useMemo(() => {
    const termo = buscaFornecedor.toLowerCase().trim();

    if (!termo) return fornecedores;

    return fornecedores.filter((item) =>
      [
        item.nome,
        item.cnpj,
        item.telefone,
        item.email
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo)
    );
  }, [fornecedores, buscaFornecedor]);

  const resumoMovimentacoes = useMemo(
    () =>
      movimentacoes.reduce(
        (total, item) => {
          const tipo = normalizarTexto(item.tipo);
          const quantidade = Number(item.quantidade || 0);

          if (tipo.includes("ENTRAD")) {
            total.entradas += quantidade;
            total.quantidadeEntradas++;
          } else if (
            tipo.includes("SAID") ||
            tipo.includes("RETIR")
          ) {
            total.saidas += quantidade;
            total.quantidadeSaidas++;
          }

          return total;
        },
        {
          entradas: 0,
          saidas: 0,
          quantidadeEntradas: 0,
          quantidadeSaidas: 0
        }
      ),
    [movimentacoes]
  );

  const tituloPagina =
    MENU.find((item) => item.id === pagina)?.label ||
    "Visão geral";

  // =====================================================
  // MENU
  // =====================================================

  function alternarMenu() {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMenuMobileAberto((atual) => !atual);
    } else {
      setSidebarRecolhida((atual) => !atual);
    }
  }

  function navegar(id) {
    setPagina(id);
    setErro("");
    setAviso("");
    setMenuMobileAberto(false);
  }

  // =====================================================
  // PRODUTOS
  // =====================================================

  function atualizarProduto(campo, valor) {
    setFormProduto((atual) => ({
      ...atual,
      [campo]: valor
    }));
  }

  function abrirNovoProduto() {
    setProdutoSelecionado(null);
    setFormProduto({ ...FORM_PRODUTO_INICIAL });
    setModalProduto(true);
  }

  function abrirEdicaoProduto(produto) {
    setProdutoSelecionado(produto);

    setFormProduto({
      codigo: produto.codigo ?? "",
      nome: produto.nome ?? "",
      categoria: produto.categoria ?? "",
      descricao: produto.descricao ?? "",
      unidade_medida: produto.unidade_medida ?? "UN",
      preco_custo: String(produto.preco_custo ?? 0),
      preco_venda: String(produto.preco_venda ?? 0),
      estoque_minimo: String(produto.estoque_minimo ?? 0),
      imagem_url: produto.imagem_url ?? "",
      veiculo_marca: produto.veiculo_marca ?? "",
      veiculo_modelo: produto.veiculo_modelo ?? "",
      veiculo_ano: produto.veiculo_ano ?? "",
      veiculo_motor: produto.veiculo_motor ?? ""
    });

    setModalProduto(true);
  }

  async function salvarProduto(event) {
    event.preventDefault();

    setSaving(true);
    setErro("");
    setAviso("");

    const dados = {
      codigo: formProduto.codigo.trim(),
      nome: formProduto.nome.trim(),
      categoria: formProduto.categoria.trim() || null,
      descricao: formProduto.descricao.trim() || null,
      unidade_medida: formProduto.unidade_medida.trim() || "UN",
      preco_custo: Number(formProduto.preco_custo),
      preco_venda: Number(formProduto.preco_venda),
      estoque_minimo: Number(formProduto.estoque_minimo),
      imagem_url: formProduto.imagem_url.trim() || null,
      veiculo_marca: formProduto.veiculo_marca.trim() || null,
      veiculo_modelo: formProduto.veiculo_modelo.trim() || null,
      veiculo_ano: formProduto.veiculo_ano.trim() || null,
      veiculo_motor: formProduto.veiculo_motor.trim() || null
    };

    try {
      if (produtoSelecionado) {
        await api.atualizarProduto(produtoSelecionado.id, dados);
      } else {
        await api.cadastrarProduto(dados);
      }

      setModalProduto(false);
      await carregarDados();

      setAviso(
        produtoSelecionado
          ? "Produto atualizado com sucesso."
          : "Produto cadastrado com sucesso."
      );
    } catch (error) {
      setErro(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function desativarProduto(produto) {
    if (!window.confirm(`Deseja desativar o produto ${produto.nome}?`)) {
      return;
    }

    setSaving(true);
    setErro("");
    setAviso("");

    try {
      await api.desativarProduto(produto.id);
      await carregarDados();
      setAviso("Produto desativado com sucesso.");
    } catch (error) {
      setErro(error.message);
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // FORNECEDORES
  // =====================================================

  async function salvarFornecedor(event) {
    event.preventDefault();

    if (!formFornecedor.nome.trim()) {
      setErro("Informe o nome do fornecedor.");
      return;
    }

    setSaving(true);
    setErro("");
    setAviso("");

    const dados = {
      nome: formFornecedor.nome.trim(),
      cnpj: formFornecedor.cnpj.trim() || null,
      telefone: formFornecedor.telefone.trim() || null,
      email: formFornecedor.email.trim() || null,
      endereco: formFornecedor.endereco.trim() || null
    };

    try {
      await api.cadastrarFornecedor(dados);

      setModalFornecedor(false);
      setFormFornecedor({ ...FORM_FORNECEDOR_INICIAL });

      await carregarDados();
      setAviso("Fornecedor cadastrado com sucesso.");
    } catch (error) {
      setErro(error.message);
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // MOVIMENTACOES
  // =====================================================

  async function registrarMovimentacao(event) {
    event.preventDefault();

    setSaving(true);
    setErro("");
    setAviso("");

    const dados = {
      produto_id: Number(formMovimentacao.produto_id),
      fornecedor_id: formMovimentacao.fornecedor_id
        ? Number(formMovimentacao.fornecedor_id)
        : null,
      tipo: formMovimentacao.tipo,
      quantidade: Number(formMovimentacao.quantidade),
      motivo: formMovimentacao.motivo.trim(),
      observacao: formMovimentacao.observacao.trim() || null
    };

    try {
      await api.registrarMovimentacao(dados);

      setFormMovimentacao({
        ...FORM_MOVIMENTACAO_INICIAL
      });

      await carregarDados();

      setAviso(
        dados.tipo === "ENTRADA"
          ? "Entrada registrada com sucesso."
          : "Saída registrada com sucesso."
      );
    } catch (error) {
      setErro(error.message);
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // PEDIDOS DE COMPRA
  // =====================================================

  async function criarPedido(produto) {
    const fornecedorId = window.prompt(
      "Informe o ID do fornecedor. Deixe vazio para não vincular."
    );

    if (fornecedorId === null) return;

    if (
      fornecedorId.trim() &&
      !/^\d+$/.test(fornecedorId.trim())
    ) {
      setErro("Informe um ID de fornecedor válido.");
      return;
    }

    const quantidade = Number(produto.quantidade_sugerida);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setErro("A quantidade sugerida não é válida.");
      return;
    }

    const dados = {
      produto_id: Number(produto.produto_id),
      fornecedor_id: fornecedorId.trim()
        ? Number(fornecedorId)
        : null,
      quantidade,
      observacao:
        "Pedido criado a partir da necessidade de reposição."
    };

    setSaving(true);
    setErro("");
    setAviso("");

    try {
      await api.cadastrarPedido(dados);
      await carregarDados();
      setAviso("Pedido de compra criado com sucesso.");
    } catch (error) {
      setErro(error.message);
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // ASSISTENTE IA
  // =====================================================

async function enviarPerguntaTexto(textoOriginal) {
  const texto = textoOriginal.trim();

  if (!texto || carregandoIA) return;

  const historicoAnterior = historicoIA.slice(-8);

  setHistoricoIA((atual) => [
    ...atual,
    { role: "user", content: texto }
  ]);

  setPergunta("");
  setCarregandoIA(true);

  try {
    const resposta = await api.perguntarIA(
      texto,
      historicoAnterior
    );

    const conteudoResposta =
      resposta.resposta ||
      resposta.mensagem ||
      "Não foi possível obter uma resposta.";

    setHistoricoIA((atual) => [
      ...atual,
      {
        role: "assistant",
        content: conteudoResposta
      }
    ]);

    const perguntasAnteriores = historicoIA
      .filter((mensagem) => mensagem.role === "user")
      .map((mensagem) => mensagem.content);

    const novasSugestoes = gerarSugestoesRelacionadas(
      texto,
      conteudoResposta,
      [
        ...perguntasAnteriores,
        texto,
        ...sugestoesExibidasIA,
        ...sugestoesIA
      ]
    );

    setSugestoesExibidasIA((atual) => [
      ...atual,
      ...sugestoesIA,
      ...novasSugestoes
    ]);

    setSugestoesIA(novasSugestoes);

  } catch (error) {
    setHistoricoIA((atual) => [
      ...atual,
      {
        role: "assistant",
        content: `Não foi possível obter uma resposta: ${error.message}`
      }
    ]);
  } finally {
    setCarregandoIA(false);
  }
}

function enviarPergunta(event) {
  event.preventDefault();
  enviarPerguntaTexto(pergunta);
}
  // =====================================================
  // PAGINA INICIAL
  // =====================================================

  function paginaInicio() {
    return (
      <>
        <Titulo
          eyebrow="MUSTANG / PAINEL DE CONTROLE"
          title="Visão geral"
          description="Acompanhe a situação do estoque e as operações da sua empresa."
        />

        <section className="metrics-grid">
          <Indicador
            label="Produtos ativos"
            value={numero(produtosCatalogo.length)}
            detail="Peças cadastradas"
            icon={<LuPackage />}
          />

          <Indicador
            label="Unidades em estoque"
            value={numero(totalUnidades)}
            detail="Saldo total consultado"
            icon={<LuWarehouse />}
          />

          <Indicador
            label="Estoque em atenção"
            value={numero(estoqueBaixo.length)}
            detail="Produtos no mínimo ou abaixo"
            icon="!"
          />

          <Indicador
            label="Movimentações"
            value={numero(movimentacoes.length)}
            detail="Registros consultados"
            icon={<LuArrowLeftRight />}
          />
        </section>

        <div className="dashboard-grid">
          <GraficoRosca
            title="Situação do estoque"
            subtitle="Distribuição dos produtos por disponibilidade."
            data={situacaoEstoque}
          />

          <GraficoMovimentacoes data={dadosMovimentacoes} />

          <div className="dashboard-wide">
            <GraficoEstoque data={produtosComEstoque} />
          </div>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Produtos que precisam de atenção</h2>
              <p>Itens com saldo igual ou inferior ao mínimo cadastrado.</p>
            </div>

            <Botao
              secundario
              onClick={() => navegar("estoque")}
            >
              Consultar estoque
            </Botao>
          </div>

          <Tabela
            rows={estoqueBaixo.slice(0, 6)}
            empty="Nenhum produto em situação de estoque baixo."
            columns={[
              { label: "Código", key: "codigo" },
              { label: "Produto", key: "nome" },
              {
                label: "Saldo atual",
                render: (row) =>
                  `${numero(row.quantidade_atual)} ${row.unidade_medida || ""}`
              },
              { label: "Mínimo", key: "estoque_minimo" },
              {
                label: "Situação",
                render: (row) => (
                  <Estado value={classificarEstoque(row)} />
                )
              }
            ]}
          />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Movimentações recentes</h2>
              <p>Últimos registros do estoque.</p>
            </div>

            <Botao
              secundario
              onClick={() => navegar("movimentacoes")}
            >
              Ver movimentações
            </Botao>
          </div>

          <Tabela
            rows={movimentacoes.slice(0, 5)}
            columns={[
              {
                label: "Data",
                render: (row) =>
                  formatarData(
                    row.data_movimentacao || row.created_at
                  )
              },
              {
                label: "Produto",
                render: (row) =>
                  obterNomeProduto(row.produto_id, produtos)
              },
              {
                label: "Tipo",
                render: (row) => <Estado value={row.tipo} />
              },
              { label: "Quantidade", key: "quantidade" },
              { label: "Motivo", key: "motivo" }
            ]}
          />
        </section>
      </>
    );
  }

  // =====================================================
  // PRODUTOS
  // =====================================================

  function paginaProdutos() {
    return (
      <>
        <Titulo
          eyebrow="CATÁLOGO / AUTOPEÇAS"
          title="Produtos"
          description="Consulte as peças, imagens e veículos compatíveis."
          action={
            <Botao onClick={abrirNovoProduto}>
              + Novo produto
            </Botao>
          }
        />

        <section className="products-toolbar">
          <input
            className="search-input"
            placeholder="Pesquisar peça, código ou veículo..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />

          <span className="record-count">
            {produtosFiltrados.length} produtos
          </span>
        </section>

        {produtosFiltrados.length ? (
          <section className="products-grid">
            {produtosFiltrados.map((produto) => {
              const estoqueProduto =
                estoques.find(
                  (item) =>
                    Number(item.produto_id) === Number(produto.id)
                ) ||
                estoques.find(
                  (item) =>
                    item.codigo &&
                    String(item.codigo).trim() ===
                      String(produto.codigo).trim()
                );

              return (
                <article className="product-card" key={produto.id}>
                  <div className="product-card-image">
                    <FotoProduto
                      url={produto.imagem_url}
                      nome={produto.nome}
                    />
                  </div>

                  <div className="product-card-content">
                    <span className="product-code">
                      {produto.codigo}
                    </span>

                    <h3>{produto.nome}</h3>

                    <span className="product-category">
                      {produto.categoria || "Sem categoria"}
                    </span>

                    <div className="product-vehicle">
                      <span className="product-info-label">
                        VEÍCULO COMPATÍVEL
                      </span>

                      <strong>
                        {[
                          produto.veiculo_marca,
                          produto.veiculo_modelo
                        ]
                          .filter(Boolean)
                          .join(" ") || "Não informado"}
                      </strong>

                      <small>
                        {[
                          produto.veiculo_ano,
                          produto.veiculo_motor
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Compatibilidade não cadastrada"}
                      </small>
                    </div>

                    <div className="product-stock">
                      <span>Estoque disponível</span>

                      <strong>
                        {estoqueProduto
                          ? numero(estoqueProduto.quantidade_atual)
                          : "—"}
                      </strong>
                    </div>

                    <div className="product-actions">
                      <button
                        className="text-button"
                        onClick={() => abrirEdicaoProduto(produto)}
                      >
                        Editar
                      </button>

                      <button
                        className="text-button danger-text"
                        disabled={saving}
                        onClick={() => desativarProduto(produto)}
                      >
                        Desativar
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="panel">
            <div className="empty-state">
              Nenhum produto encontrado.
            </div>
          </section>
        )}
      </>
    );
  }

  // =====================================================
  // ESTOQUE
  // =====================================================

  function paginaEstoque() {
    const normais = estoques.filter(
      (item) => classificarEstoque(item) === "NORMAL"
    ).length;

    const baixos = estoques.filter(
      (item) => classificarEstoque(item) === "BAIXO"
    ).length;

    const semEstoque = estoques.filter(
      (item) => classificarEstoque(item) === "SEM ESTOQUE"
    ).length;

    return (
      <>
        <Titulo
          eyebrow="CONTROLE / DISPONIBILIDADE"
          title="Controle de estoque"
          description="Visualize saldos, níveis disponíveis e produtos que exigem atenção."
        />

        <section className="metrics-grid">
          <Indicador
            label="Unidades disponíveis"
            value={numero(totalUnidades)}
            detail="Soma dos saldos consultados"
            icon={<LuWarehouse />}
          />

          <Indicador
            label="Estoque normal"
            value={numero(normais)}
            detail="Produtos acima do mínimo"
            icon="✓"
          />

          <Indicador
            label="Estoque baixo"
            value={numero(baixos)}
            detail="Produtos no mínimo ou abaixo"
            icon="!"
          />

          <Indicador
            label="Sem estoque"
            value={numero(semEstoque)}
            detail="Produtos com saldo zero"
            icon="×"
          />
        </section>

        <section className="panel stock-overview-panel">
          <div className="panel-heading">
            <div>
              <h2>Resumo de disponibilidade</h2>
              <p>Distribuição atual dos produtos cadastrados no estoque.</p>
            </div>
          </div>

          <div className="stock-summary-bars">
            {[
              { label: "Normal", value: normais },
              { label: "Estoque baixo", value: baixos },
              { label: "Sem estoque", value: semEstoque }
            ].map((item) => (
              <div className="stock-summary-item" key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>

                <div className="horizontal-bar-track">
                  <div
                    className="horizontal-bar-fill"
                    style={{
                      width: `${
                        estoques.length
                          ? (item.value / estoques.length) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="stock-toolbar">
            <div>
              <h2>Produtos em estoque</h2>
              <p>{estoqueFiltrado.length} registros encontrados.</p>
            </div>

            <div className="stock-filters">
              <input
                className="search-input"
                placeholder="Pesquisar produto..."
                value={buscaEstoque}
                onChange={(event) => setBuscaEstoque(event.target.value)}
              />

              <select
                value={filtroEstoque}
                onChange={(event) => setFiltroEstoque(event.target.value)}
              >
                <option value="TODOS">Todas as situações</option>
                <option value="NORMAL">Normal</option>
                <option value="BAIXO">Estoque baixo</option>
                <option value="SEM ESTOQUE">Sem estoque</option>
              </select>
            </div>
          </div>

          <Tabela
            rows={estoqueFiltrado}
            empty="Nenhum produto encontrado com esses filtros."
            columns={[
              { label: "Código", key: "codigo" },
              {
                label: "Produto",
                render: (row) => (
                  <strong className="stock-product-name">
                    {row.nome || row.codigo}
                  </strong>
                )
              },
              { label: "Categoria", key: "categoria" },
              {
                label: "Quantidade atual",
                render: (row) => (
                  <strong>
                    {numero(row.quantidade_atual)} {row.unidade_medida || ""}
                  </strong>
                )
              },
              { label: "Estoque mínimo", key: "estoque_minimo" },
              {
                label: "Nível",
                render: (row) => {
                  const atual = Number(row.quantidade_atual || 0);
                  const minimo = Number(row.estoque_minimo || 0);

                  const percentual =
                    minimo > 0
                      ? Math.min(100, (atual / minimo) * 100)
                      : (atual > 0 ? 100 : 0);

                  return (
                    <div className="stock-level">
                      <div className="stock-progress">
                        <div style={{ width: `${percentual}%` }} />
                      </div>
                      <small>{percentual.toFixed(0)}% do mínimo</small>
                    </div>
                  );
                }
              },
              {
                label: "Situação",
                render: (row) => (
                  <Estado value={classificarEstoque(row)} />
                )
              }
            ]}
          />
        </section>
      </>
    );
  }

  // =====================================================
  // REPOSICAO
  // =====================================================

  function paginaReposicao() {
    const semEstoque = reposicoesNecessarias.filter(
      (item) => Number(item.quantidade_atual || 0) <= 0
    ).length;

    const baixo = reposicoesNecessarias.length - semEstoque;

    return (
      <>
        <Titulo
          eyebrow="COMPRAS / ABASTECIMENTO"
          title="Reposição de estoque"
          description="Acompanhe as necessidades de compra e as quantidades recomendadas."
        />

        <section className="metrics-grid">
          <Indicador
            label="Produtos para reposição"
            value={numero(reposicoesNecessarias.length)}
            detail="Itens que necessitam de compra"
            icon="!"
          />

          <Indicador
            label="Quantidade sugerida"
            value={numero(totalSugerido)}
            detail="Unidades recomendadas"
            icon={<LuPackagePlus />}
          />

          <Indicador
            label="Sem estoque"
            value={numero(semEstoque)}
            detail="Produtos sem saldo disponível"
            icon="×"
          />

          <Indicador
            label="Estoque baixo"
            value={numero(baixo)}
            detail="Produtos abaixo do mínimo"
            icon="↻"
          />
        </section>

        <div className="dashboard-grid">
          <GraficoReposicao
            data={[...reposicoesNecessarias].sort(
              (a, b) =>
                Number(b.quantidade_sugerida || 0) -
                Number(a.quantidade_sugerida || 0)
            )}
          />

          <section className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <h2>Prioridade de reposição</h2>
                <p>Distribuição das necessidades identificadas.</p>
              </div>
            </div>

            <div className="priority-list">
              <div className="priority-item">
                <span>Sem estoque</span>
                <strong>{semEstoque}</strong>
              </div>

              <div className="priority-item">
                <span>Estoque baixo</span>
                <strong>{baixo}</strong>
              </div>

              <div className="priority-item priority-total">
                <span>Total de produtos</span>
                <strong>{reposicoesNecessarias.length}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Lista de reposição</h2>
              <p>Produtos identificados pela consulta do Backend.</p>
            </div>

            <span className="record-count">
              {reposicoesNecessarias.length} itens
            </span>
          </div>

          <Tabela
            rows={reposicoesNecessarias}
            empty="Nenhum produto precisa de reposição no momento."
            columns={[
              { label: "Código", key: "codigo" },
              { label: "Produto", key: "nome" },
              { label: "Saldo", key: "quantidade_atual" },
              { label: "Mínimo", key: "estoque_minimo" },
              {
                label: "Pedidos abertos",
                key: "quantidade_em_pedidos_abertos"
              },
              {
                label: "Quantidade sugerida",
                render: (row) => (
                  <strong>{numero(row.quantidade_sugerida)}</strong>
                )
              },
              {
                label: "Prioridade",
                render: (row) => (
                  <Estado
                    value={
                      Number(row.quantidade_atual || 0) <= 0
                        ? "SEM ESTOQUE"
                        : "BAIXO"
                    }
                  />
                )
              },
              {
                label: "Ação",
                render: (row) => (
                  <button
                    className="text-button"
                    disabled={saving}
                    onClick={() => criarPedido(row)}
                  >
                    Criar pedido
                  </button>
                )
              }
            ]}
          />
        </section>
      </>
    );
  }

  // =====================================================
  // FORNECEDORES
  // =====================================================

  function paginaFornecedores() {
    return (
      <>
        <Titulo
          eyebrow="COMPRAS / PARCEIROS"
          title="Fornecedores"
          description="Gerencie os parceiros responsáveis pelo abastecimento do estoque."
          action={
            <Botao onClick={() => setModalFornecedor(true)}>
              + Novo fornecedor
            </Botao>
          }
        />

        <section className="metrics-grid supplier-metrics">
          <Indicador
            label="Fornecedores ativos"
            value={numero(fornecedores.length)}
            detail="Cadastros disponíveis"
            icon={<LuTruck />}
          />

          <Indicador
            label="Com telefone"
            value={numero(
              fornecedores.filter((item) => item.telefone).length
            )}
            detail="Contatos cadastrados"
            icon="☎"
          />

          <Indicador
            label="Com e-mail"
            value={numero(
              fornecedores.filter((item) => item.email).length
            )}
            detail="E-mails registrados"
            icon="@"
          />

          <Indicador
            label="Com CNPJ"
            value={numero(
              fornecedores.filter((item) => item.cnpj).length
            )}
            detail="Documentos cadastrados"
            icon="▤"
          />
        </section>

        <section className="panel supplier-panel">
          <div className="supplier-toolbar">
            <div>
              <h2>Seus fornecedores</h2>
              <p>Pesquise e consulte os contatos cadastrados.</p>
            </div>

            <input
              className="search-input"
              placeholder="Buscar fornecedor..."
              value={buscaFornecedor}
              onChange={(event) => setBuscaFornecedor(event.target.value)}
            />
          </div>

          {fornecedoresFiltrados.length ? (
            <div className="supplier-grid">
              {fornecedoresFiltrados.map((fornecedor) => (
                <article
                  className="supplier-card"
                  key={fornecedor.id}
                >
                  <div className="supplier-card-header">
                    <div className="supplier-avatar">
                      {(fornecedor.nome || "F").charAt(0).toUpperCase()}
                    </div>

                    <Estado value="ATIVO" />
                  </div>

                  <h3>{fornecedor.nome}</h3>

                  <span className="supplier-document">
                    {fornecedor.cnpj || "CNPJ não informado"}
                  </span>

                  <div className="supplier-details">
                    <div>
                      <span>TELEFONE</span>
                      <strong>
                        {fornecedor.telefone || "Não informado"}
                      </strong>
                    </div>

                    <div>
                      <span>E-MAIL</span>
                      <strong>
                        {fornecedor.email || "Não informado"}
                      </strong>
                    </div>

                    <div>
                      <span>ENDEREÇO</span>
                      <strong>
                        {fornecedor.endereco || "Não informado"}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {buscaFornecedor
                ? "Nenhum fornecedor corresponde à pesquisa."
                : "Nenhum fornecedor cadastrado. Utilize Novo fornecedor para começar."}
            </div>
          )}
        </section>
      </>
    );
  }

  // =====================================================
  // MOVIMENTACOES
  // =====================================================

  function paginaMovimentacoes() {
    return (
      <>
        <Titulo
          eyebrow="OPERAÇÕES / CONTROLE"
          title="Movimentações"
          description="Gerencie entradas e saídas e acompanhe o histórico do estoque."
        />

        <section className="metrics-grid">
          <Indicador
            label="Movimentações registradas"
            value={numero(movimentacoes.length)}
            detail="Histórico consultado"
            icon={<LuArrowLeftRight />}
          />

          <Indicador
            label="Unidades recebidas"
            value={numero(resumoMovimentacoes.entradas)}
            detail={`${resumoMovimentacoes.quantidadeEntradas} entradas`}
            icon="↓"
          />

          <Indicador
            label="Unidades retiradas"
            value={numero(resumoMovimentacoes.saidas)}
            detail={`${resumoMovimentacoes.quantidadeSaidas} saídas`}
            icon="↑"
          />

          <Indicador
            label="Saldo movimentado"
            value={numero(
              resumoMovimentacoes.entradas -
              resumoMovimentacoes.saidas
            )}
            detail="Entradas menos saídas"
            icon="="
          />
        </section>

        <section className="panel movement-form-panel">
          <div className="panel-heading">
            <div>
              <h2>Registrar movimentação</h2>
              <p>Selecione a operação e informe os dados necessários.</p>
            </div>
          </div>

          <form
            className="form-grid"
            onSubmit={registrarMovimentacao}
          >
            <div className="form-section-title">
              Tipo de operação
            </div>

            <div className="movement-type-switch">
              <button
                type="button"
                className={
                  formMovimentacao.tipo === "ENTRADA" ? "selected" : ""
                }
                onClick={() =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    tipo: "ENTRADA"
                  }))
                }
              >
                ↓ Registrar entrada
              </button>

              <button
                type="button"
                className={
                  formMovimentacao.tipo === "SAIDA" ? "selected" : ""
                }
                onClick={() =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    tipo: "SAIDA"
                  }))
                }
              >
                ↑ Registrar saída
              </button>
            </div>

            <Campo label="Produto">
              <select
                required
                value={formMovimentacao.produto_id}
                onChange={(event) =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    produto_id: event.target.value
                  }))
                }
              >
                <option value="">Selecione um produto</option>

                {produtosCatalogo.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.codigo} — {produto.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Quantidade">
              <input
                type="number"
                min="0.001"
                step="0.001"
                required
                value={formMovimentacao.quantidade}
                onChange={(event) =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    quantidade: event.target.value
                  }))
                }
              />
            </Campo>

            <Campo label="Fornecedor (opcional)">
              <select
                value={formMovimentacao.fornecedor_id}
                onChange={(event) =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    fornecedor_id: event.target.value
                  }))
                }
              >
                <option value="">Não informar</option>

                {fornecedores.map((fornecedor) => (
                  <option key={fornecedor.id} value={fornecedor.id}>
                    {fornecedor.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Motivo da movimentação">
              <input
                required
                maxLength="500"
                placeholder="Ex.: Compra, venda ou ajuste"
                value={formMovimentacao.motivo}
                onChange={(event) =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    motivo: event.target.value
                  }))
                }
              />
            </Campo>

            <Campo label="Observação">
              <input
                maxLength="2000"
                placeholder="Informações adicionais (opcional)"
                value={formMovimentacao.observacao}
                onChange={(event) =>
                  setFormMovimentacao((atual) => ({
                    ...atual,
                    observacao: event.target.value
                  }))
                }
              />
            </Campo>

            <div className="form-actions">
              <Botao
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Registrando..."
                  : formMovimentacao.tipo === "ENTRADA"
                    ? "Confirmar entrada"
                    : "Confirmar saída"}
              </Botao>
            </div>
          </form>
        </section>

        <section className="panel movement-history-panel">
          <div className="movement-history-heading">
            <div>
              <h2>Histórico de movimentações</h2>
              <p>Consulte e filtre as operações já registradas.</p>
            </div>

            <input
              className="search-input"
              placeholder="Buscar produto ou motivo..."
              value={buscaMovimentacao}
              onChange={(event) =>
                setBuscaMovimentacao(event.target.value)
              }
            />
          </div>

          <div className="movement-filter-tabs">
            {[
              { id: "TODOS", label: "Todas" },
              { id: "ENTRADA", label: "Entradas" },
              { id: "SAIDA", label: "Saídas" }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  filtroMovimentacao === item.id ? "active" : ""
                }
                onClick={() => setFiltroMovimentacao(item.id)}
              >
                {item.label}
              </button>
            ))}

            <span className="record-count">
              {movimentacoesFiltradas.length} registros
            </span>
          </div>

          <Tabela
            rows={movimentacoesFiltradas}
            empty="Nenhuma movimentação encontrada."
            columns={[
              {
                label: "Data",
                render: (row) =>
                  formatarData(
                    row.data_movimentacao || row.created_at,
                    true
                  )
              },
              {
                label: "Produto",
                render: (row) =>
                  obterNomeProduto(row.produto_id, produtos)
              },
              {
                label: "Tipo",
                render: (row) => <Estado value={row.tipo} />
              },
              { label: "Quantidade", key: "quantidade" },
              { label: "Motivo", key: "motivo" }
            ]}
          />
        </section>
      </>
    );
  }

  // =====================================================
  // ASSISTENTE IA
  // =====================================================

 function paginaIA() {
  return (
    <>
      <Titulo
        eyebrow="INTELIGÊNCIA / ASSISTENTE"
        title="Mustang Assistente"
        description="Consulte informações e receba análises inteligentes do seu estoque."
      />

      <section className="panel chat-panel">
        <div className="chat-messages">

          {historicoIA.length === 0 && (
            <div className="chat-welcome">
              <div className="chat-avatar">
                <HorseMark />
              </div>

              <h2>Bem-vindo ao Mustang Assistente</h2>

              <p>
                Posso analisar seu estoque, consultar movimentações,
                identificar riscos e ajudar no planejamento de reposição.
              </p>
            </div>
          )}

          {historicoIA.map((mensagem, index) => (
            <div
              key={index}
              className={`chat-message ${
                mensagem.role === "user"
                  ? "chat-user"
                  : "chat-assistant"
              }`}
            >
              <span>
                {mensagem.role === "user"
                  ? "Você"
                  : "Mustang IA"}
              </span>

              <p>{mensagem.content}</p>
            </div>
          ))}

          {carregandoIA && (
            <div className="chat-message chat-assistant">
              <span>Mustang IA</span>

              <div className="chat-typing">
                <i />
                <i />
                <i />
                <small>Analisando os dados...</small>
              </div>
            </div>
          )}

          {!carregandoIA && sugestoesIA.length > 0 && (
            <div className="chat-suggestions">
              <div className="chat-suggestions-heading">
                <strong>
                  {historicoIA.length === 0
                    ? "POR ONDE COMEÇAR?"
                    : "PRÓXIMAS PERGUNTAS"}
                </strong>

                <span>
                  Sugestões para continuar a conversa
                </span>
              </div>

              <div className="suggested-questions">
                {sugestoesIA.map((texto) => (
                  <button
                    key={texto}
                    type="button"
                    className="suggestion-chip"
                    disabled={carregandoIA}
                    onClick={() => enviarPerguntaTexto(texto)}
                  >
                    {texto}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <form
          className="chat-form"
          onSubmit={enviarPergunta}
        >
          <textarea
            rows="2"
            placeholder="Pergunte algo sobre seu estoque..."
            value={pergunta}
            onChange={(event) => setPergunta(event.target.value)}
            maxLength="2000"
            disabled={carregandoIA}
          />

          <Botao
            type="submit"
            disabled={carregandoIA || !pergunta.trim()}
          >
            {carregandoIA ? "Consultando..." : "Enviar"}
          </Botao>
        </form>
      </section>
    </>
  );
}

  // =====================================================
  // RENDERIZACAO DAS PAGINAS
  // =====================================================

  function renderizarPagina() {
    switch (pagina) {
      case "produtos":
        return paginaProdutos();

      case "estoque":
        return paginaEstoque();

      case "movimentacoes":
        return paginaMovimentacoes();

      case "reposicao":
        return paginaReposicao();

      case "fornecedores":
        return paginaFornecedores();

      case "ia":
        return paginaIA();

      default:
        return paginaInicio();
    }
  }

  // =====================================================
  // INTERFACE PRINCIPAL
  // =====================================================

  return (
    <div
      className={[
        "app-shell",
        sidebarRecolhida ? "sidebar-collapsed" : "",
        menuMobileAberto ? "mobile-menu-open" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {menuMobileAberto && (
        <button
          className="mobile-overlay"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuMobileAberto(false)}
        />
      )}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">
            <HorseMark />
          </div>

          <div className="brand-text">
            <strong>MUSTANG</strong>
            <span>GESTÃO INTELIGENTE</span>
          </div>
        </div>

        <div className="sidebar-label">
          MENU PRINCIPAL
        </div>

        <nav className="side-navigation">
          {MENU.map((item) => (
            <button
              key={item.id}
              type="button"
              title={sidebarRecolhida ? item.label : undefined}
              className={`nav-link ${
                pagina === item.id ? "active" : ""
              }`}
              onClick={() => navegar(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>

              {item.id === "ia" && (
                <span className="nav-tag">IA</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          <span className="sidebar-bottom-text">
            MUSTANG OPERACIONAL
          </span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="navigation-toggle"
              onClick={alternarMenu}
              aria-label="Recolher ou expandir menu"
              title="Recolher ou expandir menu"
            >
              ☰
            </button>

            <div>
              <span className="topbar-caption">
                MUSTANG / SISTEMA INTEGRADO
              </span>
              <strong>{tituloPagina}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="api-indicator">
              <i /> SISTEMA
            </span>

            <button
              type="button"
              className="icon-button settings-button"
              onClick={() => setModalConfiguracoes(true)}
              aria-label="Abrir configurações"
              title="Configurações"
            >
              <FaGear />
            </button>
          </div>
        </header>

        <main className="main-content">
          {erro && (
            <Feedback message={erro} type="error" />
          )}

          {aviso && <Feedback message={aviso} />}

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <strong>Carregando Mustang...</strong>
              <span>Consultando os dados do sistema.</span>
            </div>
          ) : (
            renderizarPagina()
          )}

          <footer className="footer">
            MUSTANG SISTEMA INTEGRADO
            <span>·</span>
            CONTROLE INTELIGENTE DE ESTOQUE
          </footer>
        </main>
      </div>

      {/* MODAL DE CONFIGURACOES */}

      {modalConfiguracoes && (
        <Modal
          title="Configurações do sistema"
          onClose={() => setModalConfiguracoes(false)}
        >
          <div className="settings-content">
            <div className="settings-option">
              <div>
                <strong>Menu lateral</strong>
                <p>Personalize a navegação do Mustang.</p>
              </div>

              <Botao
                secundario
                type="button"
                onClick={() =>
                  setSidebarRecolhida((atual) => !atual)
                }
              >
                {sidebarRecolhida ? "Expandir menu" : "Recolher menu"}
              </Botao>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL DE PRODUTO */}

      {modalProduto && (
        <Modal
          title={
            produtoSelecionado
              ? "Editar produto"
              : "Novo produto"
          }
          onClose={() => setModalProduto(false)}
        >
          <form
            className="form-grid modal-form"
            onSubmit={salvarProduto}
          >
            <Campo label="Código">
              <input
                required
                maxLength="100"
                value={formProduto.codigo}
                onChange={(event) =>
                  atualizarProduto("codigo", event.target.value)
                }
              />
            </Campo>

            <Campo label="Nome do produto">
              <input
                required
                maxLength="200"
                value={formProduto.nome}
                onChange={(event) =>
                  atualizarProduto("nome", event.target.value)
                }
              />
            </Campo>

            <Campo label="Categoria">
              <input
                value={formProduto.categoria}
                onChange={(event) =>
                  atualizarProduto("categoria", event.target.value)
                }
              />
            </Campo>

            <Campo label="Unidade de medida">
              <input
                required
                value={formProduto.unidade_medida}
                onChange={(event) =>
                  atualizarProduto("unidade_medida", event.target.value)
                }
              />
            </Campo>

            <Campo label="Preço de custo">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formProduto.preco_custo}
                onChange={(event) =>
                  atualizarProduto("preco_custo", event.target.value)
                }
              />
            </Campo>

            <Campo label="Preço de venda">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formProduto.preco_venda}
                onChange={(event) =>
                  atualizarProduto("preco_venda", event.target.value)
                }
              />
            </Campo>

            <Campo label="Estoque mínimo">
              <input
                type="number"
                min="0"
                step="0.001"
                required
                value={formProduto.estoque_minimo}
                onChange={(event) =>
                  atualizarProduto("estoque_minimo", event.target.value)
                }
              />
            </Campo>

            <Campo label="URL da imagem no Supabase">
              <input
                type="url"
                placeholder="https://..."
                value={formProduto.imagem_url}
                onChange={(event) =>
                  atualizarProduto("imagem_url", event.target.value)
                }
              />
            </Campo>

            <div className="form-section-title">
              Compatibilidade veicular
            </div>

            <Campo label="Marca do veículo">
              <input
                placeholder="Ex.: Volkswagen"
                value={formProduto.veiculo_marca}
                onChange={(event) =>
                  atualizarProduto("veiculo_marca", event.target.value)
                }
              />
            </Campo>

            <Campo label="Modelo do veículo">
              <input
                placeholder="Ex.: Gol"
                value={formProduto.veiculo_modelo}
                onChange={(event) =>
                  atualizarProduto("veiculo_modelo", event.target.value)
                }
              />
            </Campo>

            <Campo label="Ano ou faixa de anos">
              <input
                placeholder="Ex.: 2010–2016"
                value={formProduto.veiculo_ano}
                onChange={(event) =>
                  atualizarProduto("veiculo_ano", event.target.value)
                }
              />
            </Campo>

            <Campo label="Motorização">
              <input
                placeholder="Ex.: 1.0 / 1.6"
                value={formProduto.veiculo_motor}
                onChange={(event) =>
                  atualizarProduto("veiculo_motor", event.target.value)
                }
              />
            </Campo>

            <Campo label="Descrição">
              <textarea
                rows="3"
                value={formProduto.descricao}
                onChange={(event) =>
                  atualizarProduto("descricao", event.target.value)
                }
              />
            </Campo>

            <div className="form-actions">
              <Botao
                type="button"
                secundario
                onClick={() => setModalProduto(false)}
              >
                Cancelar
              </Botao>

              <Botao type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar produto"}
              </Botao>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL DE FORNECEDOR */}

      {modalFornecedor && (
        <Modal
          title="Cadastrar fornecedor"
          onClose={() => setModalFornecedor(false)}
        >
          <form
            className="form-grid modal-form"
            onSubmit={salvarFornecedor}
          >
            <Campo label="Nome do fornecedor">
              <input
                required
                maxLength="200"
                placeholder="Nome ou razão social"
                value={formFornecedor.nome}
                onChange={(event) =>
                  setFormFornecedor((atual) => ({
                    ...atual,
                    nome: event.target.value
                  }))
                }
              />
            </Campo>

            <Campo label="CNPJ">
              <input
                placeholder="00.000.000/0000-00"
                value={formFornecedor.cnpj}
                onChange={(event) =>
                  setFormFornecedor((atual) => ({
                    ...atual,
                    cnpj: event.target.value
                  }))
                }
              />
            </Campo>

            <Campo label="Telefone">
              <input
                type="tel"
                placeholder="(00) 00000-0000"
                value={formFornecedor.telefone}
                onChange={(event) =>
                  setFormFornecedor((atual) => ({
                    ...atual,
                    telefone: event.target.value
                  }))
                }
              />
            </Campo>

            <Campo label="E-mail">
              <input
                type="email"
                placeholder="contato@empresa.com"
                value={formFornecedor.email}
                onChange={(event) =>
                  setFormFornecedor((atual) => ({
                    ...atual,
                    email: event.target.value
                  }))
                }
              />
            </Campo>

            <Campo label="Endereço">
              <input
                placeholder="Rua, número, cidade e estado"
                value={formFornecedor.endereco}
                onChange={(event) =>
                  setFormFornecedor((atual) => ({
                    ...atual,
                    endereco: event.target.value
                  }))
                }
              />
            </Campo>

            <div className="form-actions">
              <Botao
                type="button"
                secundario
                onClick={() => setModalFornecedor(false)}
              >
                Cancelar
              </Botao>

              <Botao type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Cadastrar fornecedor"}
              </Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
