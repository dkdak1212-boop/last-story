-- 일일임무 풀에서 PvP 관련 항목 전부 제거
-- 2026-04-22

DELETE FROM character_daily_quests WHERE kind = 'pvp_attack';
DELETE FROM daily_quest_pool WHERE kind = 'pvp_attack';
