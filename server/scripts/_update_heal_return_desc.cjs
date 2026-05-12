const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const newDesc = '회복량의 100% 가 다음 자기 공격 1회에 추가 데미지로 적용 (소모형) · HP 가득해서 손실되는 오버 회복도 포함';
    const r = await c.query(`UPDATE node_definitions SET description = $1 WHERE id = 928 RETURNING id, name, description`, [newDesc]);
    if (r.rowCount > 0) console.log(`✅ #${r.rows[0].id} ${r.rows[0].name}\n  → ${r.rows[0].description}`);
    else console.log('⚠ no row updated');
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
