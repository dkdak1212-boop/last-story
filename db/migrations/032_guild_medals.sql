-- 길드 전용 메달 시스템
-- · guilds.guild_medals: 길드 단위 코인 풀 (길드장+부길드장만 구매 가능)
-- · guild_boss_shop_items.currency: 'medal' (개인) | 'guild_medal' (길드)
-- · 길드 보스 50억 데미지 돌파 시 길드 풀에 +1000 메달 (개인 처치 보상과 별개)
SET client_encoding TO 'UTF8';
BEGIN;

ALTER TABLE guilds ADD COLUMN IF NOT EXISTS guild_medals BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guild_boss_shop_items ADD COLUMN IF NOT EXISTS currency VARCHAR(16) NOT NULL DEFAULT 'medal';

-- 기존 'guild' 섹션 상품은 새 화폐로 전환
UPDATE guild_boss_shop_items SET currency = 'guild_medal' WHERE section = 'guild';

SELECT section, name, price, currency FROM guild_boss_shop_items ORDER BY section, sort_order;

COMMIT;
