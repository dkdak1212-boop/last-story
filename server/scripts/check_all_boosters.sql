SET client_encoding TO 'UTF8';
SELECT id, section, name, description, price, reward_type, reward_payload
FROM guild_boss_shop_items
WHERE name ILIKE '%부스터%' OR reward_type LIKE 'booster%'
ORDER BY id;
