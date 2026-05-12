const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, level, class_name FROM characters WHERE id = 2516`);
    console.log('characters row:', r.rowCount === 0 ? '★ 캐릭 없음 (삭제됨)' : r.rows[0]);
    const inv = await c.query(`SELECT COUNT(*) AS n FROM character_inventory WHERE character_id = 2516`);
    console.log('character_inventory 행 수 for 2516:', inv.rows[0].n);
    // 최근 캐릭 ID 분포
    const max = await c.query(`SELECT MAX(id) AS max_id, COUNT(*) AS total FROM characters`);
    console.log('최대 char id:', max.rows[0].max_id, '/ 전체:', max.rows[0].total);
    // 2510 ~ 2520 구간 확인
    const around = await c.query(`SELECT id, name FROM characters WHERE id BETWEEN 2510 AND 2530 ORDER BY id`);
    console.log('주변 (2510~2530):', around.rows.map(x=>`${x.id}:${x.name}`).join(' / '));
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
