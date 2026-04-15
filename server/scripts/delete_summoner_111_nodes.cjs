// 소환사 노드 25% (111개) 삭제: 기존 중복 스탯 61 + 신규 저활용 50
// 투자된 노드는 포인트 환불 후 삭제

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 기존 중복 스탯 small 중 앞쪽 61개
    const existingR = await client.query(
      `SELECT id, name, cost FROM node_definitions
       WHERE class_exclusive='summoner' AND tier='small'
         AND (name LIKE '%작은 강화%' OR name LIKE '%힘 강화%' OR name LIKE '%민첩 강화%'
              OR name LIKE '%지능 강화%' OR name LIKE '%체력 강화%'
              OR name LIKE '%스피드 강화%' OR name LIKE '%치명타 강화%')
       ORDER BY id LIMIT 61`
    );
    // 2. 신규 저활용: 저항관통/방어/HP 효과 포함
    const newR = await client.query(
      `SELECT id, name, cost FROM node_definitions
       WHERE class_exclusive='summoner' AND tier='small'
         AND (effects::text LIKE '%res_pen%' OR effects::text LIKE '%_def%' OR effects::text LIKE '%_hp%')
       ORDER BY id LIMIT 50`
    );

    const deleteIds = [...existingR.rows.map(r => r.id), ...newR.rows.map(r => r.id)];
    console.log(`삭제 대상: 기존 ${existingR.rowCount} + 신규 ${newR.rowCount} = ${deleteIds.length}개`);

    // 3. 투자된 character_nodes 환불
    const investedR = await client.query(
      `SELECT cn.character_id, cn.node_id, nd.cost
       FROM character_nodes cn
       JOIN node_definitions nd ON nd.id = cn.node_id
       WHERE cn.node_id = ANY($1::int[])`,
      [deleteIds]
    );
    console.log(`환불 대상 투자 노드: ${investedR.rowCount}개`);

    // 캐릭터별 환불 포인트 집계
    const refundMap = new Map();
    for (const row of investedR.rows) {
      refundMap.set(row.character_id, (refundMap.get(row.character_id) || 0) + row.cost);
    }
    for (const [cid, pts] of refundMap) {
      await client.query(`UPDATE characters SET node_points = node_points + $1 WHERE id = $2`, [pts, cid]);
      console.log(`  캐릭터 ${cid}: +${pts}pt 환불`);
    }

    // 4. character_nodes 삭제
    await client.query(`DELETE FROM character_nodes WHERE node_id = ANY($1::int[])`, [deleteIds]);

    // 5. 다른 노드의 prerequisites 배열에서 삭제 ID 제거
    // (소환사 노드 중 삭제되는 ID를 prereq로 가진 것 탐색 후 치환)
    const refR = await client.query(
      `SELECT id, prerequisites FROM node_definitions
       WHERE class_exclusive='summoner' AND prerequisites && $1::int[]`,
      [deleteIds]
    );
    const deleteSet = new Set(deleteIds);
    for (const row of refR.rows) {
      const filtered = (row.prerequisites || []).filter(p => !deleteSet.has(p));
      const newPrereq = filtered.length > 0 ? filtered : null;
      await client.query(
        `UPDATE node_definitions SET prerequisites = $1::int[] WHERE id = $2`,
        [newPrereq, row.id]
      );
    }
    console.log(`prereq 참조 정리: ${refR.rowCount}개 노드`);

    // 6. node_definitions 삭제
    await client.query(`DELETE FROM node_definitions WHERE id = ANY($1::int[])`, [deleteIds]);

    await client.query('COMMIT');
    console.log('✓ 트랜잭션 커밋 완료');

    // 7. 검증
    const verifyR = await pool.query(
      `SELECT tier, COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner' GROUP BY tier ORDER BY tier`
    );
    const totalR = await pool.query(
      `SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner'`
    );
    console.log('\n=== 삭제 후 소환사 노드 ===');
    for (const v of verifyR.rows) console.log(`  ${v.tier}: ${v.cnt}`);
    console.log(`  총: ${totalR.rows[0].cnt}`);

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
