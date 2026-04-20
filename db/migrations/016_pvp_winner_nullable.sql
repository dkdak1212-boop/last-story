-- PvP 무승부(타임아웃 + HP 비율 동률) 시 winner_id = NULL 기록을 허용
ALTER TABLE pvp_battles ALTER COLUMN winner_id DROP NOT NULL;
