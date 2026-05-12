// 차원의 통행증(item 855) 지급 — 기도/현민준/핑퐁/최종병기화살 각 2장
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const ITEM_ID = 855;
const TARGETS = [
  ['기도', 2],
  ['현민준', 2],
  ['핑퐁', 2],
  ['최종병기화살', 2],
];

(async () => {
  try {
    const it = await pool.query('SELECT id, name FROM items WHERE id = $1', [ITEM_ID]);
    if (!it.rowCount) { console.log(`[fail] item ${ITEM_ID} not found`); return; }
    console.log(`[item] ${ITEM_ID} = ${it.rows[0].name}`);

    for (const [name, qty] of TARGETS) {
      const r = await pool.query(
        'SELECT id, name, COALESCE(inventory_slots_bonus, 0) AS bonus FROM characters WHERE name = $1',
        [name]
      );
      if (!r.rowCount) { console.log(`[skip] NO CHAR ${name}`); continue; }
      if (r.rowCount > 1) {
        console.log(`[skip] DUPLICATE name ${name} (${r.rowCount} rows):`);
        for (const x of r.rows) console.log(`   id=${x.id} name=${x.name}`);
        continue;
      }
      const cid = r.rows[0].id;
      const maxSlots = 300 + Number(r.rows[0].bonus || 0);

      const stack = await pool.query(
        `SELECT id, slot_index, quantity FROM character_inventory
          WHERE character_id = $1 AND item_id = $2
            AND COALESCE(enhance_level, 0) = 0
            AND (prefix_ids IS NULL OR array_length(prefix_ids, 1) IS NULL)
          ORDER BY slot_index LIMIT 1`,
        [cid, ITEM_ID]
      );
      if (stack.rowCount) {
        const before = Number(stack.rows[0].quantity);
        await pool.query(
          'UPDATE character_inventory SET quantity = quantity + $1 WHERE id = $2',
          [qty, stack.rows[0].id]
        );
        console.log(`[stack] ${name} (id=${cid}) slot=${stack.rows[0].slot_index} qty ${before} → ${before + qty} (+${qty})`);
      } else {
        const used = await pool.query(
          'SELECT slot_index FROM character_inventory WHERE character_id = $1', [cid]
        );
        const usedSet = new Set(used.rows.map(x => Number(x.slot_index)));
        let freeSlot = -1;
        for (let i = 0; i < maxSlots; i++) if (!usedSet.has(i)) { freeSlot = i; break; }
        if (freeSlot < 0) { console.log(`[fail] ${name} 인벤토리 가득 참`); continue; }
        await pool.query(
          `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level)
           VALUES ($1, $2, $3, $4, 0)`,
          [cid, ITEM_ID, freeSlot, qty]
        );
        console.log(`[new]   ${name} (id=${cid}) slot=${freeSlot} qty=${qty}`);
      }
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
