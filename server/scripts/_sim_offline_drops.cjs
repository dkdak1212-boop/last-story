// sampleDropsFromField 알고리즘 격리 시뮬레이션 (필드 19, killsInc=10000, dropMult=1.5)
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
const DROP_RATE_MULT = 0.1;

(async () => {
  await c.connect();

  const fr = await c.query(`SELECT monster_pool FROM fields WHERE id = 19`);
  const monsterIds = fr.rows[0].monster_pool;
  const mr = await c.query(`SELECT id, drop_table FROM monsters WHERE id = ANY($1::int[])`, [monsterIds]);
  const monsters = mr.rows.map(r => ({ id: r.id, drop_table: r.drop_table || [] }));

  const ur = await c.query(`SELECT id FROM items WHERE grade = 'unique'`);
  const uniques = new Set(ur.rows.map(r => r.id));

  const itemNames = {};
  const allItemIds = new Set();
  for (const m of monsters) for (const d of m.drop_table) allItemIds.add(d.itemId);
  const itr = await c.query(`SELECT id, name FROM items WHERE id = ANY($1::int[])`, [[...allItemIds]]);
  for (const r of itr.rows) itemNames[r.id] = r.name;

  // 시뮬: 10000 kills × dropMult=1.5 (드랍부스트 active 가정)
  const killsInc = 10000;
  const dropMult = 1.5;
  const out = new Map();
  for (let i = 0; i < killsInc; i++) {
    const m = monsters[Math.floor(Math.random() * monsters.length)];
    for (const d of m.drop_table) {
      const isUnique = uniques.has(d.itemId);
      const rateMult = isUnique ? 1.0 : DROP_RATE_MULT;
      const prob = Math.min(1, d.chance * rateMult * dropMult);
      if (Math.random() < prob) {
        const qty = d.minQty + Math.floor(Math.random() * (d.maxQty - d.minQty + 1));
        if (qty > 0) out.set(d.itemId, (out.get(d.itemId) ?? 0) + qty);
      }
    }
  }

  const sorted = [...out.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`=== 시뮬 결과 (필드 19, ${killsInc} kills, dropMult=${dropMult}) ===`);
  for (const [id, qty] of sorted) {
    console.log(`  ${id} (${itemNames[id]}): ${qty}`);
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
