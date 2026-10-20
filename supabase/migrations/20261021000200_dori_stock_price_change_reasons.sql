-- Keep one price point per actual quote change: the trigger writes the
-- timestamped row, while these RPCs provide a server-authored reason.

DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.admin_create_dori_stock_issue(text,text,jsonb)'::regprocedure);

  v_old := $old$
    UPDATE public.dori_stocks
    SET previous_price = v_old_current,
$old$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'admin_create_dori_stock_issue: expected stock update not found';
  END IF;
  v_new := $new$
    PERFORM set_config(
      'app.dori_price_change_reason',
      format('DORI ISSUE #%s: %s', v_issue_number, trim(p_title)),
      true
    );

    UPDATE public.dori_stocks
    SET previous_price = v_old_current,
$new$;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$
    -- Every issue change becomes a first-class point in the existing price chart.
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
$old$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'admin_create_dori_stock_issue: duplicate history insert not found';
  END IF;
  v_def := replace(v_def, v_old, '');
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.change_dori_stock_price(bigint,bigint,text)'::regprocedure);
  v_old := $old$
  UPDATE public.dori_stocks
    SET previous_price = current_price,
$old$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'change_dori_stock_price: expected stock update not found';
  END IF;
  v_new := $new$
  PERFORM set_config(
    'app.dori_price_change_reason',
    left(coalesce(nullif(trim(p_reason), ''), '관리자 가격 조정'), 500),
    true
  );

  UPDATE public.dori_stocks
    SET previous_price = current_price,
$new$;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$
  INSERT INTO public.dori_stock_prices
    (stock_id, price, previous_price, change_amount, change_percent, reason)
  VALUES
    (p_stock_id, p_new_price, v_old_price, v_change, v_percent, left(coalesce(p_reason, ''), 500));
$old$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'change_dori_stock_price: old history insert not found';
  END IF;
  v_def := replace(v_def, v_old, '');
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.execute_dori_stock_instant(bigint,text,bigint)'::regprocedure);
  v_old := $old$
  update public.dori_stocks
  set previous_price=current_price,
$old$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'execute_dori_stock_instant: expected stock update not found';
  END IF;
  v_new := $new$
  perform set_config(
    'app.dori_price_change_reason',
    format('%s · %s주',
      CASE WHEN p_side = 'BUY' THEN '매수 체결' ELSE '매도 체결' END,
      p_quantity
    ),
    true
  );

  update public.dori_stocks
  set previous_price=current_price,
$new$;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END;
$migration$;
