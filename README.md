# 돌이 관리자 센터

## 주요 변경사항
- `📰 신문 & 퀴즈` 메뉴로 돌이신문과 돌이퀴즈를 회차별로 통합 표시
- 회차 번호를 숫자 기준 오름차순으로 정렬
- 퀴즈 작성 여부를 `작성됨 / 미작성`으로 명확하게 표시
- 회차 카드를 클릭하면 `editor.html` 전용 편집/상세 화면으로 이동
- 기존 `prompt()` 기반 신문/퀴즈 편집 제거
- 신문 본문, 퀴즈, 선택지, 정답을 한 화면에서 편집
- 검색 / 전체 / 퀴즈 미작성 / 작성 완료 필터
- 로딩/저장/상세 보기 애니메이션 및 반응형 UI
- 기존 회원 관리, 랜덤박스, 이벤트, 통계, 로그, 보안 기능 유지

## 배포
GitHub Pages에서 `index.html`과 같은 경로에 `editor.html`, `js/editor.js`가 배포되어야 합니다.

## 중요
`SUPABASE_ANON_KEY`만 브라우저 설정에 사용하고, Service Role Key는 절대 `config.js`에 넣지 마세요.


## FINAL EDITOR SQL
Supabase SQL Editor에서 `supabase/admin-final-editors.sql`을 실행하세요. 실제 랜덤박스 테이블은 `dori_box_items`입니다.
