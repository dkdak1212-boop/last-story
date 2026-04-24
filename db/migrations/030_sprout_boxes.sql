-- 차원새싹상자 (신규 캐릭터 지원) — Lv.1/10/30/50/70/90 마일스톤 상자 6종
-- 상자 + 내용물 모두 soulbound (거래불가)
-- 내용물: 레벨별 장비 풀세트 (무기 + 방어구 + 악세) · 접두사 3옵 T1~T2 랜덤
SET client_encoding TO 'UTF8';
BEGIN;

-- 상자 아이템 6종 (id 846~851)
INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price, required_level, unique_prefix_stats)
VALUES
  (846, '차원새싹상자 (Lv.1)',  'consumable', 'epic',      NULL, NULL,
    '개봉 시 Lv.1 클래스 무기 1개 + 방어구 5종 + 골드 500,000 획득. 장비는 접두사 3옵(T1~T2) 랜덤. 전부 계정 귀속.',
    99, 0, 1, NULL),
  (847, '차원새싹상자 (Lv.10)', 'consumable', 'epic',      NULL, NULL,
    '개봉 시 Lv.10 클래스 무기 1개 + 방어구 5종 + 골드 1,000,000 획득. 장비는 접두사 3옵(T1~T2) 랜덤. 전부 계정 귀속.',
    99, 0, 1, NULL),
  (848, '차원새싹상자 (Lv.30)', 'consumable', 'legendary', NULL, NULL,
    '개봉 시 Lv.30 클래스 무기+방어구 풀세트 + Lv.35 유니크 3종 + 골드 3,000,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
    99, 0, 1, NULL),
  (849, '차원새싹상자 (Lv.50)', 'consumable', 'legendary', NULL, NULL,
    '개봉 시 Lv.50 클래스 무기+방어구 풀세트 + Lv.55 유니크 3종 + 골드 5,000,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
    99, 0, 1, NULL),
  (850, '차원새싹상자 (Lv.70)', 'consumable', 'legendary', NULL, NULL,
    '개봉 시 Lv.70 레전더리 무기+방어구 풀세트 + Lv.75 유니크 3종 + 골드 10,000,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
    99, 0, 1, NULL),
  (851, '차원새싹상자 (Lv.90)', 'consumable', 'legendary', NULL, NULL,
    '개봉 시 Lv.90 레전더리 무기+방어구 풀세트 + Lv.95 유니크 3종 + 골드 20,000,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
    99, 0, 1, NULL)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, grade = EXCLUDED.grade, type = EXCLUDED.type, stack_size = EXCLUDED.stack_size;

-- 이미 지급한 박스 레벨을 추적 (중복 발송 방지) — 배열 형태로 [1,10,30,...]
ALTER TABLE characters ADD COLUMN IF NOT EXISTS sprout_boxes_sent INTEGER[] NOT NULL DEFAULT '{}';

COMMIT;
