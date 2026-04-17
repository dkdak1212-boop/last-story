SET client_encoding TO 'UTF8';
-- Find user_id of 코구맨
SELECT c.id, c.name, c.user_id, u.username
FROM characters c JOIN users u ON u.id = c.user_id
WHERE c.name = '코구맨';

-- Count all active listings for that user (across ALL their characters)
SELECT COUNT(*) AS active_listings
FROM auctions a JOIN characters c ON c.id = a.seller_id
WHERE c.user_id = (SELECT user_id FROM characters WHERE name='코구맨')
  AND a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW();

-- List them
SELECT a.id, c.name AS seller, i.name AS item, a.item_quantity, a.start_price, a.ends_at
FROM auctions a
JOIN characters c ON c.id = a.seller_id
JOIN items i ON i.id = a.item_id
WHERE c.user_id = (SELECT user_id FROM characters WHERE name='코구맨')
  AND a.settled = FALSE AND a.cancelled = FALSE AND a.ends_at > NOW()
ORDER BY a.id;
