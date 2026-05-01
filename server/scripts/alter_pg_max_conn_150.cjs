const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query('ALTER SYSTEM SET max_connections = 150');
  console.log('ALTER SYSTEM SET max_connections = 150 실행됨');
  const { rows } = await c.query(`
    SELECT sourcefile, name, setting, applied, error
      FROM pg_file_settings
     WHERE name = 'max_connections' ORDER BY seqno
  `);
  for (const r of rows) console.log(JSON.stringify(r));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
