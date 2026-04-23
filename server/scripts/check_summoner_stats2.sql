-- 캐릭 테이블 컬럼 전체
SELECT column_name FROM information_schema.columns WHERE table_name = 'characters' ORDER BY ordinal_position;
