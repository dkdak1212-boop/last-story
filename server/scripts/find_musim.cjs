const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT id, name FROM characters WHERE name ILIKE $1 ORDER BY id`, ['%무심%']);
  for (const row of r.rows) console.log(`id=${row.id} name='${row.name}'`);
  if (r.rowCount === 0) console.log('매칭 없음 (%무심%)');
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
