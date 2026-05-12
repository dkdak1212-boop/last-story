// 닉네임 '이재명' 캐릭의 인벤토리 + 장착 T4 prefix 아이템 조회
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const chr = await c.query(`SELECT id, name, level, class_name FROM characters WHERE name = '이재명' ORDER BY id`);
    if (chr.rowCount === 0) { console.log('닉네임 "이재명" 캐릭터 없음.'); return; }
    for (const r of chr.rows) console.log(`char id=${r.id} name=${r.name} lv${r.level} class=${r.class_name}`);

    for (const ch of chr.rows) {
      // 인벤
      console.log(`\n=== char ${ch.id} (${ch.name}) 인벤 T4 ===`);
      const inv = await c.query(`
        SELECT ci.slot_index AS sl, i.id AS item_id, i.name AS item_name, i.slot, i.grade,
               ci.enhance_level, ci.quality, ci.quantity, ci.prefix_ids, ci.prefix_stats,
               (SELECT json_agg(json_build_object('id',p.id,'name',p.name,'tier',p.tier,'stat_key',p.stat_key))
                  FROM item_prefixes p WHERE p.id = ANY(ci.prefix_ids)) AS prefixes
          FROM character_inventory ci JOIN items i ON i.id = ci.item_id
         WHERE ci.character_id = $1
           AND EXISTS (SELECT 1 FROM item_prefixes p WHERE p.id = ANY(ci.prefix_ids) AND p.tier = 4)
         ORDER BY ci.slot_index`, [ch.id]);
      if (inv.rowCount === 0) console.log('인벤 T4 없음.');
      for (const row of inv.rows) {
        const enh = row.enhance_level > 0 ? ` +${row.enhance_level}` : '';
        const q = row.quality !== null ? ` Q${row.quality}` : '';
        console.log(`[inv slot ${row.sl}] ${row.item_name}${enh}${q} (${row.grade}, ${row.slot})`);
        for (const p of row.prefixes || []) {
          const val = row.prefix_stats?.[p.stat_key] ?? '?';
          const mk = p.tier === 4 ? ' ★T4' : ` T${p.tier}`;
          console.log(`    -${mk} ${p.name} (${p.stat_key} ${val})`);
        }
      }
      // 장착
      console.log(`\n=== char ${ch.id} (${ch.name}) 장착 T4 ===`);
      const eq = await c.query(`
        SELECT ce.slot AS eqslot, i.id AS item_id, i.name AS item_name, i.grade,
               ce.enhance_level, ce.quality, ce.prefix_ids, ce.prefix_stats,
               (SELECT json_agg(json_build_object('id',p.id,'name',p.name,'tier',p.tier,'stat_key',p.stat_key))
                  FROM item_prefixes p WHERE p.id = ANY(ce.prefix_ids)) AS prefixes
          FROM character_equipped ce JOIN items i ON i.id = ce.item_id
         WHERE ce.character_id = $1
           AND EXISTS (SELECT 1 FROM item_prefixes p WHERE p.id = ANY(ce.prefix_ids) AND p.tier = 4)
         ORDER BY ce.slot`, [ch.id]);
      if (eq.rowCount === 0) console.log('장착 T4 없음.');
      for (const row of eq.rows) {
        const enh = row.enhance_level > 0 ? ` +${row.enhance_level}` : '';
        const q = row.quality !== null ? ` Q${row.quality}` : '';
        console.log(`[eq ${row.eqslot}] ${row.item_name}${enh}${q} (${row.grade})`);
        for (const p of row.prefixes || []) {
          const val = row.prefix_stats?.[p.stat_key] ?? '?';
          const mk = p.tier === 4 ? ' ★T4' : ` T${p.tier}`;
          console.log(`    -${mk} ${p.name} (${p.stat_key} ${val})`);
        }
      }
      console.log(`총 (인벤 ${inv.rowCount} + 장착 ${eq.rowCount}) 건`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
