const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 근느 캐릭 스킬 슬롯 확인
  const r = await pool.query(`
    SELECT cs.slot_order, cs.auto_use, s.name, s.kind, s.effect_type, s.damage_mult, s.cooldown_actions
    FROM character_skills cs
    JOIN skills s ON s.id = cs.skill_id
    WHERE cs.character_id = 13
    ORDER BY cs.slot_order ASC, s.required_level ASC
  `);
  console.log('=== 근느 스킬 슬롯 (slot_order순) ===\n');
  for (const s of r.rows) {
    const tag = s.kind === 'buff' ? '[자유]' : s.cooldown_actions === 0 ? '[기본기]' : `[cd=${s.cooldown_actions}]`;
    const onOff = s.auto_use ? 'ON' : 'OFF';
    console.log(`  슬롯${String(s.slot_order).padStart(2)} ${onOff} ${s.name.padEnd(10)} ${tag} ${s.kind}/${s.effect_type} mult=${s.damage_mult}`);
  }

  // 의도한 순서와 비교
  console.log('\n=== 유저 의도 순서 ===');
  console.log('1.무쌍난무 2.분노의일격 3.최후의일격 4.전장의포효 5.전쟁의함성 6.반격의의지 7.강타');

  // 전투 시뮬: 10턴 실행 흐름
  console.log('\n=== 예상 10턴 로테이션 ===');
  const skills = r.rows.filter(s => s.auto_use);
  const buffs = skills.filter(s => s.kind === 'buff').sort((a, b) => a.slot_order - b.slot_order);
  const dmgs = skills.filter(s => s.kind !== 'buff').sort((a, b) => a.slot_order - b.slot_order);
  const cds = new Map();

  for (let t = 1; t <= 10; t++) {
    // tick cds
    for (const [n, cd] of cds) { if (cd <= 1) cds.delete(n); else cds.set(n, cd - 1); }

    const firedBuffs = [];
    for (const b of buffs) {
      if (cds.has(b.name)) continue;
      firedBuffs.push(b.name);
      if (b.cooldown_actions > 0) cds.set(b.name, b.cooldown_actions);
    }

    let mainSkill = '(없음)';
    for (const d of dmgs) {
      if (d.cooldown_actions > 0 && cds.has(d.name)) continue;
      mainSkill = d.name;
      if (d.cooldown_actions > 0) cds.set(d.name, d.cooldown_actions);
      break;
    }

    const buffStr = firedBuffs.length > 0 ? `[${firedBuffs.join('+')}] → ` : '';
    console.log(`  턴${String(t).padStart(2)}: ${buffStr}${mainSkill}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
