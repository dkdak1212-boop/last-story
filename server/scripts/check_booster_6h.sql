SET client_encoding TO 'UTF8';
SELECT id, section, name, description, price, reward_type, reward_payload
FROM guild_boss_shop_items
WHERE reward_type = 'boosters_package'
ORDER BY id;
