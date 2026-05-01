const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, name, description, effects FROM node_definitions WHERE class_exclusive = 'warrior' AND (name LIKE '%분노%' OR description LIKE '%분노%')`);
  for (const row of r.rows) console.log(row);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
