const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query('ALTER SYSTEM SET max_connections = 200');
  console.log('ALTER SYSTEM SET max_connections = 200 실행됨 (PG 재시작 필요)');
  const { rows } = await c.query(`
    SELECT name, setting, pending_restart
      FROM pg_settings
     WHERE name = 'max_connections'
  `);
  for (const r of rows) console.log(`${r.name}: 현재=${r.setting} pending_restart=${r.pending_restart}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
