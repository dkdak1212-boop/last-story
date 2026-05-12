const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const RIFT_CORE_ID = 854;
const QTY = 100;
const NAMES = ['도신'];

(async () => {
  try {
    const itemR = await pool.query(`SELECT id, name, stack_size FROM items WHERE id = $1`, [RIFT_CORE_ID]);
    if (itemR.rowCount === 0) { console.error('item 854 없음'); process.exit(1); }
    const maxStack = itemR.rows[0].stack_size || 999;
    console.log(`아이템: ${itemR.rows[0].name} (id=${RIFT_CORE_ID}), stack_size=${maxStack}`);

    for (const name of NAMES) {
      const charR = await pool.query(`SELECT id, name FROM characters WHERE name = $1`, [name]);
      if (charR.rowCount === 0) { console.log(`[skip] ${name}: 캐릭터 없음`); continue; }
      const charId = charR.rows[0].id;

      let remaining = QTY;

      const stackR = await pool.query(
        `SELECT id, slot_index, quantity FROM character_inventory
          WHERE character_id = $1 AND item_id = $2 AND COALESCE(soulbound,FALSE)=FALSE AND COALESCE(unidentified,FALSE)=FALSE
          ORDER BY slot_index`,
        [charId, RIFT_CORE_ID]
      );
      for (const row of stackR.rows) {
        if (remaining <= 0) break;
        const room = maxStack - Number(row.quantity);
        if (room <= 0) continue;
        const add = Math.min(room, remaining);
        await pool.query(`UPDATE character_inventory SET quantity = quantity + $1 WHERE id = $2`, [add, row.id]);
        console.log(`[merge] ${name} slot=${row.slot_index} +${add} (이전 ${row.quantity}→${Number(row.quantity)+add})`);
        remaining -= add;
      }

      while (remaining > 0) {
        const usedR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1`, [charId]);
        const used = new Set(usedR.rows.map(r => r.slot_index));
        let freeSlot = -1;
        for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
        if (freeSlot < 0) { console.log(`[FAIL] ${name}: 인벤토리 가득 — 남은 ${remaining}개 미지급`); break; }
        const add = Math.min(maxStack, remaining);
        await pool.query(
          `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, $4)`,
          [charId, RIFT_CORE_ID, freeSlot, add]
        );
        console.log(`[new] ${name} slot=${freeSlot} +${add}`);
        remaining -= add;
      }

      const sumR = await pool.query(
        `SELECT COALESCE(SUM(quantity),0) AS total FROM character_inventory WHERE character_id = $1 AND item_id = $2`,
        [charId, RIFT_CORE_ID]
      );
      console.log(`[after] ${name} 총 보유 ${sumR.rows[0].total}`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
