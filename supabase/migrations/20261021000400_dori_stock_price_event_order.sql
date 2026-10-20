-- Preserve event ordering for price prints and post-trade quotes that share
-- the database transaction timestamp. Both keep their original created_at.
ALTER TABLE public.dori_stock_prices
  ADD COLUMN IF NOT EXISTS event_order smallint NOT NULL DEFAULT 1;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dori_stock_prices'::regclass
      AND conname = 'dori_stock_prices_event_order_check'
  ) THEN
    ALTER TABLE public.dori_stock_prices
      ADD CONSTRAINT dori_stock_prices_event_order_check
      CHECK (event_order IN (0,1));
  END IF;
END;
$migration$;

UPDATE public.dori_stock_prices
SET event_order = 0
WHERE reason LIKE '기존 거래 기록 복원%';

WITH sequenced AS (
  SELECT id,stock_id,price,
         lag(price) OVER (
           PARTITION BY stock_id
           ORDER BY created_at,event_order,id
         ) AS prev_price
  FROM public.dori_stock_prices
),
normalized AS (
  SELECT id,price,coalesce(prev_price,price) AS prev_price
  FROM sequenced
)
UPDATE public.dori_stock_prices AS p
SET previous_price = n.prev_price,
    change_amount = p.price - n.prev_price,
    change_percent = CASE
      WHEN n.prev_price = 0 THEN 0
      ELSE round(((p.price-n.prev_price)::numeric/n.prev_price::numeric)*100,4)
    END
FROM normalized AS n
WHERE p.id = n.id;
