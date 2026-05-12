const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='skills' ORDER BY ordinal_position`);
    for (const r of cols.rows) console.log(`  ${r.column_name} : ${r.data_type}`);
    const ids = await c.query(`SELECT MAX(id) AS maxid FROM skills`);
    console.log(`\n현재 max id: ${ids.rows[0].maxid}`);
    const archer = await c.query(`SELECT COUNT(*) AS cnt FROM skills WHERE class_name='archer'`);
    console.log(`기존 archer 스킬 수: ${archer.rows[0].cnt}`);
    const sample = await c.query(`SELECT id, name, kind, damage_mult, cooldown_actions, effect_type, effect_value FROM skills WHERE class_name='rogue' ORDER BY required_level LIMIT 5`);
    console.log('\nrogue 샘플:');
    for (const r of sample.rows) console.log(`  ${r.id} ${r.name} k=${r.kind} mult=${r.damage_mult} cd=${r.cooldown_actions} eff=${r.effect_type}=${r.effect_value}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
