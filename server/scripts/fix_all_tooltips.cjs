const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    SELECT id, class_name, name, damage_mult, cooldown_actions, kind, flat_damage,
           effect_type, effect_value, effect_duration, description
    FROM skills ORDER BY class_name, required_level
  `);

  let updated = 0;
  for (const s of r.rows) {
    const mult = Number(s.damage_mult);
    const pct = Math.round(mult * 100);
    const useMatk = s.class_name === 'mage' || s.class_name === 'cleric';
    const atkLabel = useMatk ? 'MATK' : 'ATK';
    const flat = Number(s.flat_damage) || 0;
    const ev = Number(s.effect_value);
    const dur = s.effect_duration;
    let desc = '';

    if (s.kind === 'buff') {
      // 버프류 — 효과 설명만
      switch (s.effect_type) {
        case 'shield': desc = `최대 HP ${ev}% 실드, ${dur}행동 지속 (자유 행동)`; break;
        case 'damage_reduce': desc = `${dur}행동간 받는 데미지 ${ev}% 감소 (자유 행동)`; break;
        case 'damage_reflect': desc = `${dur}행동간 받는 데미지 ${ev}% 반사 (자유 행동)`; break;
        case 'atk_buff': desc = `${dur}행동간 ATK ${ev}% 증가 (자유 행동)`; break;
        case 'self_speed_mod': desc = `${dur}행동간 자신 스피드 ${ev}% 증가 (자유 행동)`; break;
        case 'gauge_fill': desc = `자신 게이지 즉��� ${ev} 충전 (자유 행동)`; break;
        case 'resurrect': desc = `HP 0 시 HP ${ev}% 자동 회복 1회 (자유 행동)`; break;
        case 'invincible': desc = `${dur}행동간 무적 (자유 행동)`; break;
        default: desc = s.description; break;
      }
    } else if (s.kind === 'heal') {
      desc = `최대 HP ${ev}% 즉시 회복`;
      if (s.name === '정화의 빛') desc += ' + 디버프 ��제';
      if (s.name === '치유의 빛') desc += ' + 회복량만큼 적에게 신성 피해';
    } else if (s.kind === 'debuff') {
      if (mult > 0) desc = `${atkLabel} x${pct}%, `;
      else desc = '';
      switch (s.effect_type) {
        case 'gauge_reset': desc += `적 게이지 리셋, ${ev}% 확률 기절`; break;
        case 'gauge_freeze': desc += `적 게이지 동결 ${dur}행동`; break;
        case 'accuracy_debuff':
          desc += `적 명중률 ${ev}% 감소 ${dur}행동`;
          if (s.name === '독안개' || s.name === '맹독의 안개') desc += ' + 독 도트';
          if (s.name === '연막탄') desc += ' + 적 게이지 25% 감소';
          break;
        case 'speed_mod': desc += `적 스피드 ${Math.abs(ev)}% 감소 ${dur}행동`; break;
        case 'stun': desc += `적 기절 ${dur}행동`;
          if (s.name === '신성 사슬') desc += ' + 자신 모든 능력치 20% 상승 3행동';
          break;
        default: desc += s.effect_type; break;
      }
    } else if (s.kind === 'damage') {
      // 딜스킬
      desc = `${atkLabel} x${pct}%`;
      if (flat > 0) desc += ` + ${flat}`;

      switch (s.effect_type) {
        case 'damage': break;
        case 'dot':
          desc += `, 도트 ${dur}행동`;
          if (ev > 0) desc += `, ${ev}% 확률 2회 발동`;
          break;
        case 'speed_mod': desc += `, 적 스피드 ${Math.abs(ev)}% 감소 ${dur}행동`; break;
        case 'hp_pct_damage': desc += ` + 적 현재 HP ${ev}% 고정 데미지`; break;
        case 'lifesteal': desc += `, 흡혈 ${ev}%`; break;
        case 'stun': desc += `, 기절 ${dur}행동`; break;
        case 'multi_hit': desc += ` x${Math.round(ev)}회`; break;
        case 'multi_hit_poison': desc += ` x${Math.round(ev)}회, 각 타격 독 중첩`; break;
        case 'gauge_freeze': desc += `, 적 게이지 동결 ${dur}행동`; break;
        case 'shield': desc += `, 실드 ${dur}행동`; break;
        case 'double_chance': desc += `, ${ev}% 확률 2회 발동`; break;
        case 'crit_bonus': desc += `, 치명타 확률 +${ev}%`; break;
        case 'self_speed_mod':
          if (ev < 0) desc += `, 자신 스피드 ${Math.abs(ev)}% 감소 ${dur}행동`;
          break;
        case 'self_hp_dmg': desc += `, 자신 HP ${ev}% 소모`; break;
        case 'poison': desc += `, 독 도트 ${dur}행동`; break;
        case 'poison_burst': desc += `, 독 스택 ${ev}% 즉시 폭발`; break;
        case 'shield_break': desc += `, 쉴드 비례 추가 데미지`; break;
        case 'judgment_day': desc += `, 심판 ${dur}행동`; break;
        case 'damage_reflect': desc += `, 데미지 ${ev}% 반사 ${dur}행동`; break;
        case 'holy_strike': desc += `, 신성 추가 데미지`; break;
        default: break;
      }

      // 특수 스킬별 추가 설명
      if (s.name === '분노의 일격') desc += ', 출혈 3행동 (ATK x2.0)';
      if (s.name === '방패 강타') desc += ', HP 15% 고정 추가 데미지, 적 받는 데미지 +20% 3턴';
    }

    if (desc && desc !== s.description) {
      await pool.query('UPDATE skills SET description = $1 WHERE id = $2', [desc, s.id]);
      console.log(`[${s.class_name}] ${s.name}: ${desc}`);
      updated++;
    }
  }

  console.log(`\n${updated}개 스킬 설명 갱신 완료`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
