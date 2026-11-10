
CREATE OR REPLACE FUNCTION public.mustang_receber_pedido_compra(
    p_pedido_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_pedido public.mustang_pedidos_compra%ROWTYPE;
    v_movimentacao JSONB;
BEGIN

    IF p_pedido_id IS NULL OR p_pedido_id <= 0 THEN
        RAISE EXCEPTION 'PEDIDO_ID_INVALIDO';
    END IF;

    SELECT *
    INTO v_pedido
    FROM public.mustang_pedidos_compra
    WHERE id = p_pedido_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO';
    END IF;

    IF v_pedido.status <> 'PEDIDO_REALIZADO' THEN
        RAISE EXCEPTION 'PEDIDO_NAO_ELEGIVEL_RECEBIMENTO';
    END IF;

    v_movimentacao := public.mustang_registrar_movimentacao(
        v_pedido.produto_id,
        'ENTRADA',
        v_pedido.quantidade,
        'Recebimento do pedido de compra #' || v_pedido.id,
        v_pedido.fornecedor_id,
        v_pedido.observacao
    );

    UPDATE public.mustang_pedidos_compra
    SET
        status = 'RECEBIDO',
        data_recebimento = NOW()
    WHERE id = p_pedido_id
    RETURNING * INTO v_pedido;

    RETURN jsonb_build_object(
        'pedido', TO_JSONB(v_pedido),
        'resultado_movimentacao', v_movimentacao
    );

END;
$function$;
