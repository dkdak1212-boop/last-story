// 모든 직업 스킬 툴팁(description) 자동 재생성
// effect_type / damage_mult / effect_value / cooldown / element 기반

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const ELEMENT_KR = {
  fire: '화염', frost: '빙결', lightning: '번개',
  earth: '대지', holy: '신성', dark: '암흑',
};

function gen(s) {
  const cd = s.cooldown_actions;
  const cdStr = cd > 0 ? ` · 쿨 ${cd}행동` : ' · 기본기';
  const mult = parseFloat(s.damage_mult);
  const val = parseFloat(s.effect_value);
  const dur = s.effect_duration;
  const flat = s.flat_damage;
  const flatStr = flat > 0 ? ` +고정 ${flat}` : '';
  const el = s.element ? `[${ELEMENT_KR[s.element] || s.element}] ` : '';

  // 특수 스킬 이름별 오버라이드
  const SPECIAL = {
    '강타': '기본 공격 + 자기 HP 8% 비례 추가 데미지',
    '분노의 일격': `${mult}배 데미지 + 적 방어력 50% 무시 · 쿨 ${cd}행동`,
    '무쌍난무': `${mult}배 × ${val}연타 · 25% 확률 다른 스킬 쿨 초기화 · 쿨 ${cd}행동`,
    '전장의 광란': `${mult}배 × ${val}연타 · 50% 확률 다른 스킬 쿨 초기화 · 쿨 ${cd}행동`,
    '절대 파괴': `${mult}배 데미지 + 적 방어력 100% 무시 · 쿨 ${cd}행동`,
    '대멸절': `${mult}배 데미지 + 적 방어력 100% 무시 · 쿨 ${cd}행동`,
    '마나 폭주': `자기 INT 1당 +1000 고정 데미지 + ${mult}배 마법 데미지 · 쿨 ${cd}행동`,
    '마력 과부하': `자기 스피드 -25% / 마법 데미지 +80% (${dur}행동) · 쿨 ${cd}행동`,
    '독의 공명': `현재 독 스택 폭발 (총 도트 데미지 × 3) · 쿨 ${cd}행동`,
    '심판자의 권능': `${mult}배 데미지 · 자기 실드 보유 시 +50% · 쿨 ${cd}행동`,
    '암흑의 심판': `${mult}배 데미지 · 적 독 스택당 +8% · 쿨 ${cd}행동`,
    '심판의 철퇴': `${mult}배 + 자기 실드량 4배 추가 데미지 · 쿨 ${cd}행동`,
    '대심판의 철퇴': `${mult}배 + 자기 실드량 8배 추가 데미지 · 쿨 ${cd}행동`,
    '방패 강타': `${mult}배 + 자기 최대 HP 15% 추가 데미지 + 기절 + 적 받는 데미지 +20% (3행동) · 쿨 ${cd}행동`,
    '천상 강림': `${mult}배 데미지 + HP 40% 회복 + 방어력 +${val}% (${dur}행동) · 쿨 ${cd}행동`,
    // 흡혈 계열 — 흡혈량 = 추가 데미지
    '흡혈 참격': `${mult}배 데미지 · 흡혈 ${val}% + 흡혈량만큼 추가 데미지 · 쿨 ${cd}행동`,
    '최후의 일격': `${mult}배 데미지 · 흡혈 ${val}% + 흡혈량만큼 추가 데미지 · 50% 확률 2회 발동 · 쿨 ${cd}행동`,
    '지옥의 칼날': `${mult}배 데미지 · 흡혈 ${val}% + 흡혈량만큼 추가 데미지 · 쿨 ${cd}행동`,
    '피의 향연': `${mult}배 데미지 · 흡혈 ${val}% + 흡혈량만큼 추가 데미지 · 쿨 ${cd}행동`,
  };
  if (SPECIAL[s.name]) return SPECIAL[s.name];

  switch (s.effect_type) {
    case 'damage':
    case 'self_damage_pct':
    case 'crit_bonus':
      return `${el}${mult}배 데미지${flatStr}${cdStr}`;
    case 'hp_pct_damage':
      return `${el}${mult}배 데미지 + 적 HP ${val}% 추가${cdStr}`;
    case 'self_hp_dmg':
      return `${el}${mult}배 데미지 + 자기 최대 HP 비례 추가${cdStr}`;
    case 'lifesteal':
      return `${el}${mult}배 데미지 · 흡혈 ${val}% + 흡혈량만큼 추가 데미지${cdStr}`;
    case 'double_chance':
      return `${el}${mult}배 데미지 · ${val}% 확률 2회 발동${cdStr}`;
    case 'multi_hit':
      return `${el}${mult}배 × ${val}연타${cdStr}`;
    case 'multi_hit_poison':
      return `${el}${mult}배 × ${val}연타 + 독 부여${cdStr}`;
    case 'dot':
      return `${el}${mult}배 데미지 + 도트 ${dur}행동${cdStr}`;
    case 'poison':
      return `${el}${mult}배 데미지 + 독 ${dur}행동${val > 0 ? ` · 적 스피드 -${val}%` : ''}${cdStr}`;
    case 'poison_burst':
      return `현재 독 스택의 ${val}% 즉시 폭발${cdStr}`;
    case 'speed_mod':
      return `${el}${mult > 0 ? mult+'배 데미지 + ' : ''}적 스피드 ${val > 0 ? '+'+val : val}% (${dur}행동)${cdStr}`;
    case 'self_speed_mod':
      return `자기 스피드 ${val > 0 ? '+'+val : val}% (${dur}행동)${cdStr}`;
    case 'gauge_reset':
      return `적 게이지 0 + ${val}% 확률 기절${cdStr}`;
    case 'gauge_freeze':
      return `${el}${mult}배 데미지 + 적 게이지 동결 (${dur}행동)${cdStr}`;
    case 'gauge_fill':
      return `자기 게이지 +${val}${cdStr}`;
    case 'stun':
      return `${el}${mult}배 데미지 + ${val > 0 ? val+'% 확률 ' : ''}기절 (${dur}행동)${cdStr}`;
    case 'accuracy_debuff':
      return `적 명중 -${val}% (${dur}행동)${cdStr}`;
    case 'damage_reduce':
      return `받는 데미지 -${val}% (${dur}행동)${cdStr}`;
    case 'atk_buff':
      return `자기 공격력 +${val}% (${dur}행동)${cdStr}`;
    case 'damage_reflect':
      return `받는 데미지 ${val}% 반사 (${dur}행동)${cdStr}`;
    case 'invincible':
      return `무적 (${dur}행동)${cdStr}`;
    case 'shield':
      return `${mult > 0 ? mult+'배 데미지 + ' : ''}자기 최대 HP ${val}% 실드 (${dur}행동)${cdStr}`;
    case 'shield_break':
      return `${mult}배 데미지 + 자기 실드량 비례 추가${cdStr}`;
    case 'holy_strike':
      return `${el}${mult}배 데미지 + 자기 방어력 ${val || 100}% 비례 추가${cdStr}`;
    case 'judgment_day':
      return `적 실드 파괴 + ${mult}배 신성 데미지 + 자기 방어력 +${val}% (${dur}행동)${cdStr}`;
    case 'heal_pct':
      return `자기 HP ${val}% 회복 (적에게도 같은 신성 피해)${cdStr}`;
    case 'resurrect':
      return `사망 시 HP ${val}% 부활 (전투 1회)${cdStr}`;
    // 소환사
    case 'summon':
      return `${el}소환 (MATK x${val}%, ${dur}행동)${cdStr}`;
    case 'summon_tank':
      return `${el}탱커 소환 (MATK x${val}%, ${dur}행동, 받는 데미지 -20%)${cdStr}`;
    case 'summon_dot':
      return `${el}소환 + 화상 도트 (MATK x${val}%, ${dur}행동)${cdStr}`;
    case 'summon_heal':
      return `${el}수호수 소환 (MATK x${val}%, ${dur}행동, 매 행동 HP 5% 회복)${cdStr}`;
    case 'summon_multi':
      return `${el}소환 (MATK x${val}% × 3연타, ${dur}행동)${cdStr}`;
    case 'summon_buff':
      return `소환수 데미지 +${val}% (${dur}행동)${cdStr}`;
    case 'summon_extend':
      return `모든 소환수 지속 +${val}행동${cdStr}`;
    case 'summon_frenzy':
      return `소환수 ${val}회 공격 (${dur}행동)${cdStr}`;
    case 'summon_all':
      return `자기 + 모든 소환수 일제 공격 (${mult}배)${cdStr}`;
    case 'summon_sacrifice':
      return `가장 강한 소환수 희생 → MATK x${val}% 폭발${cdStr}`;
    case 'summon_storm':
      return `모든 소환수 광역 공격 (${mult}배)${cdStr}`;
    default:
      return `${el}${s.effect_type} · mult=${mult} val=${val}${cdStr}`;
  }
}

(async () => {
  const r = await pool.query(`
    SELECT id, class_name, name, required_level, damage_mult, effect_type, effect_value, effect_duration,
           cooldown_actions, flat_damage, element, description AS old_desc
    FROM skills ORDER BY class_name, required_level
  `);
  console.log(`총 ${r.rowCount} 스킬\n`);

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    let lastClass = null;
    for (const s of r.rows) {
      if (s.class_name !== lastClass) {
        console.log(`\n=== ${s.class_name} ===`);
        lastClass = s.class_name;
      }
      const newDesc = gen(s);
      if (newDesc !== s.old_desc) {
        await client.query(`UPDATE skills SET description=$1 WHERE id=$2`, [newDesc, s.id]);
        updated++;
      }
      console.log(` lv${s.required_level.toString().padStart(3)} ${s.name.padEnd(16)} | ${newDesc}`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`\n업데이트: ${updated}개`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
