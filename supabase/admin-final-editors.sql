-- ============================================================
-- 돌이 관리자 센터 FINAL EDITOR RPC
-- 현재 실제 랜덤박스 테이블: public.dori_box_items
-- ============================================================

create or replace function public.admin_is_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.user_id = auth.uid()::text
      and u.is_admin = true
      and coalesce(u.user_level,0) >= 10
  );
$$;

revoke all on function public.admin_is_authorized() from public;
grant execute on function public.admin_is_authorized() to authenticated;

-- ------------------------------------------------------------
-- 랜덤박스: 생성 / 수정
-- ------------------------------------------------------------
create or replace function public.admin_save_box_item(
  p_id integer,
  p_item_name text,
  p_item_type text,
  p_rarity text,
  p_probability numeric,
  p_reward_coins integer,
  p_item_code text,
  p_reward_exp integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
 declare v_id integer;
begin
  if not public.admin_is_authorized() then raise exception '관리자 권한이 없습니다.'; end if;
  if nullif(trim(coalesce(p_item_name,'')),'') is null then raise exception '아이템 이름을 입력하세요.'; end if;
  if p_probability is null or p_probability < 0 or p_probability > 100 then raise exception '확률은 0~100 사이여야 합니다.'; end if;
  if coalesce(p_reward_coins,0) < 0 or coalesce(p_reward_exp,0) < 0 then raise exception '보상값은 음수가 될 수 없습니다.'; end if;

  if p_id is null then
    insert into public.dori_box_items(item_name,item_type,rarity,probability,reward_coins,item_code,reward_exp)
    values(trim(p_item_name),nullif(trim(p_item_type),''),nullif(trim(p_rarity),''),p_probability,coalesce(p_reward_coins,0),nullif(trim(p_item_code),''),coalesce(p_reward_exp,0))
    returning id into v_id;
  else
    update public.dori_box_items
       set item_name=trim(p_item_name), item_type=nullif(trim(p_item_type),''), rarity=nullif(trim(p_rarity),''),
           probability=p_probability, reward_coins=coalesce(p_reward_coins,0), item_code=nullif(trim(p_item_code),''), reward_exp=coalesce(p_reward_exp,0)
     where id=p_id
     returning id into v_id;
    if v_id is null then raise exception '아이템 #%를 찾을 수 없습니다.',p_id; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_save_box_item(integer,text,text,text,numeric,integer,text,integer) from public;
grant execute on function public.admin_save_box_item(integer,text,text,text,numeric,integer,text,integer) to authenticated;

-- ------------------------------------------------------------
-- 이벤트: 생성 / 수정
-- ------------------------------------------------------------
create or replace function public.admin_save_news_event(
  p_old_news_number integer,
  p_news_number integer,
  p_enabled boolean,
  p_event_name text,
  p_description text,
  p_reward_coins integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
 declare v_number integer;
begin
  if not public.admin_is_authorized() then raise exception '관리자 권한이 없습니다.'; end if;
  if p_news_number is null or p_news_number < 1 then raise exception '이벤트 번호가 올바르지 않습니다.'; end if;
  if nullif(trim(coalesce(p_event_name,'')),'') is null then raise exception '이벤트 이름을 입력하세요.'; end if;
  if coalesce(p_reward_coins,0) < 0 then raise exception '보상 코인은 음수가 될 수 없습니다.'; end if;

  if p_old_news_number is null then
    insert into public.rockey_news_events(news_number,enabled,event_name,description,reward_coins)
    values(p_news_number,coalesce(p_enabled,false),trim(p_event_name),nullif(trim(p_description),''),coalesce(p_reward_coins,0))
    returning news_number into v_number;
  else
    update public.rockey_news_events
       set news_number=p_news_number, enabled=coalesce(p_enabled,false), event_name=trim(p_event_name),
           description=nullif(trim(p_description),''), reward_coins=coalesce(p_reward_coins,0)
     where news_number=p_old_news_number
     returning news_number into v_number;
    if v_number is null then raise exception '이벤트 #%를 찾을 수 없습니다.',p_old_news_number; end if;
  end if;
  return v_number;
end;
$$;
revoke all on function public.admin_save_news_event(integer,integer,boolean,text,text,integer) from public;
grant execute on function public.admin_save_news_event(integer,integer,boolean,text,text,integer) to authenticated;

-- ------------------------------------------------------------
-- 확률표 합계 검증
-- ------------------------------------------------------------
create or replace function public.admin_box_probability_total()
returns numeric
language sql
stable
security definer
set search_path = public
as $$ select coalesce(sum(probability),0) from public.dori_box_items; $$;
revoke all on function public.admin_box_probability_total() from public;
grant execute on function public.admin_box_probability_total() to authenticated;
