SET client_encoding TO 'UTF8';

-- 1. 노드 포인트 여전히 초과한 캐릭터
\echo '=== [1] 노드 포인트 초과 (total > level) ==='
SELECT c.id, c.name, c.level,
       c.node_points + COALESCE(n.cnt, 0) - c.level AS excess
FROM characters c
LEFT JOIN (SELECT character_id, COUNT(*)::int AS cnt FROM character_nodes GROUP BY character_id) n ON n.character_id = c.id
WHERE (c.node_points + COALESCE(n.cnt, 0)) > c.level
ORDER BY excess DESC;

-- 2. 스탯 포인트 초과 (정상: level * N, 여기선 대략 3? 경고만)
\echo '=== [2] 스탯 포인트가 비정상적으로 많은 캐릭터 (>300) ==='
SELECT id, name, level, stat_points FROM characters WHERE stat_points > 300 ORDER BY stat_points DESC LIMIT 20;

-- 3. 골드 과다 (10억 이상)
\echo '=== [3] 골드 10억 초과 ==='
SELECT id, name, level, gold, total_gold_earned FROM characters WHERE gold > 1000000000 ORDER BY gold DESC LIMIT 20;

-- 4. total_kills 대비 레벨 (레벨은 높은데 킬이 거의 없음)
\echo '=== [4] 고레벨인데 킬 수 적음 (Lv≥50 and kills<100) ==='
SELECT id, name, level, total_kills, total_gold_earned FROM characters WHERE level >= 50 AND total_kills < 100 ORDER BY level DESC;

-- 5. HP > MaxHP (불가능한 상태)
\echo '=== [5] HP > MaxHP ==='
SELECT id, name, level, hp, max_hp FROM characters WHERE hp > max_hp;

-- 6. 경험치가 다음 레벨 요구치를 초과
\echo '=== [6] exp 비정상 (매우 크고 level 낮음) ==='
SELECT id, name, level, exp FROM characters WHERE exp > 100000000 ORDER BY exp DESC LIMIT 20;

-- 7. 강화 레벨 비정상 (+20 이상)
\echo '=== [7] 강화 +20 이상 아이템 ==='
SELECT ci.character_id, c.name, ci.item_id, i.name AS item_name, ci.enhance_level
FROM character_inventory ci
JOIN characters c ON c.id = ci.character_id
JOIN items i ON i.id = ci.item_id
WHERE ci.enhance_level >= 20 ORDER BY ci.enhance_level DESC LIMIT 30;

\echo '=== [7b] 장착 중 강화 +20 이상 ==='
SELECT ce.character_id, c.name, ce.item_id, i.name AS item_name, ce.enhance_level
FROM character_equipped ce
JOIN characters c ON c.id = ce.character_id
JOIN items i ON i.id = ce.item_id
WHERE ce.enhance_level >= 20 ORDER BY ce.enhance_level DESC LIMIT 30;

-- 8. 창고에 노드 스크롤 +8 / 찢어진 스크롤 있는지 (차단 전 들어간 것)
\echo '=== [8] 창고에 차단 대상 아이템 ==='
SELECT s.user_id, u.username, s.item_id, i.name AS item_name, s.quantity
FROM account_storage_items s
JOIN users u ON u.id = s.user_id
JOIN items i ON i.id = s.item_id
WHERE s.item_id IN (320, 321);

-- 9. 우편함에 차단 대상 아이템
\echo '=== [9] 우편함에 차단 대상 아이템 ==='
SELECT m.character_id, c.name, m.item_id, i.name AS item_name, m.item_quantity
FROM mailbox m
JOIN characters c ON c.id = m.character_id
JOIN items i ON i.id = m.item_id
WHERE m.item_id IN (320, 321) AND m.read_at IS NULL;

-- 10. 가방 슬롯 개수 비정상
\echo '=== [10] inventory_slots_bonus 비정상 (>50) ==='
SELECT id, name, level, inventory_slots_bonus FROM characters WHERE inventory_slots_bonus > 50;
