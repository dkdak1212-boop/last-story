// 차원 파편(852) / 시공의 정수(853) / 균열의 핵(854) 인벤 낱개 합치기
// 같은 char × item 의 여러 slot 을 가장 작은 slot_index 에 합산 + 나머지 DELETE
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });

const ITEM_IDS = [852, 853, 854];

(async () => {
  await c.connect();

  // 사전 점검 — 합쳐질 후보 개수
  const before = await c.query(`
    SELECT character_id, item_id, COUNT(*)::int AS slot_count, SUM(quantity)::int AS total_qty
      FROM character_inventory
     WHERE item_id = ANY($1::int[])
     GROUP BY character_id, item_id
    HAVING COUNT(*) > 1
     ORDER BY character_id, item_id
  `, [ITEM_IDS]);
  console.log(`합쳐질 그룹: ${before.rows.length}개 (char×item)`);
  if (before.rows.length > 0) {
    console.log('샘플 5개:', before.rows.slice(0, 5));
  }
  if (before.rows.length === 0) {
    console.log('합칠 게 없음. 종료.');
    await c.end();
    return;
  }

  await c.query('BEGIN');
  try {
    // 1) 유지할 row (가장 작은 slot_index) 의 quantity 를 그룹 합으로 UPDATE
    const upd = await c.query(`
      UPDATE character_inventory ci
         SET quantity = sub.total_qty
        FROM (
          SELECT character_id, item_id,
                 MIN(slot_index) AS min_slot,
                 SUM(quantity)::int AS total_qty
            FROM character_inventory
           WHERE item_id = ANY($1::int[])
           GROUP BY character_id, item_id
          HAVING COUNT(*) > 1
        ) sub
       WHERE ci.character_id = sub.character_id
         AND ci.item_id = sub.item_id
         AND ci.slot_index = sub.min_slot
    `, [ITEM_IDS]);
    console.log(`UPDATE: ${upd.rowCount} 행 (대표 슬롯 합산)`);

    // 2) 같은 char × item 의 나머지 slot DELETE (min_slot 이 아닌 것)
    const del = await c.query(`
      DELETE FROM character_inventory ci
       USING (
         SELECT character_id, item_id, MIN(slot_index) AS min_slot
           FROM character_inventory
          WHERE item_id = ANY($1::int[])
          GROUP BY character_id, item_id
         HAVING COUNT(*) > 1
       ) sub
       WHERE ci.character_id = sub.character_id
         AND ci.item_id = sub.item_id
         AND ci.slot_index <> sub.min_slot
    `, [ITEM_IDS]);
    console.log(`DELETE: ${del.rowCount} 행 (중복 슬롯 제거)`);

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  // 사후 검증
  const after = await c.query(`
    SELECT character_id, item_id, COUNT(*)::int AS slot_count, SUM(quantity)::int AS total_qty
      FROM character_inventory
     WHERE item_id = ANY($1::int[])
     GROUP BY character_id, item_id
    HAVING COUNT(*) > 1
  `, [ITEM_IDS]);
  console.log(`잔여 중복 그룹: ${after.rows.length} (0이어야 정상)`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
