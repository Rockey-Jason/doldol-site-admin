-- 현재 돌이 관리자 사이트의 실제 랜덤박스 테이블 구조를 기준으로 합니다.
-- 테이블: public.dori_box_item
-- 컬럼: id, item_name, item_type, rarity, probability, reward_coins, item_code, created_at, reward_exp
-- 별도의 grade 컬럼을 추가할 필요가 없습니다.

select id, item_name, item_type, rarity, probability, reward_coins, item_code, created_at, reward_exp
from public.dori_box_item
order by id asc;
