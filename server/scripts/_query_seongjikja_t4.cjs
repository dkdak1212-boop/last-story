// 닉네임 '성직자' 캐릭의 인벤토리 T4 prefix 아이템 조회
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 1) 캐릭 찾기
    const chr = await c.query(`SELECT id, name, level, class_name FROM characters WHERE name = '성직자' ORDER BY id`);
    if (chr.rowCount === 0) {
      console.log('닉네임 "성직자" 캐릭터 없음.');
      return;
    }
    for (const r of chr.rows) console.log(`char id=${r.id} name=${r.name} lv${r.level} class=${r.class_name}`);

    for (const ch of chr.rows) {
      console.log(`\n=== char ${ch.id} (${ch.name}) 인벤 T4 ===`);
      const sql = `
        SELECT ci.slot_index,
               i.id AS item_id, i.name AS item_name, i.slot, i.grade,
               ci.enhance_level, ci.quality, ci.quantity,
               ci.prefix_ids, ci.prefix_stats,
               (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'tier', p.tier, 'stat_key', p.stat_key))
                  FROM item_prefixes p WHERE p.id = ANY(ci.prefix_ids)) AS prefixes
          FROM character_inventory ci
          JOIN items i ON i.id = ci.item_id
         WHERE ci.character_id = $1
           AND EXISTS (SELECT 1 FROM item_prefixes p WHERE p.id = ANY(ci.prefix_ids) AND p.tier = 4)
         ORDER BY ci.slot_index
      `;
      const r = await c.query(sql, [ch.id]);
      if (r.rowCount === 0) {
        console.log('T4 인벤 아이템 없음.');
        continue;
      }
      for (const row of r.rows) {
        const enh = row.enhance_level > 0 ? ` +${row.enhance_level}` : '';
        const q = row.quality !== null ? ` Q${row.quality}` : '';
        console.log(`[slot ${row.slot_index}] ${row.item_name}${enh}${q} (${row.grade}, ${row.slot})`);
        for (const p of row.prefixes || []) {
          const val = row.prefix_stats?.[p.stat_key] ?? '?';
          const tierMark = p.tier === 4 ? ' ★T4' : ` T${p.tier}`;
          console.log(`    -${tierMark} ${p.name} (${p.stat_key} ${val})`);
        }
      }
      console.log(`총 ${r.rowCount} 건`);
    }
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
