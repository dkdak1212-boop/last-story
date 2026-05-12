// 코뿔소 — 스탯/일반 노드/차원 노드(파라곤) 전부 리셋.
// 1) stats: 클래스 시작값으로 복귀, 분배 분량을 stat_points 환불
// 2) max_hp: 분배 VIT(또는 inversion 시 DEX) × 20 차감
// 3) character_nodes 전체 DELETE
// 4) node_points / paragon_points: 노드 zone 별 cost 합으로 환불
// 5) 인메모리 세션은 다음 입장/노드 변경 시 refresh 됨 (스크립트는 DB 만 건드림)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const HP_PER_VIT = 20;
const CLASS_START = {
  warrior:  { stats: { str: 15, dex: 8,  int: 4,  vit: 14, spd: 200, cri: 5 } },
  mage:     { stats: { str: 4,  dex: 7,  int: 16, vit: 14, spd: 200, cri: 5 } },
  cleric:   { stats: { str: 8,  dex: 6,  int: 16, vit: 14, spd: 200, cri: 5 } },
  rogue:    { stats: { str: 10, dex: 14, int: 5,  vit: 14, spd: 200, cri: 5 } },
  summoner: { stats: { str: 4,  dex: 6,  int: 18, vit: 14, spd: 200, cri: 5 } },
};

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `SELECT id, name, class_name, level, max_hp, hp, stats,
              COALESCE(stat_points, 0) AS stat_points,
              COALESCE(node_points, 0) AS node_points,
              COALESCE(paragon_points, 0) AS paragon_points
         FROM characters WHERE name = '코뿔소' FOR UPDATE`
    );
    if (!r.rowCount) { console.log('NO CHAR'); await client.query('ROLLBACK'); return; }
    const c = r.rows[0];
    const start = CLASS_START[c.class_name];
    if (!start) { console.log(`unknown class ${c.class_name}`); await client.query('ROLLBACK'); return; }

    console.log(`[before] id=${c.id} name=${c.name} L=${c.level} max_hp=${c.max_hp} stats=${JSON.stringify(c.stats)}`);
    console.log(`         SP=${c.stat_points} NP=${c.node_points} PP=${c.paragon_points}`);

    // ── 1) 스탯 환불 ──
    const cur = c.stats || {};
    const spentStr = Math.max(0, (cur.str ?? start.stats.str) - start.stats.str);
    const spentDex = Math.max(0, (cur.dex ?? start.stats.dex) - start.stats.dex);
    const spentInt = Math.max(0, (cur.int ?? start.stats.int) - start.stats.int);
    const spentVit = Math.max(0, (cur.vit ?? start.stats.vit) - start.stats.vit);
    const statRefund = spentStr + spentDex + spentInt + spentVit;
    console.log(`[stats] spent: str=${spentStr} dex=${spentDex} int=${spentInt} vit=${spentVit} → 환불 ${statRefund}`);

    // 반대의 균형 보유 여부 (HP 차감 대상 결정)
    const inv = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
          WHERE cn.character_id = $1 AND nd.effects::text LIKE '%paragon_balance_inversion%') AS ex`,
      [c.id]
    );
    const hasInv = !!inv.rows[0]?.ex;
    const hpRefund = (hasInv ? spentDex : spentVit) * HP_PER_VIT;
    console.log(`[hp] hasInversion=${hasInv} → max_hp -${hpRefund}`);

    const newStats = {
      ...cur,
      str: start.stats.str,
      dex: start.stats.dex,
      int: start.stats.int,
      vit: start.stats.vit,
    };

    // ── 2) 노드 zone 별 cost 합산 (LEFT JOIN — orphan 도 포함) ──
    const nodeR = await client.query(
      `SELECT
          COALESCE(SUM(CASE WHEN nd.zone = 'paragon' THEN COALESCE(nd.cost, 0) ELSE 0 END), 0)::int AS paragon_total,
          COALESCE(SUM(CASE WHEN nd.zone IS NULL OR nd.zone <> 'paragon' THEN COALESCE(nd.cost, 1) ELSE 0 END), 0)::int AS normal_total,
          COUNT(*)::int AS total_count
         FROM character_nodes cn
         LEFT JOIN node_definitions nd ON nd.id = cn.node_id
        WHERE cn.character_id = $1`, [c.id]
    );
    const npRefund = nodeR.rows[0].normal_total;
    const ppRefund = nodeR.rows[0].paragon_total;
    const totalNodes = nodeR.rows[0].total_count;
    console.log(`[nodes] 총 ${totalNodes}개 → 일반 NP +${npRefund}, 차원 PP +${ppRefund}`);

    // ── 3) 노드 삭제 ──
    await client.query(`DELETE FROM character_nodes WHERE character_id = $1`, [c.id]);

    // ── 4) characters 갱신 (스탯/HP/포인트 일괄) ──
    await client.query(
      `UPDATE characters
          SET stats = $1::jsonb,
              max_hp = GREATEST(1, max_hp - $2),
              hp = LEAST(hp, GREATEST(1, max_hp - $2)),
              stat_points = COALESCE(stat_points, 0) + $3,
              node_points = COALESCE(node_points, 0) + $4,
              paragon_points = COALESCE(paragon_points, 0) + $5
        WHERE id = $6`,
      [JSON.stringify(newStats), hpRefund, statRefund, npRefund, ppRefund, c.id]
    );

    await client.query('COMMIT');

    const after = await pool.query(
      `SELECT max_hp, hp, stats, stat_points, node_points, paragon_points FROM characters WHERE id = $1`, [c.id]
    );
    const a = after.rows[0];
    console.log(`[after]  max_hp=${a.max_hp} hp=${a.hp} stats=${JSON.stringify(a.stats)}`);
    console.log(`         SP=${a.stat_points} NP=${a.node_points} PP=${a.paragon_points}`);
    const remaining = await pool.query(`SELECT COUNT(*)::int AS n FROM character_nodes WHERE character_id = $1`, [c.id]);
    console.log(`         remaining nodes=${remaining.rows[0].n}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
