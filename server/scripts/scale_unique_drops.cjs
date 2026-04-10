const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

// 필드 idx → 유니크 드랍 확률 (lower field = higher chance)
// 레벨 5~10: field 2   → 0.012 (1.2%)
// 레벨 15~20: field 4  → 0.010
// 레벨 25~30: field 6  → 0.0085
// 레벨 35~40: field 8  → 0.0070 (용암동굴: 반지 2개)
// 레벨 45~50: field 10 → 0.0055
// 레벨 55~60: field 12 → 0.0045
// 레벨 65~70: field 14 → 0.0035
// 레벨 75~80: field 16 → 0.0028
// 레벨 85~90: field 18 → 0.0020
// 레벨 95~100: field 20→ 0.0015
const UNIQUE_CHANCE = {
  2:  0.0012,
  4:  0.0010,
  6:  0.00085,
  8:  0.00070,
  10: 0.00055,
  12: 0.00045,
  14: 0.00035,
  16: 0.00028,
  18: 0.00020,
  20: 0.00015,
};

(async () => {
  // 유니크 아이템 ID 조회
  const ur = await pool.query("SELECT id, name FROM items WHERE grade = 'unique' ORDER BY id");
  const uniqueIds = new Set(ur.rows.map(r => r.id));
  console.log(`유니크 ${ur.rows.length}개 확인`);

  // 각 필드 monster_pool에서 몬스터 ID 추출 → drop_table 수정
  for (const [fieldIdx, newChance] of Object.entries(UNIQUE_CHANCE)) {
    const fid = Number(fieldIdx);
    const fr = await pool.query('SELECT monster_pool FROM fields WHERE id = $1', [fid]);
    if (fr.rowCount === 0) { console.log(`필드 ${fid} 없음`); continue; }
    const mp = fr.rows[0].monster_pool || [];
    const mIds = mp.map(m => typeof m === 'number' ? m : (m.id || m.monsterId)).filter(Boolean);
    if (mIds.length === 0) { console.log(`필드 ${fid} 몬스터 없음`); continue; }

    const mr = await pool.query('SELECT id, name, drop_table FROM monsters WHERE id = ANY($1::int[])', [mIds]);
    let updated = 0;
    for (const m of mr.rows) {
      const dt = m.drop_table || [];
      let changed = false;
      for (const d of dt) {
        if (uniqueIds.has(d.itemId)) {
          if (d.chance !== newChance) {
            d.chance = newChance;
            changed = true;
          }
        }
      }
      if (changed) {
        await pool.query('UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2', [JSON.stringify(dt), m.id]);
        updated++;
      }
    }
    console.log(`필드 ${fid}: ${updated}/${mr.rows.length} 몬스터 갱신 (확률 ${(newChance*100).toFixed(2)}%)`);
  }

  await pool.end();
  console.log('완료');
})().catch(e => { console.error(e); process.exit(1); });
