SET client_encoding TO 'UTF8';

\echo === BEFORE ===
SELECT COUNT(*) FILTER (WHERE exp < 0)::int AS exp_negative,
       COUNT(*) FILTER (WHERE exp = 0)::int AS exp_zero,
       COUNT(*) FILTER (WHERE online_exp_rate < 0)::int AS rate_negative,
       COUNT(*) FILTER (WHERE online_exp_rate > 1000000)::int AS rate_extreme
  FROM characters WHERE level >= 100;

BEGIN;

-- 1) 음수 exp → 0 보정 (정수 오버플로 방지)
UPDATE characters SET exp = 0 WHERE level >= 100 AND exp < 0;

-- 2) 음수 / 비정상 (천만 초과, 1초당 1천만 EXP는 비현실) online_exp_rate → 0 리셋
UPDATE characters SET online_exp_rate = 0
 WHERE level >= 100 AND (online_exp_rate < 0 OR online_exp_rate > 10000000);

-- 3) 보상: cap 버그로 exp 잃은 Lv.100+ 캐릭 162명 일괄 paragon_points + 1 (250억 EXP 등가)
--    cap 버그 영향 시점 추정: 8fb47c2 (오프라인 95cap) ~ a58bc7d 약 1~2시간 동안 발생.
--    정확한 손실량 측정 불가 → 일률 1pt 보상이 fair.
UPDATE characters
   SET paragon_points = COALESCE(paragon_points, 0) + 1
 WHERE level >= 100;

\echo === AFTER ===
SELECT COUNT(*) FILTER (WHERE exp < 0)::int AS exp_negative,
       COUNT(*) FILTER (WHERE online_exp_rate < 0)::int AS rate_negative
  FROM characters WHERE level >= 100;

\echo === 보상받은 Lv.100+ 캐릭 갯수 ===
SELECT COUNT(*)::int AS compensated FROM characters WHERE level >= 100;

\echo === paragon_points 분포 (보상 후) ===
SELECT paragon_points, COUNT(*)::int FROM characters WHERE level >= 100
 GROUP BY paragon_points ORDER BY paragon_points;

COMMIT;
