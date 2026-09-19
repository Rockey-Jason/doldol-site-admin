# 돌이 관리자 센터 — 회원 전체 조회 수정본

기존 `doldol-site-admin-main`의 UI, 애니메이션, 메뉴와 관리자 기능을 유지하면서 회원 조회 구조를 수정한 버전입니다.

## 회원 조회 변경점

- Lv1 일반 회원부터 Lv10 관리자까지 `public.users` 전체 조회
- 관리자 본인도 목록에 포함
- `is_admin` / `user_level >= 10`은 관리자 사이트 진입 권한에만 사용
- 회원 목록 조회에서는 관리자 여부로 필터링하지 않음
- `public.users`를 기준으로 `auth.users`를 LEFT JOIN
- Auth 계정이 없는 `users` 행도 목록에서 유지
- 이메일 / 이메일 인증 상태 / 최근 로그인 등 Auth 상태 표시
- 검색: 회원번호, login_id, 이름, 이메일
- 회원 상세 조회용 `admin_get_user_detail()` 추가
- 기존 회원 수정 / 일괄 코인 지급 기능 유지
- 코인 잔액 변경을 기록하는 `doldolcoin_transactions` 원장 및 trigger 추가

## 관리자 보안

관리자 사이트 진입은 계속 다음 조건을 모두 만족해야 합니다.

```text
users.is_admin = true
AND users.user_level >= 10
```

`SUPABASE_SERVICE_ROLE_KEY`는 절대 브라우저의 `config.js`에 넣지 마세요.

## Supabase 적용

`supabase/admin-control-center.sql`을 Supabase SQL Editor에서 실행하세요.

이 SQL에는 다음이 포함됩니다.

- `admin_list_users()`
- `admin_get_user_detail()`
- `admin_update_user()`
- `admin_adjust_coins()`
- `admin_suspend_user()`
- `admin_logs`
- `doldolcoin_transactions`
- 돌돌코인 변경 추적 trigger

## 배포

정적 파일은 기존 GitHub Pages 구조의 `/admin/` 폴더에 넣을 수 있습니다.
