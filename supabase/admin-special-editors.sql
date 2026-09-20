-- 돌이 관리자 전용 편집 화면 확장
-- 랜덤박스 아이템 등급 표시/저장을 위한 안전한 컬럼
alter table public.dori_box_items add column if not exists grade text;

-- 기존 rarity/item_grade가 있다면 데이터는 그대로 유지하세요.
-- 등급이 이미 다른 컬럼에 저장되어 있다면 box-editor.js의 gradeOf()가 이를 표시합니다.
