const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ch = await c.query(`SELECT id, name, level, node_points, paragon_points FROM characters WHERE name = '하유리'`);
    const me = ch.rows[0];
    console.log(`#${me.id} ${me.name} L${me.level}`);
    console.log(`  현재 node_points (unspent): ${me.node_points}`);
    console.log(`  paragon_points: ${me.paragon_points}`);
    // 투자한 노드 합계 (cost 기준)
    const inv = await c.query(`
      SELECT
        COUNT(*) AS cnt,
        SUM(CASE WHEN nd.zone = 'paragon' THEN COALESCE(nd.cost, 0) ELSE 0 END) AS paragon_cost,
        SUM(CASE WHEN nd.zone IS NULL OR nd.zone <> 'paragon' THEN COALESCE(nd.cost, 1) ELSE 0 END) AS normal_cost
      FROM character_nodes cn
      LEFT JOIN node_definitions nd ON nd.id = cn.node_id
      WHERE cn.character_id = $1
    `, [me.id]);
    const i = inv.rows[0];
    console.log(`  투자한 노드: ${i.cnt}개 (직업 cost ${i.normal_cost}, 차원 cost ${i.paragon_cost})`);
    console.log(`  → 직업 합계 (unspent + 투자): ${me.node_points + Number(i.normal_cost)}`);
    console.log(`  → 차원 합계 (unspent + 투자): ${(me.paragon_points||0) + Number(i.paragon_cost)}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
