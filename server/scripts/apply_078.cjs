const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/078_summoner_wolf_flat_damage.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const before = await c.query(`SELECT id, name, flat_damage FROM skills WHERE class_name='summoner' AND name='늑대 소환'`);
  console.log('before:', before.rows[0]);
  await c.query(sql);
  const after = await c.query(`SELECT id, name, flat_damage FROM skills WHERE class_name='summoner' AND name='늑대 소환'`);
  console.log('after:', after.rows[0]);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
