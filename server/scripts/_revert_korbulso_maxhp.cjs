// 잘못된 보정(992) 즉시 원복 + 동급 캐릭과 비교 진단
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    // 1) 임시 원복
    await pool.query(`UPDATE characters SET max_hp = 84315, hp = 84315 WHERE name = '코뿔소'`);
    const me = await pool.query(`SELECT id, name, class_name, level, max_hp, hp, stats FROM characters WHERE name='코뿔소'`);
    console.log('[reverted]', me.rows[0]);

    // 2) 동일 클래스/레벨 분포 (반대의균형 미보유)
    const peers = await pool.query(`
      SELECT id, name, level, max_hp, stats
      FROM characters
      WHERE class_name='warrior' AND level=100 AND name <> '코뿔소'
        AND id NOT IN (SELECT cn.character_id FROM character_nodes cn JOIN node_definitions nd ON nd.id=cn.node_id WHERE nd.effects::text LIKE '%paragon_balance_inversion%')
      ORDER BY max_hp DESC LIMIT 15
    `);
    console.log('[peers warrior L100, no inversion]');
    peers.rows.forEach(p => console.log(`  id=${p.id} ${p.name} max_hp=${p.max_hp} vit=${p.stats?.vit} dex=${p.stats?.dex}`));

    // 3) 반대의균형 보유 동일 클래스/레벨
    const peersInv = await pool.query(`
      SELECT id, name, level, max_hp, stats
      FROM characters
      WHERE class_name='warrior' AND level=100 AND name <> '코뿔소'
        AND id IN (SELECT cn.character_id FROM character_nodes cn JOIN node_definitions nd ON nd.id=cn.node_id WHERE nd.effects::text LIKE '%paragon_balance_inversion%')
      ORDER BY max_hp DESC LIMIT 15
    `);
    console.log('[peers warrior L100, with inversion]');
    peersInv.rows.forEach(p => console.log(`  id=${p.id} ${p.name} max_hp=${p.max_hp} vit=${p.stats?.vit} dex=${p.stats?.dex}`));

    // 4) 코뿔소 노드/패러곤 정보
    const nodes = await pool.query(`SELECT COUNT(*) AS c FROM character_nodes WHERE character_id = $1`, [me.rows[0].id]);
    console.log('[node count]', nodes.rows[0]);
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
