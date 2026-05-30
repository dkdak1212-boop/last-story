// 종언의 회랑 업데이트 — 신규 효과형 접두사 5종 × 4티어 = 20행 (item_prefixes)
// 효과 로직은 engine.ts/formulas.ts 에 구현됨(이 마이그레이션과 같은 PR).
//
// 값 주의:
//  - 모든 값은 prefix.ts:124 levelScale( lv70→×1.8, 낡은망토→×1.5 고정 )이 추가로 곱해진 뒤 적용.
//  - ④ spd_to_dmg_pct: 엔진 해석 = "값 V = 1000속도당 V%, 최대 +40% 상한". (정수 스키마 제약 → 소수계수 대신 /1000 해석)
//  - ⑤ crit_resist_pierce_pct: 대상 치명저항 −X%p (회랑 보스 90% 카운터).
//
// 멱등성: 명시 id 133~152, ON CONFLICT (id) DO UPDATE. 충돌 가드 포함.
//  (프로덕션 item_prefixes max id=132 확인 후 125~144 → 133~152 로 이전)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// [id, name, tier, stat_key, min_val, max_val]
const ROWS = [
  // ① single_hit_amp_pct — 단일타격 증폭
  [133, '묵직한',     1, 'single_hit_amp_pct', 4, 7],
  [134, '육중한',     2, 'single_hit_amp_pct', 7, 12],
  [135, '벽력의',     3, 'single_hit_amp_pct', 12, 18],
  [136, '천붕의',     4, 'single_hit_amp_pct', 18, 28],
  // ② enemy_frenzy — 적 광폭화 저주 (속도 +V% & 적 데미지 −V×0.1%)
  [137, '도발의',     1, 'enemy_frenzy', 6, 10],
  [138, '현혹의',     2, 'enemy_frenzy', 10, 15],
  [139, '광란의',     3, 'enemy_frenzy', 15, 22],
  [140, '저주술사의', 4, 'enemy_frenzy', 22, 30],
  // ③ boss_slayer_pct — 보스/엘리트 특효
  [141, '토벌의',     1, 'boss_slayer_pct', 5, 8],
  [142, '척살의',     2, 'boss_slayer_pct', 9, 13],
  [143, '용살자의',   3, 'boss_slayer_pct', 14, 19],
  [144, '신살자의',   4, 'boss_slayer_pct', 20, 28],
  // ④ spd_to_dmg_pct — 가속 일격 (1000속도당 V%, 최대 +40%)
  [145, '가속의',     1, 'spd_to_dmg_pct', 4, 6],
  [146, '질주의',     2, 'spd_to_dmg_pct', 8, 12],
  [147, '섬광의',     3, 'spd_to_dmg_pct', 13, 17],
  [148, '뇌광의',     4, 'spd_to_dmg_pct', 18, 22],
  // ⑤ crit_resist_pierce_pct — 치명 관통 (적 치명저항 −X%p)
  [149, '노림의',     1, 'crit_resist_pierce_pct', 5, 8],
  [150, '간파의',     2, 'crit_resist_pierce_pct', 9, 13],
  [151, '급소의',     3, 'crit_resist_pierce_pct', 14, 20],
  [152, '절명의',     4, 'crit_resist_pierce_pct', 21, 28],
];

(async () => {
  console.log('=== 회랑 신규 접두사 시드 시작 ===');

  // 충돌 가드 — 133~152 가 다른 stat_key 로 이미 점유돼 있으면 중단.
  const dup = await pool.query(
    `SELECT id, stat_key FROM item_prefixes WHERE id BETWEEN 133 AND 152`
  );
  const ourKeys = new Set(ROWS.map(r => r.stat_key || r[3]));
  for (const row of dup.rows) {
    const expected = ROWS.find(r => r[0] === row.id);
    if (expected && expected[3] !== row.stat_key) {
      console.error(`ERR id ${row.id} 충돌: 기존 stat_key=${row.stat_key}, 신규=${expected[3]} → 중단`);
      process.exit(1);
    }
  }

  for (const [id, name, tier, stat_key, min_val, max_val] of ROWS) {
    await pool.query(
      `INSERT INTO item_prefixes (id, name, tier, stat_key, min_val, max_val)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, tier=EXCLUDED.tier, stat_key=EXCLUDED.stat_key,
         min_val=EXCLUDED.min_val, max_val=EXCLUDED.max_val`,
      [id, name, tier, stat_key, min_val, max_val]
    );
  }
  console.log(`[OK] 접두사 ${ROWS.length}행 (id 133~152)`);

  // 시퀀스 동기화 (item_prefixes 에 serial 이 있을 경우 대비, 없으면 무시)
  try {
    await pool.query(`SELECT setval(pg_get_serial_sequence('item_prefixes','id'), GREATEST((SELECT MAX(id) FROM item_prefixes), 152))`);
    console.log('[OK] id 시퀀스 동기화');
  } catch (e) {
    console.log('[skip] item_prefixes 시퀀스 없음 (정상)');
  }

  console.log('=== 완료 (서버 재시작 시 contentCache/prefix 풀에 반영) ===');
  await pool.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
