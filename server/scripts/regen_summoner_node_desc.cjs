// 소환사 노드 설명(description)을 effects 기반으로 정확히 재생성

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const STAT_LABEL = {
  str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '스피드', cri: '치명타',
};

const PASSIVE_LABEL = {
  summon_amp: '소환수 데미지',
  summon_cd_reduce: '소환 쿨감',
  summon_all_cdr: '소환 쿨감',
  summon_max_extra: '추가 소환',
  summon_duration: '소환수 지속 시간',
  summon_infinite: '소환 무한 지속',
  summon_double_hit: '소환수 2회 타격',
  summon_all_element_dmg: '모든 원소 소환수 데미지',
  summon_element_burst: '원소 폭발 확률',
  summon_dps_atk: '소환수 데미지',
  summon_hybrid_all: '소환수 강화',
  element_synergy: '원소 조화',
  summon_dark_lifesteal: '암흑 소환수 흡혈',
  summon_holy_heal: '신성 소환수 회복',
  aura_dmg: '오오라 데미지',
  aura_pen: '오오라 관통',
  aura_crit: '오오라 치명',
  aura_heal: '오오라 회복',
  aura_lifesteal: '오오라 흡혈',
  aura_multiplier: '오오라 배율',
  // 원소별
  summon_fire_dmg: '화염 소환수 데미지',
  summon_frost_dmg: '빙결 소환수 데미지',
  summon_lightning_dmg: '번개 소환수 데미지',
  summon_earth_dmg: '대지 소환수 데미지',
  summon_holy_dmg: '신성 소환수 데미지',
  summon_dark_dmg: '암흑 소환수 데미지',
  summon_fire_pen: '화염 소환수 관통',
  summon_frost_pen: '빙결 소환수 관통',
  summon_lightning_pen: '번개 소환수 관통',
  summon_earth_pen: '대지 소환수 관통',
  summon_holy_pen: '신성 소환수 관통',
  summon_dark_pen: '암흑 소환수 관통',
  summon_fire_crit: '화염 소환수 치명',
  summon_frost_crit: '빙결 소환수 치명',
  summon_lightning_crit: '번개 소환수 치명',
  summon_earth_crit: '대지 소환수 치명',
  summon_holy_crit: '신성 소환수 치명',
  summon_dark_crit: '암흑 소환수 치명',
  summon_fire_crit_dmg: '화염 소환수 치명 데미지',
  summon_frost_crit_dmg: '빙결 소환수 치명 데미지',
  summon_lightning_crit_dmg: '번개 소환수 치명 데미지',
  summon_earth_crit_dmg: '대지 소환수 치명 데미지',
  summon_holy_crit_dmg: '신성 소환수 치명 데미지',
  summon_dark_crit_dmg: '암흑 소환수 치명 데미지',
};

function isPercent(key) {
  // % 로 표기할 키
  return key.endsWith('_dmg') || key.endsWith('_pct') || key.endsWith('_crit') || key.endsWith('_pen') ||
         key.endsWith('_heal') || key.endsWith('_lifesteal') || key.includes('_amp') ||
         key.includes('_element_') || key === 'element_synergy';
}

function effectToText(eff) {
  if (eff.type === 'stat') {
    const label = STAT_LABEL[eff.stat] || eff.stat;
    return `${label} +${eff.value}`;
  }
  if (eff.type === 'passive') {
    const label = PASSIVE_LABEL[eff.key] || eff.key;
    // 특수 키
    if (eff.key === 'summon_duration') return `소환수 지속 +${eff.value}행동`;
    if (eff.key === 'summon_max_extra') return `추가 소환 +${eff.value}`;
    if (eff.key === 'summon_all_cdr' || eff.key === 'summon_cd_reduce') return `소환 스킬 쿨다운 -${eff.value}행동`;
    if (eff.key === 'summon_infinite') return `소환수 지속 무한`;
    if (eff.key === 'summon_double_hit') return `소환수 ${eff.value}% 확률 2회 타격`;
    if (eff.key === 'summon_element_burst') return `원소 소환수 ${eff.value}% 확률 폭발 (x2 데미지)`;
    if (eff.key === 'element_synergy') return `원소 2종 이상 활성 시 데미지 +${eff.value}%`;
    if (eff.key === 'aura_multiplier') return `오오라 효과 ${eff.value === 1 ? '2배' : `×${eff.value+1}`}`;
    if (isPercent(eff.key)) return `${label} +${eff.value}%`;
    return `${label} +${eff.value}`;
  }
  return '';
}

(async () => {
  const r = await pool.query(`SELECT id, name, effects, description FROM node_definitions WHERE class_exclusive='summoner'`);
  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const row of r.rows) {
      const effs = row.effects || [];
      const parts = effs.map(effectToText).filter(Boolean);
      if (parts.length === 0) continue;
      const newDesc = parts.join(', ');
      if (newDesc !== row.description) {
        await client.query(`UPDATE node_definitions SET description=$1 WHERE id=$2`, [newDesc, row.id]);
        updated++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`재생성: ${updated}개`);

  // 샘플
  const sample = await pool.query(`SELECT name, description FROM node_definitions WHERE class_exclusive='summoner' AND name LIKE '%스피드%' LIMIT 5`);
  console.log('\n=== 샘플 (스피드 관련) ===');
  for (const row of sample.rows) console.log(' ', row.name, '|', row.description);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
