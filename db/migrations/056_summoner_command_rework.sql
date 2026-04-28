-- 소환사 지휘(160) → 모든 소환수 공격 (2026-04-28)
-- 기존: 소환수 데미지 +40% 6행동 (buff 형) · 쿨 5
-- 변경: 모든 소환수 일제 공격 (damage 형) · 25% 확률로 2회 발동 · 쿨 1행동
-- effect_value=25 는 더블 발동 확률(%) 로 사용 (engine.ts case 'summon_all' 확장)

UPDATE skills
   SET name = '모든 소환수 공격',
       kind = 'damage',
       effect_type = 'summon_all',
       effect_value = 25,
       effect_duration = 0,
       damage_mult = 0,
       cooldown_actions = 1,
       description = '모든 소환수 일제 공격 — 25% 확률로 2회 발동 · 쿨 1행동'
 WHERE id = 160;
