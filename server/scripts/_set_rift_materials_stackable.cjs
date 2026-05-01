const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });

(async () => {
  await c.connect();
  const before = await c.query(`SELECT id, name, stack_size FROM items WHERE id IN (852, 853, 854) ORDER BY id`);
  console.log('before:', before.rows);
  await c.query(`UPDATE items SET stack_size = 999 WHERE id IN (852, 853, 854)`);
  const after = await c.query(`SELECT id, name, stack_size FROM items WHERE id IN (852, 853, 854) ORDER BY id`);
  console.log('after:', after.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
