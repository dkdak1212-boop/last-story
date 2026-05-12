const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 종언 보스 508~517 검사
    const r = await c.query(`SELECT id, name, max_hp, stats FROM monsters WHERE id BETWEEN 508 AND 517 ORDER BY id`);
    console.log('=== 종언의 기둥 보스 (508~517) ===');
    for (const row of r.rows) {
      const s = row.stats || {};
      console.log(`#${row.id} ${row.name}`);
      console.log(`  HP=${row.max_hp}, str=${s.str}, int=${s.int}, def=${s.def}, mdef=${s.mdef}, dr_pct=${s.dr_pct}, matk_based=${s.matk_based}, lifesteal_immune=${s.lifesteal_immune}, cc_immune=${s.cc_immune}`);
    }
    // 일반 (503~507) 비교
    const r2 = await c.query(`SELECT id, name, max_hp, stats FROM monsters WHERE id BETWEEN 503 AND 507 ORDER BY id`);
    console.log('\n=== 종언 일반 (503~507) ===');
    for (const row of r2.rows) {
      const s = row.stats || {};
      console.log(`#${row.id} ${row.name} HP=${row.max_hp} str=${s.str} int=${s.int} def=${s.def} mdef=${s.mdef} dr_pct=${s.dr_pct ?? 0}`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
