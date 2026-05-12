// 차원의 통행증(item 855) 2장씩 지급 — 돚거지 / 내꺼야 / 난도적이야
// 인벤토리에 stack 가능 — 동일 item_id 슬롯 있으면 quantity += 2, 없으면 빈 슬롯에 INSERT.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const TARGETS = ['돚거지', '내꺼야', '난도적이야'];
const ITEM_ID = 855; // 차원의 통행증
const QTY = 2;

(async () => {
  try {
    // 아이템 정보 확인
    const it = await pool.query('SELECT id, name FROM items WHERE id = $1', [ITEM_ID]);
    if (!it.rowCount) { console.log(`[fail] item ${ITEM_ID} not found`); return; }
    console.log(`[item] ${ITEM_ID} = ${it.rows[0].name}`);

    for (const name of TARGETS) {
      const r = await pool.query(
        'SELECT id, name, COALESCE(inventory_slots_bonus, 0) AS bonus FROM characters WHERE name = $1',
        [name]
      );
      if (!r.rowCount) { console.log(`[skip] NO CHAR ${name}`); continue; }
      const cid = r.rows[0].id;
      const maxSlots = 300 + Number(r.rows[0].bonus || 0);

      // stack 가능 — 동일 item_id 슬롯 찾기
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
          [QTY, stack.rows[0].id]
        );
        console.log(`[stack] ${name} (id=${cid}) slot=${stack.rows[0].slot_index} qty ${before} → ${before + QTY}`);
      } else {
        // 빈 슬롯 찾기
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
          [cid, ITEM_ID, freeSlot, QTY]
        );
        console.log(`[new]   ${name} (id=${cid}) slot=${freeSlot} qty=${QTY}`);
      }
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
