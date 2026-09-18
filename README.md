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
5. 이메일 링크를 실제 관리자 세션 승인으로 연결하려면 Edge Function에 token consume endpoint를 추가하고, 그 endpoint가 짧은 수명의 관리자 세션/nonce를 발급하도록 구성하세요.
6. `admin_update_user`, `admin_adjust_coins`, `admin_suspend_user`는 반드시 RPC + RLS 정책으로 보호하세요.
7. 영구정지/일시정지를 실제 로그인 차단으로 적용하려면 로그인 시 `permanently_banned`와 `suspended_until`을 서버측에서 검사하세요.

## 배포
정적 파일은 기존 GitHub Pages 구조의 `/admin/` 폴더에 넣을 수 있습니다.
