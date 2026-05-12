// 헌터 node_points 92 → 99 수정 (Lv100 정상 풀 포인트로 보정)
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const NAME = '헌터';
const TARGET = 99;

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(
      `SELECT id, name, level, node_points FROM characters WHERE name = $1`,
      [NAME]
    );
    if (ch.rowCount === 0) { console.log(`캐릭 '${NAME}' 없음`); return; }
    if (ch.rowCount > 1) {
      console.log(`동명이인 다수 (${ch.rowCount}명) — 수동 확인 필요:`);
      for (const r of ch.rows) console.log(`  id=${r.id} name=${r.name} Lv${r.level} np=${r.node_points}`);
      return;
    }
    const row = ch.rows[0];
    console.log(`타겟: ${row.name} (id=${row.id}, Lv${row.level})`);
    console.log(`before: node_points=${row.node_points}`);

    const r = await c.query(
      `UPDATE characters SET node_points = $1 WHERE id = $2 RETURNING node_points`,
      [TARGET, row.id]
    );
    console.log(`after:  node_points=${r.rows[0].node_points}`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
