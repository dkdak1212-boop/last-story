const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const CHAR_IDS = [775, 421, 818, 164, 2208, 238, 33, 46]; // 뱅적,혈향,번뇌,분노,소한사,로얄,성직자,명성
const ITEMS = [
  { id: 911, label: 'T3 접두사 추첨권' },
  { id: 841, label: '3옵 보장 굴림권' },
  { id: 476, label: '품질 재굴림권' },
];

async function findFreeSlot(c, charId) {
  const used = await c.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1 ORDER BY slot_index`, [charId]);
  const set = new Set(used.rows.map(r => r.slot_index));
  for (let i = 0; i < 200; i++) if (!set.has(i)) return i;
  return -1;
}

async function grantVoucher(c, charId, itemId) {
  // 같은 itemId·동일 enhance/prefix/quality 가 있고 stackable 하면 stack +1
  const stack = await c.query(`SELECT stack_size FROM items WHERE id = $1`, [itemId]);
  const stackSize = stack.rows[0]?.stack_size || 1;
  if (stackSize > 1) {
    const existing = await c.query(
      `SELECT id, quantity FROM character_inventory
        WHERE character_id = $1 AND item_id = $2
          AND enhance_level = 0 AND COALESCE(array_length(prefix_ids, 1), 0) = 0 AND quality = 0
          AND quantity < $3
        ORDER BY slot_index LIMIT 1`,
      [charId, itemId, stackSize]
    );
    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      await c.query(`UPDATE character_inventory SET quantity = quantity + 1 WHERE id = $1`, [row.id]);
      return { stacked: true, slotId: row.id, newQty: row.quantity + 1 };
    }
  }
  const slot = await findFreeSlot(c, charId);
  if (slot < 0) throw new Error('인벤 가득');
  const ins = await c.query(
    `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, locked, quality, soulbound, enhance_pity, unidentified)
       VALUES ($1, $2, $3, 1, 0, '{}'::int[], '{}'::jsonb, false, 0, false, 0, false) RETURNING id`,
    [charId, itemId, slot]
  );
  return { stacked: false, slotId: ins.rows[0].id, slot };
}

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    console.log('━━━ 8 캐릭 × 3 아이템 = 24개 지급 ━━━');
    for (const cid of CHAR_IDS) {
      const ch = await c.query('SELECT name FROM characters WHERE id = $1', [cid]);
      const cname = ch.rows[0]?.name || `#${cid}`;
      for (const it of ITEMS) {
        try {
          const r = await grantVoucher(c, cid, it.id);
          const tag = r.stacked ? `stack→${r.newQty}` : `slot ${r.slot}`;
          console.log(`  ✓ ${cname} (#${cid}) ← ${it.label}  [${tag}]`);
        } catch (e) {
          console.log(`  ✗ ${cname} (#${cid}) ${it.label}: ${e.message.slice(0,80)}`);
        }
      }
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
