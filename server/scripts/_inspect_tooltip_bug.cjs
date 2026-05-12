const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 강철의지 거인의 거상의 시공의 반지 — 강화 +15 / 유니크 반지 / 품질 75%
    // 캐릭은 화면에서 안 보이지만 unique L100 reroll 가능 + 강화 +15 는 흔치 않음 → 검색
    const rows = await c.query(
      `SELECT ci.id, ci.character_id, ch.name AS owner, i.name as iname, ci.enhance_level, ci.quality, ci.prefix_ids, ci.prefix_stats, i.unique_prefix_stats, i.stats AS base_stats
         FROM character_inventory ci
         JOIN items i ON i.id = ci.item_id
         JOIN characters ch ON ch.id = ci.character_id
        WHERE i.name LIKE '%시공의 반지%' AND ci.enhance_level = 15
        ORDER BY ci.id LIMIT 5`
    );
    for (const r of rows.rows) {
      console.log(`\n━━━ 인벤 #${r.id} (${r.owner}) ${r.iname} +${r.enhance_level} Q${r.quality} ━━━`);
      console.log(`  prefix_ids: ${JSON.stringify(r.prefix_ids)}`);
      console.log(`  prefix_stats: ${JSON.stringify(r.prefix_stats)}`);
      console.log(`  unique_prefix_stats (item): ${JSON.stringify(r.unique_prefix_stats)}`);
      console.log(`  base item stats: ${JSON.stringify(r.base_stats)}`);
      // 접두사 정의 조회
      if (Array.isArray(r.prefix_ids) && r.prefix_ids.length > 0) {
        const pf = await c.query(`SELECT id, name, tier, stat_key FROM item_prefixes WHERE id = ANY($1::int[]) ORDER BY id`, [r.prefix_ids]);
        for (const p of pf.rows) console.log(`    prefix ${p.id}: ${p.name} T${p.tier} ${p.stat_key}`);
      }
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
