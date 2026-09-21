-- ============================================================
-- 돌이신문 & 돌이퀴즈 관리자 저장 RPC
-- 목적: 브라우저에서 rockey_news를 직접 UPDATE/INSERT하지 않고
-- SECURITY DEFINER RPC를 통해 관리자만 안전하게 저장
-- ============================================================

create or replace function public.admin_save_news_issue(
  p_old_news_number integer,
  p_news_number integer,
  p_rockey_news text,
  p_question text,
  p_question_type text,
  p_choice1 text,
  p_choice2 text,
  p_choice3 text,
  p_choice4 text,
  p_choice5 text,
  p_answer text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- users.user_id가 TEXT인 현재 돌이사이트 구조에 맞춤
  if not exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()::text
      and u.is_admin = true
      and coalesce(u.user_level, 0) >= 10
  ) then
    raise exception '관리자 권한이 없습니다.';
  end if;

  if p_news_number is null or p_news_number < 1 then
    raise exception '회차 번호가 올바르지 않습니다.';
  end if;

  if p_old_news_number is null then
    insert into public.rockey_news (
      news_number, rockey_news, question, question_type,
      choice1, choice2, choice3, choice4, choice5, answer
    ) values (
      p_news_number, p_rockey_news, p_question, p_question_type,
      p_choice1, p_choice2, p_choice3, p_choice4, p_choice5, p_answer
    );
  else
    update public.rockey_news
    set news_number = p_news_number,
        rockey_news = p_rockey_news,
        question = p_question,
        question_type = p_question_type,
        choice1 = p_choice1,
        choice2 = p_choice2,
        choice3 = p_choice3,
        choice4 = p_choice4,
        choice5 = p_choice5,
        answer = p_answer
    where news_number = p_old_news_number;

    if not found then
      raise exception '수정할 신문 %호를 찾을 수 없습니다.', p_old_news_number;
    end if;
  end if;

  insert into public.admin_logs(admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    case when p_old_news_number is null then 'NEWS_CREATE' else 'NEWS_UPDATE' end,
    auth.uid(),
    jsonb_build_object(
      'old_news_number', p_old_news_number,
      'news_number', p_news_number,
      'has_news', coalesce(length(trim(p_rockey_news)), 0) > 0,
      'has_quiz', coalesce(length(trim(p_question)), 0) > 0
    )
  );
end;
$$;

revoke all on function public.admin_save_news_issue(
  integer, integer, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.admin_save_news_issue(
  integer, integer, text, text, text, text, text, text, text, text, text
) to authenticated;
