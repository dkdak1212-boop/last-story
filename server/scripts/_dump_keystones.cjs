const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, description, tier, effects FROM node_definitions WHERE zone = 'paragon' ORDER BY id`);
    console.log(`총 ${r.rowCount} paragon 노드`);
    // tier 별 분포
    const byTier = {};
    for (const row of r.rows) byTier[row.tier] = (byTier[row.tier]||0) + 1;
    console.log('tier 분포:', byTier);
    // keystone 만
    const ks = r.rows.filter(x => x.tier === 'keystone');
    console.log(`\nkeystone ${ks.length}개:`);
    for (const row of ks) {
      console.log(`#${row.id} ${row.name}: ${row.description}`);
      console.log(`  effects: ${JSON.stringify(row.effects)}`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
