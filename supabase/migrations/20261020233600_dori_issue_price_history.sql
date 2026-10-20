-- Apply issue changes to the tradable quote and record a chart point.
-- The RPC keeps the existing admin authorization gate and runs atomically.

CREATE OR REPLACE FUNCTION public.admin_create_dori_stock_issue(
  p_title text,
  p_content text,
  p_impacts jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_issue_id bigint;
  v_issue_number bigint;
  v_user_id text := auth.uid()::text;
  v_count integer;
  v_distinct integer;
  v_item record;
  v_stock record;
  v_pct numeric;
  v_old_current bigint;
  v_new_current bigint;
  v_old_reference bigint;
  v_new_reference bigint;
  v_actual_change_percent numeric;
BEGIN
  IF NOT public.admin_is_authorized() THEN
    RAISE EXCEPTION '관리자 권한이 없습니다.';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  IF nullif(trim(coalesce(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION '이슈 제목을 입력하세요.';
  END IF;

  IF nullif(trim(coalesce(p_content, '')), '') IS NULL THEN
    RAISE EXCEPTION '이슈 내용을 입력하세요.';
  END IF;

  IF p_impacts IS NULL OR jsonb_typeof(p_impacts) <> 'array' THEN
    RAISE EXCEPTION '주식 영향 데이터가 올바르지 않습니다.';
  END IF;

  SELECT count(*), count(DISTINCT stock_id)
    INTO v_count, v_distinct
  FROM jsonb_to_recordset(p_impacts)
    AS x(stock_id bigint, ticker text, change_percent numeric);

  IF v_count <> 6 OR v_distinct <> 6 THEN
    RAISE EXCEPTION '6개 종목의 영향률을 모두 입력해야 합니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_impacts)
      AS x(stock_id bigint, ticker text, change_percent numeric)
    WHERE stock_id IS NULL
       OR ticker IS NULL
       OR change_percent IS NULL
       OR change_percent < -50
       OR change_percent > 50
  ) THEN
    RAISE EXCEPTION '종목 ID, 티커, 증감률을 확인하세요. 증감률은 -50.00%%에서 50.00%% 사이여야 합니다.';
  END IF;

  INSERT INTO public.dori_stock_issues(title, content, status, created_by)
  VALUES (trim(p_title), trim(p_content), 'published', v_user_id)
  RETURNING id, issue_number INTO v_issue_id, v_issue_number;

  -- Lock stocks in a stable order so all six impacts commit or roll back together.
  FOR v_item IN
    SELECT *
    FROM jsonb_to_recordset(p_impacts)
      AS x(stock_id bigint, ticker text, change_percent numeric)
    ORDER BY stock_id
  LOOP
    SELECT id, ticker, current_price, reference_price
      INTO v_stock
    FROM public.dori_stocks
    WHERE id = v_item.stock_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '활성 종목을 찾을 수 없습니다. stock_id=%', v_item.stock_id;
    END IF;

    IF v_stock.ticker <> v_item.ticker THEN
      RAISE EXCEPTION '종목 정보가 일치하지 않습니다. stock_id=%', v_item.stock_id;
    END IF;

    v_pct := round(v_item.change_percent::numeric, 2);
    v_old_current := greatest(1, coalesce(v_stock.current_price, 1));
    v_old_reference := greatest(1, coalesce(v_stock.reference_price, v_old_current));

    v_new_current := greatest(
      1,
      round(v_old_current::numeric * (1 + v_pct / 100.0))::bigint
    );

    v_new_reference := greatest(
      1,
      round(v_old_reference::numeric * (1 + v_pct / 100.0))::bigint
    );

    v_actual_change_percent :=
      CASE
        WHEN v_old_current = 0 THEN 0
        ELSE round(
          ((v_new_current - v_old_current)::numeric / v_old_current::numeric) * 100,
          4
        )
      END;

    UPDATE public.dori_stocks
    SET previous_price = v_old_current,
        current_price = v_new_current,
        reference_price = v_new_reference,
        change_amount = v_new_current - v_old_current,
        change_percent = v_actual_change_percent,
        fundamental_score = greatest(
          -100,
          least(100, coalesce(fundamental_score, 0) + v_pct)
        ),
        updated_at = clock_timestamp()
    WHERE id = v_stock.id;

    INSERT INTO public.dori_stock_prices(
      stock_id, price, previous_price, change_amount, change_percent, reason
    )
    VALUES (
      v_stock.id,
      v_new_current,
      v_old_current,
      v_new_current - v_old_current,
      v_actual_change_percent,
      format('DORI ISSUE #%s: %s', v_issue_number, trim(p_title))
    );

    INSERT INTO public.dori_stock_issue_impacts(
      issue_id, stock_id, ticker, change_percent, old_price, new_price
    )
    VALUES (
      v_issue_id,
      v_stock.id,
      v_stock.ticker,
      v_pct,
      v_old_current,
      v_new_current
    );
  END LOOP;

  INSERT INTO public.admin_logs(admin_user_id, action, target_user_id, details)
  VALUES (
    auth.uid(),
    'DORI_STOCK_ISSUE_CREATE',
    NULL,
    jsonb_build_object(
      'issue_id', v_issue_id,
      'issue_number', v_issue_number,
      'title', trim(p_title),
      'impacts', p_impacts,
      'pricing_model', 'current_and_reference_price_with_history'
    )
  );

  RETURN v_issue_id;
END;
$function$;
