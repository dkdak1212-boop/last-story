// 실제 status API 호출 — 인증 우회 위해 직접 import 필요. 하지만 ESM/CJS 혼용 어려움.
// 대신 status 라우트가 반환하는 'effective' 의 핵심 필드를 SQL 로 재계산해서 비교 출력.
// + 노드 패시브 quick_decision 이 atk 에 영향 주는지도 SQL 로 확인.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    // 코뿔소 모든 노드 패시브 효과 dump (key, value)
    const r = await pool.query(`
      SELECT nd.id, nd.name, nd.zone, nd.tier, nd.effects
        FROM character_nodes cn JOIN node_definitions nd ON nd.id = cn.node_id
        WHERE cn.character_id = 2103
        ORDER BY nd.zone, nd.tier, nd.id`);
    const passives = [];
    for (const row of r.rows) {
      const eff = row.effects || [];
      for (const e of eff) {
        if (e.type === 'passive' && e.key && e.value !== undefined) {
          passives.push({ key: e.key, value: e.value, from: `${row.id}:${row.name}` });
        }
      }
    }
    console.log(`[총 ${r.rowCount}개 노드, ${passives.length}개 패시브]`);
    const pmap = new Map();
    for (const p of passives) pmap.set(p.key, (pmap.get(p.key) || 0) + p.value);
    const atkAffecting = ['war_god','berserker_heart','balance_apostle','paragon_atk_pct','paragon_balance_inversion','paragon_shield_wrath','paragon_quick_decision','paragon_heavy_blade','paragon_iron_reflexes'];
    console.log('[ATK 영향 패시브 (시트 적용 여부 표기)]');
    for (const k of atkAffecting) {
      if (pmap.has(k)) {
        const sheetEffect = (k === 'paragon_quick_decision') ? '시트 영향: 없음 (engine.ts 데미지 -30%만)'
          : (k === 'paragon_balance_inversion') ? '시트 영향: STR↔INT swap → ATK 재계산'
          : '시트 영향: ATK 변경';
        console.log(`  - ${k} = ${pmap.get(k)} (${sheetEffect})`);
      }
    }
    console.log('[전체 패시브 sum]', Array.from(pmap.entries()));
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
