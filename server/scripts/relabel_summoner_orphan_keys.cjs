// 소환사 노드의 미처리 effect key 를 엔진이 처리하는 key 로 리라벨
// 원본 노드 이름/설명은 유지, effects JSON 의 'key' 만 교체

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 매핑: 오래된/미처리 key → 엔진이 처리하는 key
const KEY_MAP = {
  // 레거시 (기존 244 노드)
  'summon_cd_reduce': 'summon_all_cdr',      // 소환 쿨감 (플랫)
  'summon_lifesteal': 'aura_lifesteal',      // 흡혈
  'summon_heal_amp':  'aura_heal',           // 회복 증폭
  'summon_dot_amp':   'summon_amp',          // 도트 증폭 → 데미지 증폭으로 흡수
  'summon_speed_amp': 'summon_amp',          // 속도 증폭 → 데미지로 흡수
  'summon_tankiness': 'summon_amp',          // 피해 감소 → 데미지로 흡수 (임시)
  'summon_sacrifice_amp': 'summon_amp',      // 희생 데미지 → 데미지로 흡수

  // 원소별 spd → dmg 로 흡수 (speed 모델 없음)
  'summon_fire_spd':      'summon_fire_dmg',
  'summon_frost_spd':     'summon_frost_dmg',
  'summon_lightning_spd': 'summon_lightning_dmg',
  'summon_earth_spd':     'summon_earth_dmg',
  'summon_holy_spd':      'summon_holy_dmg',
  'summon_dark_spd':      'summon_dark_dmg',

  // 원소별 debuff_dur → pen (디버프 지속 모델 없음)
  'summon_fire_debuff_dur':      'summon_fire_pen',
  'summon_frost_debuff_dur':     'summon_frost_pen',
  'summon_lightning_debuff_dur': 'summon_lightning_pen',
  'summon_earth_debuff_dur':     'summon_earth_pen',
  'summon_holy_debuff_dur':      'summon_holy_pen',
  'summon_dark_debuff_dur':      'summon_dark_pen',

  // 원소 특수 → 가장 가까운 처리되는 key
  'summon_frost_slow':     'summon_frost_crit',
  'summon_frost_slow_dur': 'summon_frost_crit_dmg',
  'summon_earth_def':      'summon_earth_pen',

  // 타입 서브 (탱커/딜러/서포터/하이브리드) — 대부분 generic 보너스로 흡수
  'summon_tank_hp':    'summon_hybrid_all',
  'summon_tank_atk':   'summon_hybrid_all',
  'summon_tank_spd':   'summon_hybrid_all',
  'summon_tank_cdr':   'summon_all_cdr',
  'summon_dps_hp':     'summon_dps_atk',
  'summon_dps_spd':    'summon_dps_atk',
  'summon_dps_cdr':    'summon_all_cdr',
  'summon_support_hp':  'summon_hybrid_all',
  'summon_support_atk': 'summon_hybrid_all',
  'summon_support_spd': 'summon_hybrid_all',
  'summon_support_cdr': 'summon_all_cdr',
  'summon_hybrid_hp':  'summon_hybrid_all',
  'summon_hybrid_atk': 'summon_hybrid_all',
  'summon_hybrid_spd': 'summon_hybrid_all',
  'summon_hybrid_cdr': 'summon_all_cdr',

  // 오오라 서브
  'aura_def':     'aura_dmg',
  'aura_speed':   'aura_dmg',
  'aura_reflect': 'aura_dmg',
};

(async () => {
  const r = await pool.query(
    `SELECT id, name, effects FROM node_definitions WHERE class_exclusive='summoner'`
  );
  console.log(`대상 노드: ${r.rowCount}개`);

  let touched = 0;
  let totalKeyChanges = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of r.rows) {
      const effects = row.effects || [];
      let dirty = false;
      const newEffects = effects.map(eff => {
        if (eff.type === 'passive' && eff.key && KEY_MAP[eff.key]) {
          dirty = true;
          totalKeyChanges++;
          return { ...eff, key: KEY_MAP[eff.key] };
        }
        return eff;
      });
      if (dirty) {
        await client.query(
          `UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2`,
          [JSON.stringify(newEffects), row.id]
        );
        touched++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`\n리라벨 완료: 노드 ${touched}개, 키 변경 ${totalKeyChanges}개`);

  // 검증 — 여전히 남아있는 orphan 확인
  const check = await pool.query(
    `SELECT id, name, effects FROM node_definitions WHERE class_exclusive='summoner'`
  );
  const remainingOrphans = new Map();
  const handledKeys = new Set([
    // processSummons 에서 처리
    'summon_amp', 'summon_double_hit', 'summon_max_extra', 'summon_duration', 'summon_infinite',
    'summon_fire_dmg', 'summon_frost_dmg', 'summon_lightning_dmg', 'summon_earth_dmg', 'summon_holy_dmg', 'summon_dark_dmg',
    'summon_fire_pen', 'summon_frost_pen', 'summon_lightning_pen', 'summon_earth_pen', 'summon_holy_pen', 'summon_dark_pen',
    'summon_fire_crit', 'summon_frost_crit', 'summon_lightning_crit', 'summon_earth_crit', 'summon_holy_crit', 'summon_dark_crit',
    'summon_fire_crit_dmg', 'summon_frost_crit_dmg', 'summon_lightning_crit_dmg', 'summon_earth_crit_dmg', 'summon_holy_crit_dmg', 'summon_dark_crit_dmg',
    'summon_dark_lifesteal', 'summon_all_element_dmg', 'summon_element_burst',
    'summon_dps_atk', 'summon_hybrid_all', 'element_synergy', 'summon_holy_heal',
    'aura_dmg', 'aura_pen', 'aura_crit', 'aura_heal', 'aura_lifesteal', 'aura_multiplier',
    'summon_all_cdr', 'summon_support_cdr', 'summon_dps_cdr', 'summon_tank_cdr', 'summon_hybrid_cdr',
  ]);
  for (const row of check.rows) {
    for (const eff of (row.effects || [])) {
      if (eff.type === 'passive' && eff.key && !handledKeys.has(eff.key)) {
        remainingOrphans.set(eff.key, (remainingOrphans.get(eff.key) || 0) + 1);
      }
    }
  }
  console.log(`\n=== 리라벨 후 남은 orphan ===`);
  if (remainingOrphans.size === 0) console.log('  ✓ 없음');
  else {
    const sorted = [...remainingOrphans.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, c] of sorted) console.log(`  ${k}: ${c}개`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
