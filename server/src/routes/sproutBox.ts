// 차원새싹상자 (신규 유저 지원 상자) — Lv.1/10/30/50/70/90 마일스톤 상자
// 상자 자체 + 내용물 모두 soulbound=TRUE (거래불가)
// 내용물: 레벨별 common 장비 풀세트 + (Lv.30+) 인접 레벨 유니크 풀세트 + 골드
// 장비 품질: 75 고정 · 접두사: 3옵 T1~T2 랜덤
import { Router, type Response } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { generate3PrefixesT1T2 } from '../game/prefix.js';
import { deliverToMailbox } from '../game/inventory.js';

const router = Router();
router.use(authRequired);

export const BOX_LEVELS = [1, 10, 30, 50, 70, 90] as const;
export type BoxLevel = typeof BOX_LEVELS[number];

export const BOX_ITEM_IDS: Record<BoxLevel, number> = {
  1: 846, 10: 847, 30: 848, 50: 849, 70: 850, 90: 851,
};

interface BoxConfig { commonLv: number; uniqueLv: number | null; gold: number; }
const BOX_CONFIG: Record<BoxLevel, BoxConfig> = {
  1:  { commonLv: 1,  uniqueLv: null, gold:    500_000 },
  10: { commonLv: 10, uniqueLv: null, gold:  1_000_000 },
  30: { commonLv: 30, uniqueLv: 35,   gold:  3_000_000 },
  50: { commonLv: 50, uniqueLv: 55,   gold:  5_000_000 },
  70: { commonLv: 70, uniqueLv: 75,   gold: 10_000_000 },
  90: { commonLv: 90, uniqueLv: 95,   gold: 20_000_000 },
};

const QUALITY_FIXED = 75;
const ARMOR_SLOTS = ['helm', 'chest', 'boots', 'ring', 'amulet'] as const;
const BOX_ITEM_SET = new Set<number>(Object.values(BOX_ITEM_IDS));

export function isSproutBoxItem(id: number) { return BOX_ITEM_SET.has(id); }

// 장비 아이템을 캐릭 인벤에 삽입 (품질 75, 3옵 T1~T2, soulbound). 자리 없으면 우편 발송.
// 유니크 아이템의 경우 고정 옵션(unique_prefix_stats)을 prefix_stats 에 병합한다
// — inventory.ts 의 드롭 경로와 동일 규칙.
async function grantEquipmentBound(characterId: number, itemId: number): Promise<'inv' | 'mail'> {
  const itemR = await query<{ required_level: number; grade: string; unique_prefix_stats: Record<string, number> | null }>(
    `SELECT COALESCE(required_level,1) AS required_level, grade, unique_prefix_stats FROM items WHERE id = $1`,
    [itemId]
  );
  const itemLv = itemR.rows[0]?.required_level ?? 1;
  const itemGrade = itemR.rows[0]?.grade ?? 'common';
  const uniqueFixed = itemR.rows[0]?.unique_prefix_stats ?? null;
  const { prefixIds, bonusStats } = await generate3PrefixesT1T2(itemLv);

  // 유니크는 고정 옵션 + 랜덤 롤 합산
  let finalPrefixStats: Record<string, number> = { ...bonusStats };
  if (itemGrade === 'unique' && uniqueFixed) {
    finalPrefixStats = { ...uniqueFixed };
    for (const [k, v] of Object.entries(bonusStats)) {
      finalPrefixStats[k] = (finalPrefixStats[k] || 0) + v;
    }
  }

  const usedR = await query<{ slot_index: number }>('SELECT slot_index FROM character_inventory WHERE character_id = $1', [characterId]);
  const used = new Set<number>(usedR.rows.map(r => r.slot_index));
  let freeSlot = -1;
  for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }

  if (freeSlot < 0) {
    await deliverToMailbox(
      characterId,
      '차원새싹상자 내용물 (인벤토리 가득)',
      '인벤토리가 가득 차 우편으로 지급되었습니다. 우편 수령 시 계정 귀속됩니다.',
      itemId, 1, 0,
      { enhanceLevel: 0, prefixIds, prefixStats: finalPrefixStats, quality: QUALITY_FIXED }
    );
    return 'mail';
  }

  await query(
    `INSERT INTO character_inventory
       (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality, soulbound)
     VALUES ($1, $2, $3, 1, 0, $4, $5::jsonb, $6, TRUE)`,
    [characterId, itemId, freeSlot, prefixIds, JSON.stringify(finalPrefixStats), QUALITY_FIXED]
  );
  return 'inv';
}

