import { useEffect, useMemo, useState } from "react";
import { api } from "./services/api";

const NAVIGATION = [
  { id: "dashboard", label: "Visão geral", icon: "▦" },
  { id: "elements", label: "Elementos", icon: "◈" },
  { id: "relations", label: "Relacionamentos", icon: "⌘" },
  { id: "map", label: "Mapa sistêmico", icon: "⌁" },
  { id: "evidence", label: "Evidências", icon: "▤" },
  { id: "impacts", label: "Análise de impactos", icon: "◎" },
  { id: "attention", label: "Pontos de atenção", icon: "!" },
  { id: "settings", label: "Configurações", icon: "⚙" }
];

/* IDENTIDADE VISUAL — MUSTANG */

function HorseMark() {
  return (
    <svg viewBox="0 0 64 64" aria-label="Símbolo Mustang">
      <path
        d="M17 48 21 31 17 17 29 22 38 12 43 23 54 27 47 37 47 49 37 44 29 51Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      <path
        d="m21 31 13 2 13-6M34 33l-5 12M42 23l-8 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <circle cx="42" cy="29" r="1.8" fill="currentColor" />
    </svg>
  );
}

/* COMPONENTES REUTILIZÁVEIS */

function MetricCard({ label, value, detail, symbol }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-symbol">{symbol}</span>
      </div>

      <strong className="metric-value">{value}</strong>

      <span className="metric-detail">{detail}</span>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
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

function StateBadge({ value }) {
  const state = String(value || "NÃO INFORMADO").toUpperCase();

  let className = "state-badge";

  if (state === "VALIDADO") {
    className += " state-valid";
  } else if (state === "SUGERIDO") {
    className += " state-suggested";
  } else if (state === "DESATUALIZADO") {
    className += " state-old";
  } else {
    className += " state-neutral";
  }

  return <span className={className}>{state}</span>;
}

function EmptyState({ message }) {
  return <div className="empty-state">{message}</div>;
}

function DataTable({ columns, rows, emptyMessage }) {
  if (!rows.length) {
    return <EmptyState message={emptyMessage} />;
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
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => (
                <td key={column.label}>
                  {column.render
                    ? column.render(row)
                    : row[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* VISÃO GERAL */


/* GRÁFICOS CIRCULARES */

function countBy(rows, getLabel) {
  const counts = {};

  rows.forEach((row) => {
    const label = getLabel(row) || "NÃO INFORMADO";
    counts[label] = (counts[label] || 0) + 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function DonutChart({ title, subtitle, data }) {
  const total = data.reduce((sum, item) => sum + item[1], 0);

  const colors = [
    "#111111",
    "#4b4b4b",
    "#777777",
    "#a5a5a5",
    "#c9c9c9",
    "#e5e5e5"
  ];

  let current = 0;

  const gradient = total > 0
    ? `conic-gradient(${data.map(([label, value], index) => {
        const start = current;
        current += (value / total) * 100;

        return `${colors[index % colors.length]} ${start}% ${current}%`;
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
          style={{ background: gradient }}
          role="img"
          aria-label={`${title}: ${total} registros`}
        >
          <div className="donut-hole">
            <strong>{total}</strong>
            <small>REGISTROS</small>
          </div>
        </div>

        <div className="donut-legend">
          {data.length ? (
            data.map(([label, value], index) => {
              const percentage = total
                ? Math.round((value / total) * 100)
                : 0;

              return (
                <div className="legend-item" key={label}>
                  <span
                    className="legend-color"
                    style={{
                      backgroundColor: colors[index % colors.length]
                    }}
                  />

                  <span className="legend-label">{label}</span>

                  <strong>{value}</strong>

                  <small>{percentage}%</small>
                </div>
              );
            })
          ) : (
            <p className="chart-empty">Sem registros disponíveis.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* VISÃO GERAL */

function OverviewPage({
  elements,
  relations,
  evidence,
  navigate
}) {
  const validatedRelations = relations.filter(
    (item) => item.estado === "VALIDADO"
  ).length;

  const suggestedRelations = relations.filter(
    (item) => item.estado === "SUGERIDO"
  ).length;

  const elementTypes = useMemo(
    () => countBy(elements, (item) => item.tipo),
    [elements]
  );

  const elementStates = useMemo(
    () => countBy(elements, (item) => item.estado),
    [elements]
  );

  const relationStates = useMemo(
    () => countBy(relations, (item) => item.estado),
    [relations]
  );

  const tableElements = elements.slice(0, 6);
  const tableRelations = relations.slice(0, 6);
  const tableEvidence = evidence.slice(0, 6);

  return (
    <>
      <SectionHeading
        eyebrow="MUSTANG / PAINEL DE CONTROLE"
        title="Visão geral"
        description="Acompanhe os elementos, relacionamentos, estados de validação e evidências da Matriz Integrada."
        action={
          <button
            className="button button-primary"
            onClick={() => navigate("elements")}
          >
            Consultar matriz <span>→</span>
          </button>
        }
      />

      {/* INDICADORES PRINCIPAIS */}

      <section className="metrics-grid">
        <MetricCard
          label="Elementos cadastrados"
          value={elements.length}
          detail="Registros da tabela elemento"
          symbol="◈"
        />

        <MetricCard
          label="Relacionamentos"
          value={relations.length}
          detail="Vínculos registrados"
          symbol="⌘"
        />

        <MetricCard
          label="Evidências"
          value={evidence.length}
          detail="Fontes documentadas"
          symbol="▤"
        />

        <MetricCard
          label="Relações validadas"
          value={validatedRelations}
          detail={`${suggestedRelations} relações sugeridas`}
          symbol="✓"
        />
      </section>

      {/* GRÁFICOS CIRCULARES */}

      <div className="dashboard-chart-grid">
        <DonutChart
          title="Elementos por categoria"
          subtitle="Distribuição dos tipos cadastrados"
          data={elementTypes}
        />

        <DonutChart
          title="Estado dos elementos"
          subtitle="Situação da documentação"
          data={elementStates}
        />

        <DonutChart
          title="Estado dos relacionamentos"
          subtitle="Situação dos vínculos registrados"
          data={relationStates}
        />
      </div>

      {/* TABELAS DA MATRIZ */}

      <div className="dashboard-tables-grid">
        <section className="panel dashboard-table-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CATÁLOGO</span>
              <h2>Elementos cadastrados</h2>
            </div>

            <button
              className="text-button"
              onClick={() => navigate("elements")}
            >
              Ver todos →
            </button>
          </div>

          <DataTable
            columns={[
              { label: "Identificador", key: "id" },
              { label: "Elemento", key: "nome" },
              { label: "Categoria", key: "tipo" },
              {
                label: "Estado",
                render: (row) => <StateBadge value={row.estado} />
              }
            ]}
            rows={tableElements}
            emptyMessage="Não há elementos cadastrados."
          />
        </section>

        <section className="panel dashboard-table-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DEPENDÊNCIAS</span>
              <h2>Relacionamentos cadastrados</h2>
            </div>

            <button
              className="text-button"
              onClick={() => navigate("relations")}
            >
              Ver todos →
            </button>
          </div>

          <DataTable
            columns={[
              { label: "ID", key: "id" },
              {
                label: "Origem",
                render: (row) => row.origem?.id || row.origem_id || "—"
              },
              { label: "Tipo", key: "tipo_relacao" },
              {
                label: "Destino",
                render: (row) => row.destino?.id || row.destino_id || "—"
              },
              {
                label: "Estado",
                render: (row) => <StateBadge value={row.estado} />
              }
            ]}
            rows={tableRelations}
            emptyMessage="Não há relacionamentos cadastrados."
          />
        </section>

        <section className="panel dashboard-table-panel dashboard-table-wide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">RASTREABILIDADE</span>
              <h2>Evidências documentadas</h2>
            </div>

            <button
              className="text-button"
              onClick={() => navigate("evidence")}
            >
              Ver todas →
            </button>
          </div>

          <DataTable
            columns={[
              { label: "Identificador", key: "id" },
              { label: "Fonte", key: "fonte" },
              { label: "Referência", key: "referencia" },
              {
                label: "Responsável",
                key: "responsavel_revisao"
              },
              { label: "Data da coleta", key: "data_coleta" }
            ]}
            rows={tableEvidence}
            emptyMessage="Não há evidências cadastradas."
          />
        </section>
      </div>
    </>
  );
}


/* ELEMENTOS */

function ElementsPage({ elements }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("TODOS");
  const [state, setState] = useState("TODOS");

  const filtered = elements.filter((item) => {
    const text = `
      ${item.id}
      ${item.nome}
      ${item.descricao || ""}
    `.toLowerCase();

    return (
      text.includes(search.toLowerCase()) &&
      (type === "TODOS" || item.tipo === type) &&
      (state === "TODOS" || item.estado === state)
    );
  });

  const types = [
    ...new Set(elements.map((item) => item.tipo).filter(Boolean))
  ];

  const states = [
    ...new Set(elements.map((item) => item.estado).filter(Boolean))
  ];

  return (
    <>
      <SectionHeading
        eyebrow="CATÁLOGO / RASTREABILIDADE"
        title="Elementos"
        description="Consulte os processos, atividades, campos, telas, APIs, regras e testes cadastrados."
      />

      <section className="panel">
        <div className="filters">
          <input
            className="search-input"
            placeholder="Pesquisar por código, nome ou descrição..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="TODOS">Todos os tipos</option>

            {types.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="TODOS">Todos os estados</option>

            {states.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="table-caption">
          {filtered.length} de {elements.length} elementos
        </div>

        <DataTable
          columns={[
            { label: "ID", key: "id" },
            { label: "Tipo", key: "tipo" },
            { label: "Nome", key: "nome" },
            { label: "Descrição", key: "descricao" },
            {
              label: "Estado",
              render: (row) => <StateBadge value={row.estado} />
            }
          ]}
          rows={filtered}
          emptyMessage="Nenhum elemento corresponde aos filtros."
        />
      </section>
    </>
  );
}

/* RELACIONAMENTOS */

function RelationsPage({ relations }) {
  const [search, setSearch] = useState("");

  const filtered = relations.filter((item) => {
    const text = [
      item.id,
      item.origem_id,
      item.destino_id,
      item.tipo_relacao,
      item.origem?.nome,
      item.destino?.nome
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(search.toLowerCase());
  });

  return (
    <>
      <SectionHeading
        eyebrow="DEPENDÊNCIAS / CONEXÕES"
        title="Relacionamentos"
        description="Consulte como os elementos da matriz se conectam."
      />

      <section className="panel">
        <div className="filters">
          <input
            className="search-input"
            placeholder="Pesquisar ID, elemento ou tipo de relação..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="table-caption">
          {filtered.length} relacionamentos encontrados
        </div>

        <DataTable
          columns={[
            { label: "ID", key: "id" },
            {
              label: "Origem",
              render: (row) => (
                <div>
                  <strong>{row.origem_id}</strong>

                  <small className="cell-subtitle">
                    {row.origem?.nome || "Elemento não localizado"}
                  </small>
                </div>
              )
            },
            { label: "Relação", key: "tipo_relacao" },
            {
              label: "Destino",
              render: (row) => (
                <div>
                  <strong>{row.destino_id}</strong>

                  <small className="cell-subtitle">
                    {row.destino?.nome || "Elemento não localizado"}
                  </small>
                </div>
              )
            },
            {
              label: "Estado",
              render: (row) => <StateBadge value={row.estado} />
            }
          ]}
          rows={filtered}
          emptyMessage="Nenhum relacionamento encontrado."
        />

        <p className="helper-text">
          Convenção da matriz: a origem é o elemento que utiliza ou depende do destino.
        </p>
      </section>
    </>
  );
}

/* MAPA SISTÊMICO */

function MapPage({ relations }) {
  return (
    <>
      <SectionHeading
        eyebrow="VISUALIZAÇÃO / DEPENDÊNCIAS"
        title="Mapa sistêmico"
        description="Visualização dos vínculos registrados entre os elementos."
      />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Rede de relacionamentos</h2>
            <p>Origem → destino, conforme a convenção da matriz.</p>
          </div>
        </div>

        {relations.length ? (
          <div className="relation-map">
            {relations.map((relation) => (
              <article className="relation-card" key={relation.id}>
                <div className="relation-node">
                  <span>ORIGEM</span>
                  <strong>{relation.origem_id}</strong>

                  <small>
                    {relation.origem?.nome || "Elemento não localizado"}
                  </small>
                </div>

                <div className="relation-connector">
                  <span>{relation.tipo_relacao}</span>
                  <b>→</b>
                </div>

                <div className="relation-node">
                  <span>DESTINO</span>
                  <strong>{relation.destino_id}</strong>

                  <small>
                    {relation.destino?.nome || "Elemento não localizado"}
                  </small>
                </div>

                <StateBadge value={relation.estado} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState message="Ainda não há relacionamentos cadastrados." />
        )}
      </section>
    </>
  );
}

/* EVIDÊNCIAS */

function EvidencePage({ evidence }) {
  return (
    <>
      <SectionHeading
        eyebrow="ORIGEM / DOCUMENTAÇÃO"
        title="Evidências"
        description="Consulte as fontes que sustentam os elementos e relacionamentos da matriz."
      />

      <section className="panel">
        <DataTable
          columns={[
            { label: "ID", key: "id" },
            { label: "Fonte", key: "fonte" },
            { label: "Referência", key: "referencia" },
            { label: "Data de coleta", key: "data_coleta" },
            {
              label: "Responsável pela revisão",
              key: "responsavel_revisao"
            }
          ]}
          rows={evidence}
          emptyMessage="Nenhuma evidência cadastrada."
        />
      </section>
    </>
  );
}

/* ANÁLISE DE IMPACTOS */


function ImpactsPage({ elements }) {
  const [elementId, setElementId] = useState("");
  const [depth, setDepth] = useState("5");
  const [state, setState] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze(event) {
    event.preventDefault();

    setError("");
    setResult(null);

    if (!elements.some((item) => item.id === elementId.trim())) {
      setError("Informe um ID que exista no catálogo de elementos.");
      return;
    }

    setLoading(true);

    try {
      const data = await api.getImpacts(
        elementId.trim(),
        depth,
        state
      );

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Transformar relações agrupadas em linhas para a tabela.
  const impacts = (result?.impactos || []).flatMap((item) => {
    const itemRelations = item.relacoes || [];

    if (!itemRelations.length) {
      return [{
        ...item,
        relacao: "—",
        estado: "—",
        evidencia: "Sem evidência associada"
      }];
    }

    return itemRelations.map((relation) => ({
      ...item,
      relacao: relation.tipo_relacao,
      estado: relation.estado,

      evidencia: (relation.evidencias || [])
        .map((evidence) =>
          [
            evidence.fonte,
            evidence.referencia
          ].filter(Boolean).join(" — ")
        )
        .filter(Boolean)
        .join("; ") || "Sem evidência associada"
    }));
  });

  return (
    <>
      <SectionHeading
        eyebrow="RASTREABILIDADE / MUDANÇAS"
        title="Análise de impactos"
        description="Identifique elementos que podem ser afetados por uma alteração."
      />

      <section className="panel">
        <form onSubmit={analyze} className="impact-form">
          <label>
            Elemento que será alterado

            <input
              list="element-options"
              value={elementId}
              onChange={(event) => setElementId(event.target.value)}
              placeholder="Ex.: CAM-018"
              required
            />

            <datalist id="element-options">
              {elements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </datalist>
          </label>

          <label>
            Profundidade

            <select
              value={depth}
              onChange={(event) => setDepth(event.target.value)}
            >
              <option value="1">1 nível — direto</option>
              <option value="2">2 níveis</option>
              <option value="3">3 níveis</option>
              <option value="4">4 níveis</option>
              <option value="5">5 níveis</option>
            </select>
          </label>

          <label>
            Estado da relação

            <select
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="">Todos os estados</option>
              <option value="VALIDADO">VALIDADO</option>
              <option value="SUGERIDO">SUGERIDO</option>
              <option value="EXTRAIDO">EXTRAIDO</option>
              <option value="DESATUALIZADO">DESATUALIZADO</option>
            </select>
          </label>

          <button
            className="button button-primary"
            disabled={loading}
          >
            {loading ? "Consultando..." : "Analisar impactos →"}
          </button>
        </form>

        {error && (
          <div className="feedback feedback-error">
            {error}
          </div>
        )}

        {result && (
          <div className="impact-results">
            <div className="result-summary">
              <div>
                <span className="eyebrow">
                  ELEMENTO ANALISADO
                </span>

                <h2>{result.elemento?.id || elementId}</h2>

                <p>{result.elemento?.nome || ""}</p>
              </div>

              <strong>
                {result.totalImpactos ?? impacts.length} impactos
              </strong>
            </div>

            <DataTable
              columns={[
                { label: "ID", key: "id" },
                { label: "Tipo", key: "tipo" },
                { label: "Nome", key: "nome" },
                { label: "Relação", key: "relacao" },
                {
                  label: "Nível",
                  render: (row) => row.distancia ?? "—"
                },
                {
                  label: "Estado",
                  render: (row) =>
                    row.estado !== "—"
                      ? <StateBadge value={row.estado} />
                      : "—"
                },
                { label: "Evidência", key: "evidencia" }
              ]}
              rows={impacts}
              emptyMessage="A consulta não retornou impactos para os parâmetros informados."
            />
          </div>
        )}
      </section>

      <p className="helper-text">
        A análise apresenta as dependências registradas no banco.
        Um resultado vazio significa que não foram encontrados
        vínculos para os parâmetros consultados, e não prova
        que uma mudança não tenha impacto.
      </p>
    </>
  );
}

/* PONTOS DE ATENÇÃO */

function AttentionPage({ elements, relations }) {
  const pendingElements = elements.filter(
    (item) => item.estado && item.estado !== "VALIDADO"
  );

  const pendingRelations = relations.filter(
    (item) => item.estado && item.estado !== "VALIDADO"
  );

  return (
    <>
      <SectionHeading
        eyebrow="REVISÃO / QUALIDADE DA MATRIZ"
        title="Pontos de atenção"
        description="Registros cuja situação ainda precisa ser revisada ou confirmada."
      />

      <div className="metrics-grid attention-metrics">
        <MetricCard
          label="Elementos pendentes"
          value={pendingElements.length}
          detail="Estado diferente de VALIDADO"
          symbol="◈"
        />

        <MetricCard
          label="Relações pendentes"
          value={pendingRelations.length}
          detail="Vínculos não validados"
          symbol="⌘"
        />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Relacionamentos para revisão</h2>
            <p>Relações sugeridas ou com outro estado não validado.</p>
          </div>
        </div>

        <DataTable
          columns={[
            { label: "ID", key: "id" },
            { label: "Origem", key: "origem_id" },
            { label: "Relação", key: "tipo_relacao" },
            { label: "Destino", key: "destino_id" },
            {
              label: "Estado",
              render: (row) => <StateBadge value={row.estado} />
            }
          ]}
          rows={pendingRelations}
          emptyMessage="Não foram encontradas relações pendentes."
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Elementos para revisão</h2>
            <p>Elementos com estado diferente de VALIDADO.</p>
          </div>
        </div>

        <DataTable
          columns={[
            { label: "ID", key: "id" },
            { label: "Tipo", key: "tipo" },
            { label: "Nome", key: "nome" },
            {
              label: "Estado",
              render: (row) => <StateBadge value={row.estado} />
            }
          ]}
          rows={pendingElements}
          emptyMessage="Não foram encontrados elementos pendentes."
        />
      </section>
    </>
  );
}

/* CONFIGURAÇÕES */

function SettingsPage({ connection, onTest, loading }) {
  return (
    <>
      <SectionHeading
        eyebrow="SISTEMA / INTEGRAÇÃO"
        title="Configurações"
        description="Informações sobre a aplicação e conexão com a API."
      />

      <section className="settings-grid">
        <article className="panel settings-panel">
          <span className="eyebrow">IDENTIDADE</span>

          <div className="settings-brand">
            <div className="brand-symbol">
              <HorseMark />
            </div>

            <div>
              <h2>Mustang</h2>
              <p>Sistema Integrado</p>
            </div>
          </div>

          <p>
            Plataforma de consulta, rastreabilidade e análise de impactos
            da Matriz Integrada.
          </p>
        </article>

        <article className="panel settings-panel">
          <span className="eyebrow">BACKEND</span>

          <h2>Conexão com a API</h2>

          <p>Servidor esperado: http://localhost:3000</p>

          <button
            className="button button-primary"
            onClick={onTest}
            disabled={loading}
          >
            {loading ? "Testando..." : "Testar conexão"}
          </button>

          {connection && (
            <div className="connection-message">
              {connection}
            </div>
          )}
        </article>
      </section>
    </>
  );
}

/* APLICAÇÃO PRINCIPAL */

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const [data, setData] = useState({
    elements: [],
    relations: [],
    evidence: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("");
  const [testing, setTesting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const result = await api.getOverview();

      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function testConnection() {
    setTesting(true);
    setConnection("");

    try {
      await api.testConnection();

      setConnection("Conexão com a API realizada com sucesso.");
    } catch (err) {
      setConnection(err.message);
    } finally {
      setTesting(false);
    }
  }

  const pageTitle =
    NAVIGATION.find((item) => item.id === activePage)?.label ||
    "Visão geral";

  function renderPage() {
    switch (activePage) {
      case "elements":
        return <ElementsPage elements={data.elements} />;

      case "relations":
        return <RelationsPage relations={data.relations} />;

      case "map":
        return <MapPage relations={data.relations} />;

      case "evidence":
        return <EvidencePage evidence={data.evidence} />;

      case "impacts":
        return <ImpactsPage elements={data.elements} />;

      case "attention":
        return (
          <AttentionPage
            elements={data.elements}
            relations={data.relations}
          />
        );

      case "settings":
        return (
          <SettingsPage
            connection={connection}
            onTest={testConnection}
            loading={testing}
          />
        );

      default:
        return (
          <OverviewPage
            elements={data.elements}
            relations={data.relations}
            evidence={data.evidence}
            navigate={setActivePage}
          />
        );
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">
            <HorseMark />
          </div>

          <div>
            <strong>MUSTANG</strong>
            <span>SISTEMA INTEGRADO</span>
          </div>
        </div>

        <div className="sidebar-label">MENU PRINCIPAL</div>

        <nav className="side-navigation">
          {NAVIGATION.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>

              {item.label}

              {activePage === item.id && (
                <span className="nav-marker" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          MATRIZ INTEGRADA
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="topbar-caption">
              MUSTANG / MATRIZ INTEGRADA
            </span>

            <strong>{pageTitle}</strong>
          </div>

          <div className="topbar-actions">
            <span className="api-indicator">
              <i />
              API LOCAL
            </span>

            <button
              className="button button-secondary button-refresh"
              onClick={loadData}
              disabled={loading}
            >
              ↻ Atualizar
            </button>
          </div>
        </header>

        <main className="main-content">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />

              <strong>Carregando dados da matriz...</strong>

              <span>
                Consultando elementos, relacionamentos e evidências.
              </span>
            </div>
          ) : error ? (
            <div className="error-panel">
              <span className="error-mark">!</span>

              <h2>Não foi possível carregar a matriz</h2>

              <p>{error}</p>

              <button
                className="button button-primary"
                onClick={loadData}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            renderPage()
          )}

          <footer className="footer">
            MUSTANG SISTEMA INTEGRADO
            <span>·</span>
            MATRIZ INTEGRADA
          </footer>
        </main>
      </div>
    </div>
  );
}