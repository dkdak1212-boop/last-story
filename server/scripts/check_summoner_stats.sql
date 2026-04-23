-- 소환사 스탯 컬럼 확인
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'characters' AND (column_name LIKE '%str%' OR column_name IN ('int','vit','dex','spd','cri','max_hp','atk','matk','def','mdef'))
ORDER BY column_name;