// 박스 개봉 — 내용물 즉시 지급
async function openSproutBox(characterId: number, boxLevel: BoxLevel) {
  const cfg = BOX_CONFIG[boxLevel];
  const charR = await query<{ class_name: string }>('SELECT class_name FROM characters WHERE id = $1', [characterId]);
  if (!charR.rowCount) throw new Error('character not found');
  const cls = charR.rows[0].class_name;

  const itemsToGrant: number[] = [];

  // 1. 클래스 전용 common 무기
  const wR = await query<{ id: number }>(
    `SELECT id FROM items
      WHERE slot='weapon' AND grade='common' AND required_level=$1
        AND (class_restriction = $2 OR class_restriction IS NULL)
      ORDER BY RANDOM() LIMIT 1`,
    [cfg.commonLv, cls]
  );
  if (wR.rowCount) itemsToGrant.push(wR.rows[0].id);

  // 2. common 방어구/악세 5종
  for (const slot of ARMOR_SLOTS) {
    const aR = await query<{ id: number }>(
      `SELECT id FROM items WHERE slot=$1 AND grade='common' AND required_level=$2 LIMIT 1`,
      [slot, cfg.commonLv]
    );
    if (aR.rowCount) itemsToGrant.push(aR.rows[0].id);
  }

  // 3. (Lv.30+) 유니크 3종 (클래스락 또는 공용 모두 포함, 무기는 거의 없음)
  if (cfg.uniqueLv != null) {
    const uR = await query<{ id: number }>(
      `SELECT id FROM items
        WHERE grade='unique' AND required_level=$1
          AND (class_restriction = $2 OR class_restriction IS NULL)`,
      [cfg.uniqueLv, cls]
    );
    for (const row of uR.rows) itemsToGrant.push(row.id);
  }

  let invCount = 0, mailCount = 0;
  const granted: { itemId: number }[] = [];
  for (const id of itemsToGrant) {
    const res = await grantEquipmentBound(characterId, id);
    if (res === 'inv') invCount++; else mailCount++;
    granted.push({ itemId: id });
  }

  // 4. 골드
  await query('UPDATE characters SET gold = gold + $1 WHERE id = $2', [cfg.gold, characterId]);

  return { gold: cfg.gold, items: granted, invCount, mailCount };
}

// POST /sprout-box/open/:characterId { boxLevel }
router.post('/open/:characterId', async (req: AuthedRequest, res: Response) => {
  const characterId = Number(req.params.characterId);
  const ownR = await query<{ id: number }>('SELECT id FROM characters WHERE id = $1 AND user_id = $2', [characterId, req.userId!]);
  if (!ownR.rowCount) return res.status(404).json({ error: 'character not found' });

  const boxLevel = Number((req.body as { boxLevel?: number })?.boxLevel);
  if (!BOX_LEVELS.includes(boxLevel as BoxLevel)) return res.status(400).json({ error: 'invalid boxLevel' });
  const lv = boxLevel as BoxLevel;

  const itemId = BOX_ITEM_IDS[lv];
  const boxR = await query<{ id: number; quantity: number }>(
    `SELECT id, quantity FROM character_inventory
      WHERE character_id = $1 AND item_id = $2 AND quantity > 0
      ORDER BY slot_index LIMIT 1`,
    [characterId, itemId]
  );
  if (boxR.rowCount === 0) return res.status(400).json({ error: '해당 상자를 보유하고 있지 않습니다.' });

  const reward = await openSproutBox(characterId, lv);

  const stack = boxR.rows[0];
  if (stack.quantity <= 1) {
    await query('DELETE FROM character_inventory WHERE id = $1', [stack.id]);
  } else {
    await query('UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1', [stack.id]);
  }

  res.json({ ok: true, reward });
});

// 공용 유틸 — 레벨업 훅 / 캐릭 생성 훅에서 호출
export async function sendSproutBoxMail(characterId: number, boxLevel: BoxLevel) {
  const alR = await query<{ sprout_boxes_sent: number[] | null }>('SELECT sprout_boxes_sent FROM characters WHERE id = $1', [characterId]);
  if (!alR.rowCount) return;
  const sent = alR.rows[0].sprout_boxes_sent || [];
  if (sent.includes(boxLevel)) return; // 중복 방지

  const itemId = BOX_ITEM_IDS[boxLevel];
  await deliverToMailbox(
    characterId,
    `차원새싹상자 (Lv.${boxLevel})`,
    `Lv.${boxLevel} 달성! 차원새싹상자를 수령하고 인벤토리에서 개봉하세요. (상자·내용물 모두 계정 귀속)`,
    itemId, 1, 0
  );

  await query('UPDATE characters SET sprout_boxes_sent = array_append(sprout_boxes_sent, $1) WHERE id = $2', [boxLevel, characterId]);
}

// 레벨 상승 체크 — oldLevel < L <= newLevel 인 마일스톤에 대해 상자 발송
export async function checkSproutMilestones(characterId: number, oldLevel: number, newLevel: number) {
  for (const lv of BOX_LEVELS) {
    if (oldLevel < lv && newLevel >= lv) {
      await sendSproutBoxMail(characterId, lv).catch(e => console.error('[sprout-box] mail fail', e));
    }
  }
}

export default router;
