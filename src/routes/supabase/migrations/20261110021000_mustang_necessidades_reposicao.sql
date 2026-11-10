
CREATE OR REPLACE VIEW public.mustang_necessidades_reposicao AS

WITH pedidos_abertos AS (
    SELECT
        produto_id,
        SUM(quantidade) AS quantidade_em_pedidos_abertos
    FROM public.mustang_pedidos_compra
    WHERE status IN (
        'PENDENTE',
        'APROVADO',
        'PEDIDO_REALIZADO'
    )
    GROUP BY produto_id
)

SELECT
    e.produto_id,
    e.codigo,
    e.nome,
    e.categoria,
    e.unidade_medida,
    e.estoque_minimo,
    e.quantidade_atual,
    e.situacao_estoque,

    COALESCE(
        p.quantidade_em_pedidos_abertos,
        0::numeric
    ) AS quantidade_em_pedidos_abertos,

    GREATEST(
        e.estoque_minimo
        - e.quantidade_atual
        - COALESCE(p.quantidade_em_pedidos_abertos, 0::numeric),
        0::numeric
    ) AS quantidade_sugerida,

    (
        GREATEST(
            e.estoque_minimo
            - e.quantidade_atual
            - COALESCE(p.quantidade_em_pedidos_abertos, 0::numeric),
            0::numeric
        ) > 0
    ) AS necessita_pedido

FROM public.mustang_estoque_atual e

LEFT JOIN pedidos_abertos p
    ON p.produto_id = e.produto_id

WHERE
    e.ativo = true
    AND e.situacao_estoque IN (
        'SEM_ESTOQUE',
        'ESTOQUE_BAIXO'
    );

GRANT SELECT ON public.mustang_necessidades_reposicao
TO anon, authenticated, service_role;
