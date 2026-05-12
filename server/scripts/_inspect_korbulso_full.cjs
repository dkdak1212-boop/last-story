// 코뿔소 — 현재 상태 + 어떤 paragon/keystone 보유, 세션 캐시 여부, atk_boost_until 등 종합 조사
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const c = (await pool.query(`
      SELECT id, name, level, class_name, max_hp, hp, stats,
             atk_boost_until, hp_boost_until, paragon_points,
             COALESCE(permanent_stat_bonus_hp,0) AS perm_hp,
             COALESCE(permanent_stat_bonus_atk,0) AS perm_atk,
             COALESCE(permanent_stat_bonus_matk,0) AS perm_matk
        FROM characters WHERE name = '코뿔소'`)).rows[0];
    if (!c) return console.log('NO CHAR');
    console.log('[char]', c);

    // 보유 노드 — paragon zone + balance/shield/heavy 등 ATK 영향 키스톤 식별
    const nodes = await pool.query(`
      SELECT cn.node_id, nd.name, nd.zone, nd.tier, nd.effects::text AS eff
        FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
        WHERE cn.character_id = $1
          AND (nd.effects::text LIKE '%paragon_balance_inversion%'
            OR nd.effects::text LIKE '%paragon_iron_reflexes%'
            OR nd.effects::text LIKE '%paragon_shield_wrath%'
            OR nd.effects::text LIKE '%paragon_heavy_blade%'
            OR nd.effects::text LIKE '%paragon_quick_decision%'
            OR nd.effects::text LIKE '%paragon_chance_lord%'
            OR nd.effects::text LIKE '%paragon_fate_lock%'
            OR nd.effects::text LIKE '%paragon_failure_glory%'
            OR nd.zone = 'paragon')
        ORDER BY nd.zone, nd.tier`, [c.id]);
    console.log(`[paragon/keystone 보유: ${nodes.rowCount}개]`);
    nodes.rows.forEach(n => console.log(`  - id=${n.node_id} ${n.name} (${n.zone}/${n.tier}) eff=${(n.eff||'').slice(0,120)}`));

    // 장착 장비 → ATK 합산 추정
    const eq = await pool.query(`
      SELECT ce.slot, ce.item_id, ce.enhance_level, ce.prefix_ids, ce.prefix_stats,
             i.name, i.grade, i.required_level
        FROM character_equipped ce JOIN items i ON i.id = ce.item_id
        WHERE ce.character_id = $1`, [c.id]);
    console.log(`[장착 ${eq.rowCount}]`);
    let prefAtk = 0, prefAtkPct = 0;
    eq.rows.forEach(r => {
      const ps = r.prefix_stats || {};
      prefAtk += Number(ps.atk || 0);
      prefAtkPct += Number(ps.atk_pct || 0);
      console.log(`  [${r.slot}] ${r.name} (${r.grade}, +${r.enhance_level}) atk=${ps.atk||0} atk_pct=${ps.atk_pct||0}`);
    });
    console.log(`[합] prefix_atk=${prefAtk} prefix_atk_pct=${prefAtkPct}`);
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
