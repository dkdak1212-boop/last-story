const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  const { rows } = await c.query(`
    SELECT name, setting, unit, context, source
      FROM pg_settings
     WHERE name IN ('max_connections', 'superuser_reserved_connections', 'shared_buffers')
  `);
  for (const r of rows) console.log(`${r.name} = ${r.setting}${r.unit ? ' '+r.unit : ''} | context=${r.context} source=${r.source}`);
  const { rows: activeRows } = await c.query(`
    SELECT count(*)::int AS active_connections FROM pg_stat_activity
  `);
  console.log(`현재 활성 커넥션: ${activeRows[0].active_connections}`);
  const { rows: roleRows } = await c.query(`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`);
  console.log(`내 권한 superuser: ${roleRows[0].rolsuper}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
