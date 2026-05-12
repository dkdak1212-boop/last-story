const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const newDesc = '받은 회복량의 100% 가 다음 자기 공격 1회에 평균 데미지로 추가 (소모형)';
    await c.query(`UPDATE node_definitions SET description = $1 WHERE id = 928`, [newDesc]);
    const r = await c.query(`SELECT id, name, description FROM node_definitions WHERE id = 928`);
    console.log(r.rows[0]);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
