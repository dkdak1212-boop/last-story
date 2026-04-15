// 소환사 밸런스 1단계: 셋업 가속 + 초반 데미지 상향

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 스킬 조정표: name → { cd?, dur?, val?, mult? }
const CHANGES = {
  // 기본기: cd 그대로, value +50%
  '늑대 소환':     { val: 120, dur: 10 },                    // 80 → 120, dur 5 → 10
  '골렘 소환':     { val: 80,  dur: 16, cd: 2 },             // 60 → 80, dur 8 → 16, cd 4 → 2
  '독수리 소환':   { val: 150, dur: 8,  cd: 2 },             // 120 → 150, dur 4 → 8, cd 4 → 2
  '불정령 소환':   { val: 140, dur: 12, cd: 3 },             // 100 → 140, dur 6 → 12, cd 5 → 3
  '수호수 소환':   { val: 70,  dur: 20, cd: 5 },             // 50 → 70, dur 10 → 20, cd 7 → 5
  '드래곤 소환':   { val: 240, dur: 10, cd: 6 },             // 200 → 240, dur 5 → 10, cd 8 → 6
  '피닉스 소환':   { val: 200, dur: 16, cd: 7 },             // 150 → 200, dur 8 → 16, cd 10 → 7
  '하이드라 소환': { val: 130, dur: 12, cd: 6 },             // 100 → 130, dur 6 → 12, cd 8 → 6
  '고대 용 소환':  { val: 350, dur: 12, cd: 8 },             // 300 → 350, dur 6 → 12, cd 10 → 8

  // 신규 스킬 duration 2배 (cd 유지)
  '얼음 여왕 소환':{ dur: 12 },                              // 6 → 12
  '뇌신 소환':     { dur: 12 },                              // 6 → 12
  '대지 거신 소환':{ dur: 20 },                              // 10 → 20
  '천상의 수호자': { dur: 20 },                              // 10 → 20
  '시공의 지배자': { dur: 16 },                              // 8 → 16

  // 버스트 강화
  '총공격':        { mult: 5.0 },                            // 3.0 → 5.0
  '희생':          { val: 700, mult: 7.0 },                  // 500 → 700

  // 영혼 유대 연장량 증가
  '영혼 유대':     { val: 6 },                               // 3 → 6 (연장 행동 +3)

  // 버프 지속시간 증가
  '지휘':          { dur: 6 },                               // 3 → 6
  '야수의 분노':   { dur: 6 },                               // 3 → 6
  '군주의 위엄':   { dur: 6 },                               // 3 → 6
};

(async () => {
  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const [name, delta] of Object.entries(CHANGES)) {
      const parts = [];
      const params = [];
      let i = 1;
      if (delta.mult !== undefined) { parts.push(`damage_mult = $${i++}`); params.push(delta.mult); }
      if (delta.cd   !== undefined) { parts.push(`cooldown_actions = $${i++}`); params.push(delta.cd); }
      if (delta.val  !== undefined) { parts.push(`effect_value = $${i++}`); params.push(delta.val); }
      if (delta.dur  !== undefined) { parts.push(`effect_duration = $${i++}`); params.push(delta.dur); }
      params.push(name);
      const r = await client.query(
        `UPDATE skills SET ${parts.join(', ')} WHERE class_name='summoner' AND name=$${i} RETURNING id`,
        params
      );
      if (r.rowCount > 0) {
        updated++;
        console.log(`  ${name}:`, JSON.stringify(delta));
      } else {
        console.log(`  ⚠️  ${name} 없음`);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`\n업데이트: ${updated}개 스킬`);

  // 검증: 최종 상태 출력
  const v = await pool.query(`
    SELECT required_level, name, effect_type, damage_mult, effect_value, effect_duration, cooldown_actions
    FROM skills WHERE class_name='summoner' ORDER BY required_level
  `);
  console.log(`\n=== 최종 ===`);
  for (const r of v.rows) {
    console.log(` lv${r.required_level.toString().padStart(3)} | ${r.name.padEnd(16)} | mult=${r.damage_mult} val=${r.effect_value} dur=${r.effect_duration} cd=${r.cooldown_actions}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
