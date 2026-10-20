-- Preserve the legacy issue title on the unified quote history timeline.
DO $migration$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.publish_dori_stock_issue(text,text,jsonb)'::regprocedure);
  IF position('UPDATE public.dori_stock' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Legacy issue stock update was not found';
  END IF;
  v_new := $replacement$PERFORM set_config(
          'app.dori_price_change_reason',
          format('DORI ISSUE: %s', left(coalesce(v_reason, trim(p_title)), 120)),
          true
        );
        UPDATE public.dori_stocks$replacement$;
  v_def := regexp_replace(v_def, 'UPDATE public[.]dori_stocks', v_new, '');
  EXECUTE v_def;
END;
$migration$;
