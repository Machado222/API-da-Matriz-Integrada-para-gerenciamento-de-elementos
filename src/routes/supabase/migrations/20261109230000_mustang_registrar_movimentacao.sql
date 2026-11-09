
CREATE OR REPLACE FUNCTION public.mustang_registrar_movimentacao(
    p_produto_id BIGINT,
    p_tipo TEXT,
    p_quantidade NUMERIC,
    p_motivo TEXT,
    p_fornecedor_id BIGINT,
    p_observacao TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_produto_ativo BOOLEAN;
    v_fornecedor_ativo BOOLEAN;
    v_saldo_atual NUMERIC;
    v_saldo_novo NUMERIC;
    v_tipo TEXT;
    v_movimentacao public.mustang_movimentacoes%ROWTYPE;
BEGIN
    IF p_produto_id IS NULL OR p_produto_id <= 0 THEN
        RAISE EXCEPTION 'PRODUTO_ID_INVALIDO';
    END IF;

    v_tipo := UPPER(TRIM(COALESCE(p_tipo, '')));

    IF v_tipo NOT IN ('ENTRADA', 'SAIDA') THEN
        RAISE EXCEPTION 'TIPO_MOVIMENTACAO_INVALIDO';
    END IF;

    IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
        RAISE EXCEPTION 'QUANTIDADE_INVALIDA';
    END IF;

    IF NULLIF(TRIM(p_motivo), '') IS NULL THEN
        RAISE EXCEPTION 'MOTIVO_OBRIGATORIO';
    END IF;

    SELECT ativo INTO v_produto_ativo
    FROM public.mustang_produtos
    WHERE id = p_produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO';
    END IF;

    IF NOT v_produto_ativo THEN
        RAISE EXCEPTION 'PRODUTO_INATIVO';
    END IF;

    IF p_fornecedor_id IS NOT NULL THEN
        IF p_fornecedor_id <= 0 THEN
            RAISE EXCEPTION 'FORNECEDOR_ID_INVALIDO';
        END IF;

        SELECT ativo INTO v_fornecedor_ativo
        FROM public.mustang_fornecedores
        WHERE id = p_fornecedor_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'FORNECEDOR_NAO_ENCONTRADO';
        END IF;

        IF NOT v_fornecedor_ativo THEN
            RAISE EXCEPTION 'FORNECEDOR_INATIVO';
        END IF;
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN tipo = 'ENTRADA' THEN quantidade
            WHEN tipo = 'SAIDA' THEN -quantidade
            ELSE 0
        END
    ), 0)
    INTO v_saldo_atual
    FROM public.mustang_movimentacoes
    WHERE produto_id = p_produto_id;

    IF v_tipo = 'SAIDA' AND p_quantidade > v_saldo_atual THEN
        RAISE EXCEPTION
            'SALDO_INSUFICIENTE: saldo atual %, quantidade solicitada %',
            v_saldo_atual, p_quantidade;
    END IF;

    INSERT INTO public.mustang_movimentacoes (
        produto_id,
        fornecedor_id,
        tipo,
        quantidade,
        motivo,
        observacao
    )
    VALUES (
        p_produto_id,
        p_fornecedor_id,
        v_tipo,
        p_quantidade,
        TRIM(p_motivo),
        NULLIF(TRIM(p_observacao), '')
    )
    RETURNING * INTO v_movimentacao;

    IF v_tipo = 'ENTRADA' THEN
        v_saldo_novo := v_saldo_atual + p_quantidade;
    ELSE
        v_saldo_novo := v_saldo_atual - p_quantidade;
    END IF;

    RETURN jsonb_build_object(
        'movimentacao', TO_JSONB(v_movimentacao),
        'saldo_anterior', v_saldo_atual,
        'saldo_atual', v_saldo_novo
    );
END;
$$;

REVOKE ALL ON FUNCTION
public.mustang_registrar_movimentacao(bigint, text, numeric, text, bigint, text)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
public.mustang_registrar_movimentacao(bigint, text, numeric, text, bigint, text)
FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.mustang_registrar_movimentacao(bigint, text, numeric, text, bigint, text)
TO service_role;
