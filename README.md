# 돌이 관리자 센터 — Advanced Control Center

돌이사이트 운영 데이터를 위한 관리자 전용 SPA입니다.

## 포함 기능

- 관리자 로그인 + Supabase Magic Link 보안 로그인
- 전체 회원 목록 / 이름 / login_id / 회원번호 / 등급 / 코인 / EXP
- Supabase Auth 이메일, 이메일 확인 상태, 마지막 로그인, Auth 상태
- 회원 상세 편집 전용 `editor.html`
- 돌이신문 CRUD
- 돌이퀴즈 CRUD
- 랜덤박스 아이템 CRUD
- 신문 이벤트 CRUD
- 돌돌코인 거래 원장 / 관리자 지급·차감 기록
- 회원 정지 / 영구정지 / 사유 관리
- 관리자 감사 로그
- 운영 통계
- 고급 다크 글래스 UI, 반응형, 자연스러운 전환 애니메이션
- prompt/alert 기반 콘텐츠 편집 제거 → 별도 편집 화면

## 반드시 해야 할 설정

### 1. Supabase SQL

Supabase Dashboard → SQL Editor에서

`supabase/admin-control-center.sql`

전체를 실행합니다.

기존 프로젝트의 `users`, `rockey_news`, `dori_box_items`, `rockey_news_events` 구조를 전제로 합니다.

### 2. Edge Function 환경변수

`admin-request-verification`에 다음 Secret을 설정합니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ADMIN_SITE_URL` — 실제 관리자 사이트의 정확한 주소
- `ADMIN_VERIFY_EMAIL` — 인증 메일을 받을 주소
- `VERIFY_FROM_EMAIL` — Resend에서 허용된 발신 주소

`SUPABASE_SERVICE_ROLE_KEY`는 절대로 `js/config.js`에 넣지 않습니다.

### 3. Supabase Redirect URL

Authentication → URL Configuration → Redirect URLs에

`ADMIN_SITE_URL`

을 정확히 등록합니다.

### 4. Edge Function 배포

`supabase/functions/admin-request-verification/index.ts`를 배포합니다.

기존 `admin-verify-email`은 Magic Link 방식에서는 사용하지 않습니다.

### 5. GitHub Pages

`index.html`, `editor.html`, `css/`, `js/`가 같은 사이트 경로에서 서비스되도록 배포합니다.

## 보안 구조

브라우저는 anon/publishable key만 사용합니다. 관리자 데이터 조회와 회원 전체 조회는 `admin_is_authorized()`를 통과해야 하는 RPC/RLS 정책으로 보호합니다.

회원 편집은 `admin_update_user_full()` RPC가 허용 필드만 반영합니다.

코인 변경은 `doldolcoin_transactions`에 원장 기록을 남기도록 구성되어 있으며, 기존 사이트에서 발생하는 `users.doldolcoin` 변경도 DB trigger를 통해 기록할 수 있습니다.

## 주의

`admin-control-center.sql`은 관리자에게 public.users의 운영 데이터를 폭넓게 노출하도록 설계되어 있습니다. 실제 운영 DB에 적용하기 전에 `users` 테이블에 저장된 민감 정보가 없는지 확인하세요.
