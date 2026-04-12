const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 전사 + 마법사 딜스킬 설명을 현재 damage_mult 기준으로 갱신
  const r = await pool.query(`
    SELECT id, class_name, name, damage_mult, cooldown_actions, effect_type, effect_value, effect_duration, flat_damage, description
    FROM skills WHERE class_name IN ('warrior', 'mage') AND kind = 'damage'
    ORDER BY class_name, required_level
  `);

  for (const s of r.rows) {
    const mult = Number(s.damage_mult);
    const pct = Math.round(mult * 100);
    const useMatk = s.class_name === 'mage';
    const atkLabel = useMatk ? 'MATK' : 'ATK';
    let desc = '';

    switch (s.effect_type) {
      case 'damage':
        desc = `${atkLabel} x${pct}%`;
        if (s.flat_damage > 0) desc += ` + ${s.flat_damage}`;
        break;
      case 'dot':
        desc = `${atkLabel} x${pct}%`;
        if (s.flat_damage > 0) desc += ` + ${s.flat_damage}`;
        desc += `, 도트 ${s.effect_duration}행동`;
        break;
      case 'speed_mod':
        desc = `${atkLabel} x${pct}%, 적 스피드 ${Math.abs(s.effect_value)}% 감소 ${s.effect_duration}행동`;
        break;
      case 'hp_pct_damage':
        desc = `${atkLabel} x${pct}% + 적 현재 HP ${s.effect_value}% 고정 데미지`;
        break;
      case 'lifesteal':
        desc = `${atkLabel} x${pct}%, 흡혈 ${s.effect_value}%`;
        break;
      case 'stun':
        desc = `${atkLabel} x${pct}%, 기절 ${s.effect_duration}행동`;
        break;
      case 'multi_hit':
        desc = `${atkLabel} x${pct}% x${Math.round(s.effect_value)}회`;
        break;
      case 'gauge_freeze':
        desc = `${atkLabel} x${pct}%, 적 게이지 동결 ${s.effect_duration}행동`;
        break;
      case 'shield':
        desc = `${atkLabel} x${pct}%, 실드 ${s.effect_duration}행동`;
        break;
      case 'self_speed_mod':
        if (s.effect_value < 0) desc = `${atkLabel} x${pct}%, 자신 스피드 ${Math.abs(s.effect_value)}% 감소 ${s.effect_duration}행동`;
        else desc = `${atkLabel} x${pct}%`;
        break;
      default:
        desc = `${atkLabel} x${pct}%`;
    }

    await pool.query('UPDATE skills SET description = $1 WHERE id = $2', [desc, s.id]);
    console.log(`[${s.class_name}] ${s.name}: ${desc}`);
  }

  console.log('\n완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
