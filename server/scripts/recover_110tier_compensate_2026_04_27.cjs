// 110제 시공 분쇄 (id 900~909) 전부 회수 + 회수당한 character 에게 보상.
// 보상: 유니크 무작위 추첨권(477) ×2 + 품질 재굴림권(476) ×1
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const REWARD_TICKET = 477;   // 유니크 무작위 추첨권
const REWARD_REROLL = 476;   // 품질 재굴림권
const TICKET_QTY = 2;
const REROLL_QTY = 1;

async function addStackable(client, charId, itemId, qty) {
  // 동일 itemId 의 비장비 stack 이 있으면 quantity 증가, 없으면 가장 작은 빈 slot_index 에 INSERT.
  const existing = await client.query(
    `SELECT id, quantity FROM character_inventory
      WHERE character_id = $1 AND item_id = $2 AND prefix_ids IS NULL
      ORDER BY slot_index LIMIT 1`,
    [charId, itemId]
  );
  if (existing.rowCount > 0) {
    await client.query(
      `UPDATE character_inventory SET quantity = quantity + $1 WHERE id = $2`,
      [qty, existing.rows[0].id]
    );
    return { mode: 'stack', after: existing.rows[0].quantity + qty };
  }
  // 빈 slot 찾기 — 사용 중인 slot_index 의 gap 또는 max+1
  const slotR = await client.query(
    `SELECT COALESCE(MIN(s.idx), 0) AS slot
       FROM generate_series(0, 999) AS s(idx)
       LEFT JOIN character_inventory ci ON ci.character_id = $1 AND ci.slot_index = s.idx
      WHERE ci.id IS NULL`,
    [charId]
  );
  const slot = slotR.rows[0].slot;
  await client.query(
    `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, locked, soulbound)
     VALUES ($1, $2, $3, $4, FALSE, FALSE)`,
    [charId, itemId, slot, qty]
  );
  return { mode: 'new', slot, after: qty };
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 회수 대상 character 수집
    const invHolders = await client.query(
      `SELECT DISTINCT character_id FROM character_inventory
        WHERE item_id BETWEEN 900 AND 909`
    );
    const eqHolders = await client.query(
      `SELECT DISTINCT character_id FROM character_equipped
        WHERE item_id BETWEEN 900 AND 909`
    );
    const targetIds = new Set([
      ...invHolders.rows.map(r => r.character_id),
      ...eqHolders.rows.map(r => r.character_id),
    ]);
    console.log('회수 대상 character:', [...targetIds]);

    // 2) 회수 (DELETE)
    const delInv = await client.query(
      `DELETE FROM character_inventory WHERE item_id BETWEEN 900 AND 909 RETURNING character_id, item_id, quantity`
    );
    console.log(`  inventory 회수: ${delInv.rowCount} 행`);
    for (const r of delInv.rows) console.log(`    char ${r.character_id} item ${r.item_id} ×${r.quantity}`);

    const delEq = await client.query(
      `DELETE FROM character_equipped WHERE item_id BETWEEN 900 AND 909 RETURNING character_id, slot, item_id`
    );
    console.log(`  equipped 회수: ${delEq.rowCount} 행`);
    for (const r of delEq.rows) console.log(`    char ${r.character_id} slot=${r.slot} item ${r.item_id}`);

    // 3) 보상 지급
    for (const charId of targetIds) {
      const charR = await client.query(
        `SELECT name FROM characters WHERE id = $1`, [charId]
      );
      const name = charR.rows[0]?.name || `?`;
      const t1 = await addStackable(client, charId, REWARD_TICKET, TICKET_QTY);
      const t2 = await addStackable(client, charId, REWARD_REROLL, REROLL_QTY);
      console.log(`[보상] ${name} (id=${charId}): 추첨권 +${TICKET_QTY} (${t1.mode}, after=${t1.after}), 재굴림권 +${REROLL_QTY} (${t2.mode}, after=${t2.after})`);
    }

    await client.query('COMMIT');
    console.log('\n=== 완료 ===');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK:', e);
    process.exit(1);
  } finally {
    client.release();
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
