const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/032_guild_medals.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const { rows } = await c.query(`SELECT section, name, price, currency FROM guild_boss_shop_items ORDER BY section, sort_order`);
  for (const r of rows) console.log(`${r.section.padEnd(8)} | ${r.name.padEnd(30)} | ${r.price} | ${r.currency}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
