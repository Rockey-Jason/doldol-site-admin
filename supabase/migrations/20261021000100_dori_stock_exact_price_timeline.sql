-- Backfill historical trade prints into the unified price timeline.
-- Multiple buyer/seller rows can represent the same market fill, so coalesce
-- equal stock/time/price events instead of drawing duplicate ticks.
WITH trade_events AS (
  SELECT t.stock_id,t.created_at,t.price,min(t.id)::bigint AS source_id,
         string_agg(DISTINCT t.trade_type, '/' ORDER BY t.trade_type) AS sides,
         sum(t.quantity)::bigint AS quantity
  FROM public.dori_stock_trades AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dori_stock_prices AS p
    WHERE p.stock_id=t.stock_id AND p.price=t.price AND p.created_at=t.created_at
  )
  GROUP BY t.stock_id,t.created_at,t.price
),
all_events AS (
  SELECT p.stock_id,p.price,p.created_at,0 AS source_order,p.id::bigint AS source_id,
         false AS is_trade,p.reason::text AS event_reason
  FROM public.dori_stock_prices AS p
  UNION ALL
  SELECT t.stock_id,t.price,t.created_at,1 AS source_order,t.source_id,true AS is_trade,
         format('기존 거래 기록 복원 · %s · %s주',t.sides,t.quantity) AS event_reason
  FROM trade_events AS t
),
sequenced AS (
  SELECT e.*,lag(e.price) OVER (
    PARTITION BY e.stock_id ORDER BY e.created_at,e.source_order,e.source_id
  ) AS prior_price
  FROM all_events AS e
)
INSERT INTO public.dori_stock_prices(
  stock_id,price,previous_price,change_amount,change_percent,reason,created_at
)
SELECT stock_id,price,coalesce(prior_price,price),
       price-coalesce(prior_price,price),
       CASE WHEN coalesce(prior_price,price)=0 THEN 0
            ELSE round(((price-coalesce(prior_price,price))::numeric
                     /coalesce(prior_price,price)::numeric)*100,4) END,
       event_reason,created_at
FROM sequenced
WHERE is_trade;

-- Persist each actual current-quote change using wall-clock time.
CREATE OR REPLACE FUNCTION public.capture_dori_stock_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reason text;
  v_change bigint;
  v_percent numeric;
BEGIN
  IF NEW.current_price IS NOT DISTINCT FROM OLD.current_price THEN
    RETURN NEW;
  END IF;
  v_change := NEW.current_price - OLD.current_price;
  v_percent := CASE WHEN OLD.current_price=0 THEN 0
    ELSE round((v_change::numeric/OLD.current_price::numeric)*100,4) END;
  v_reason := nullif(current_setting('app.dori_price_change_reason',true),'');
  IF v_reason IS NULL THEN
    v_reason := format('가격 변경 자동 기록 · %s',NEW.ticker);
  END IF;
  INSERT INTO public.dori_stock_prices(
    stock_id,price,previous_price,change_amount,change_percent,reason,created_at
  )
  VALUES (
    NEW.id,NEW.current_price,OLD.current_price,v_change,v_percent,
    left(v_reason,500),clock_timestamp()
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_dori_stock_price_history() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_capture_dori_stock_price_history ON public.dori_stocks;
CREATE TRIGGER trg_capture_dori_stock_price_history
AFTER UPDATE OF current_price ON public.dori_stocks
FOR EACH ROW
WHEN (OLD.current_price IS DISTINCT FROM NEW.current_price)
EXECUTE FUNCTION public.capture_dori_stock_price_history();
