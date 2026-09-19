# 돌이 관리자 센터

## 포함 기능
- `users.is_admin = true` AND `user_level >= 10` 이중 관리자 검사
- Supabase Auth 기반 계정 로그인
- 관리자 인증 이메일 2단계 흐름의 기본 구성
- 회원 번호/아이디/이름/레벨/돌돌코인/EXP 조회
- 회원 다중 선택 + 일괄 코인 지급
- 회원 코인/EXP/레벨 수정 RPC
- 돌이신문/퀴즈 CRUD
- 랜덤박스 아이템 CRUD
- 이벤트 CRUD
- 통계
- 관리자 로그
- 영구/일시 정지용 DB/RPC 기반
- 반응형 다크 네이비 UI와 애니메이션

## 매우 중요한 보안 사항
1. `SUPABASE_SERVICE_ROLE_KEY`를 브라우저 코드에 절대 넣지 마세요.
2. `users`에 비밀번호를 저장하지 마세요. 비밀번호는 Supabase Auth가 처리해야 합니다.
3. `config.example.js`를 `config.js`로 복사한 후 URL/anon key를 넣으세요.
4. 현재 예제의 관리자 이메일 발송은 Edge Function을 통해서만 수행합니다.
5. 이메일 링크 인증은 현재 로그인된 같은 브라우저의 Supabase Auth 세션과 토큰 소유자를 서버에서 함께 확인합니다.
6. `admin-login-email`은 로그인 전 `login_id -> Auth email` 조회가 필요하므로 `verify_jwt = false`이며, 서버에서 `is_admin = true` AND `user_level >= 10`을 검사합니다.
7. `admin-request-verification`과 `admin-verify-email`은 `verify_jwt = true`이며, Edge Function 내부에서도 현재 JWT와 관리자 권한을 다시 확인합니다.
8. `admin_update_user`, `admin_adjust_coins`, `admin_suspend_user`는 반드시 RPC + RLS 정책으로 보호하세요.
9. 영구정지/일시정지를 실제 로그인 차단으로 적용하려면 로그인 시 `permanently_banned`와 `suspended_until`을 서버측에서 검사하세요.

## 배포
정적 파일은 기존 GitHub Pages 구조의 `/admin/` 폴더에 넣을 수 있습니다.


## 새 관리자 로그인 구조

- `public.users.user_id`는 `auth.users.id`의 UUID 문자열과 일치해야 합니다.
- `login_id`로 `users`를 찾고, Edge Function이 `auth.users`에서 이메일을 찾아옵니다.
- 브라우저는 그 이메일 + 입력한 비밀번호로 `supabase.auth.signInWithPassword()`를 사용합니다.
- 로그인 후 `admin-request-verification`이 현재 JWT를 확인하고 관리자 이메일로 10분짜리 인증 링크를 보냅니다.
- 인증 링크는 **로그인한 같은 브라우저**에서 여는 것을 권장합니다.
- 인증 토큰 확인은 `admin-verify-email`이 service role로 처리합니다.

### 배포할 Edge Functions

1. `admin-login-email`
2. `admin-request-verification`
3. `admin-verify-email`

### Edge Function Secrets

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ADMIN_VERIFY_EMAIL` (기본값: jason.yeonwoo.im@gmail.com)
- `ADMIN_SITE_URL` (Cloudflare Pages의 관리자 사이트 주소)
- `VERIFY_FROM_EMAIL`

`SUPABASE_URL`과 Auth 관련 기본 환경변수는 Supabase hosted Edge Functions에서 제공됩니다.

### 브라우저 config

`js/config.js`에는 Publishable/anon key만 넣으세요. `service_role`/`secret` key는 절대 넣지 마세요.


## 이번 버전의 인증 흐름

1. 브라우저가 `admin-login-email`에 `login_id`를 보냅니다.
2. 함수는 service role로 `users`와 `auth.users`를 확인하고 관리자 계정의 Auth 이메일만 반환합니다.
3. 브라우저가 그 이메일과 입력한 비밀번호로 `signInWithPassword()`를 실행합니다.
4. 로그인 후 브라우저의 access token을 `admin-request-verification`에 전달합니다.
5. 함수는 JWT의 실제 `auth.uid()`를 기준으로 관리자 권한을 다시 확인합니다.
6. 10분 유효한 1회용 인증 링크를 생성하고 지정된 관리자 이메일로 발송합니다.
7. 이메일 링크가 같은 로그인 브라우저에서 열리면 `admin-verify-email`이 JWT 사용자와 토큰의 `user_id`가 같은지 확인합니다.
8. 토큰을 원자적으로 `used=true`로 소비하고 브라우저에 30분짜리 인증 상태를 기록합니다.

### Edge Function 설정

`supabase/config.toml`:
- `admin-login-email`: `verify_jwt = false`
- `admin-request-verification`: `verify_jwt = true`
- `admin-verify-email`: `verify_jwt = true`

### Secrets

- `SUPABASE_SERVICE_ROLE_KEY` — 절대 브라우저에 넣지 않습니다.
- `RESEND_API_KEY`
- `ADMIN_VERIFY_EMAIL` — 기본값 `jason.yeonwoo.im@gmail.com`
- `ADMIN_SITE_URL` — 관리자 사이트의 실제 URL
- `VERIFY_FROM_EMAIL` — Resend에서 발신이 허용된 이메일 주소

`SUPABASE_URL`, `SUPABASE_ANON_KEY`는 브라우저용 설정입니다. anon/publishable key는 RLS와 서버 권한 검사를 전제로 사용합니다.
