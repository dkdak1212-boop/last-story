// 코지션에게 균열의 핵 100개 지급
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const item = await c.query(`SELECT id, name FROM items WHERE name LIKE '%균열의 핵%' OR name LIKE '%차원의 핵%' OR name LIKE '%리프트 코어%'`);
    console.log('matching items:');
    for (const r of item.rows) console.log(' ', r.id, r.name);
    if (item.rows.length === 0) {
      const fb = await c.query(`SELECT id, name FROM items WHERE name LIKE '%핵%' OR name LIKE '%균열%' ORDER BY id`);
      console.log('fallback (any 핵/균열):');
      for (const r of fb.rows) console.log(' ', r.id, r.name);
      return;
    }
    const itemId = item.rows[0].id;
    const itemName = item.rows[0].name;

    const ch = await c.query(`SELECT id, name, user_id FROM characters WHERE name = $1`, ['코지션']);
    if (ch.rows.length === 0) { console.log('character 코지션 not found'); return; }
    const charId = ch.rows[0].id;
    console.log(`character 코지션 id=${charId}`);

    // grant 100 to character_inventory (stackable)
    const existing = await c.query(
      `SELECT id, quantity FROM character_inventory
       WHERE character_id=$1 AND item_id=$2 AND COALESCE(enhance_level,0)=0 AND COALESCE(quality,0)=0
       ORDER BY id ASC LIMIT 1`,
      [charId, itemId]
    );
    if (existing.rows.length > 0) {
      await c.query(`UPDATE character_inventory SET quantity = quantity + 100 WHERE id=$1`, [existing.rows[0].id]);
      console.log(`updated inv id=${existing.rows[0].id}: qty ${existing.rows[0].quantity} -> ${existing.rows[0].quantity + 100}`);
    } else {
      // find first free slot_index
      const slots = await c.query(`SELECT COALESCE(MAX(slot_index), -1) AS m FROM character_inventory WHERE character_id=$1`, [charId]);
      const slotIdx = (slots.rows[0].m || -1) + 1;
      const ins = await c.query(
        `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, quality)
         VALUES ($1, $2, $3, 100, 0, 0) RETURNING id`,
        [charId, itemId, slotIdx]
      );
      console.log(`inserted new inv id=${ins.rows[0].id} slot=${slotIdx} (item=${itemName} qty=100)`);
    }
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
