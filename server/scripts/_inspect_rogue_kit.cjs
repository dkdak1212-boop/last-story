const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const nodes = await c.query(`SELECT name, zone, tier, class_exclusive, effects, description FROM node_definitions WHERE class_exclusive='rogue' OR (effects::text ILIKE '%poison%' OR effects::text ILIKE '%bleed%' OR effects::text ILIKE '%dot%' OR effects::text ILIKE '%assassin%' OR effects::text ILIKE '%combo%') ORDER BY zone, tier, name`);
    console.log(`총 ${nodes.rowCount}개\n`);
    for (const r of nodes.rows) {
      const cls = r.class_exclusive || 'all';
      const eff = JSON.stringify(r.effects);
      console.log(`[${cls}] ${r.zone || '-'}/T${r.tier} ${r.name}`);
      console.log(`  ${eff.slice(0,200)}`);
      if (r.description) console.log(`  desc: ${r.description.slice(0,160)}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
