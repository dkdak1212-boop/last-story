const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const newDesc = '스킬 시전 시 50% 확률로 즉시 쿨다운 0 / 50% 확률로 쿨다운 ×2 (100% 증가)';
    await c.query(`UPDATE node_definitions SET description = $1 WHERE id = 953`, [newDesc]);
    const r = await c.query(`SELECT id, name, description FROM node_definitions WHERE id = 953`);
    console.log(r.rows[0]);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
