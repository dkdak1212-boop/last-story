const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  // pg_file_settings 에서 max_connections 파일 출처 확인
  const { rows } = await c.query(`
    SELECT sourcefile, sourceline, seqno, name, setting, applied, error
      FROM pg_file_settings
     WHERE name = 'max_connections'
     ORDER BY seqno
  `);
  for (const r of rows) console.log(JSON.stringify(r));
  // 재시도 + 새로운 값 명시
  try {
    const { rows: check } = await c.query(`SHOW max_connections`);
    console.log(`SHOW max_connections: ${check[0].max_connections}`);
  } catch {}
  // pending_restart 체크 다시
  const { rows: cur } = await c.query(
    `SELECT name, setting, reset_val, pending_restart, context FROM pg_settings WHERE name = 'max_connections'`
  );
  for (const r of cur) console.log(`pg_settings: setting=${r.setting} reset_val=${r.reset_val} pending=${r.pending_restart} ctx=${r.context}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
