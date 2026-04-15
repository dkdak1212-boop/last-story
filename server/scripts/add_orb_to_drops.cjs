// 모든 몬스터 drop_table 에 구슬 추가
// 기존 무기(검/지팡이/홀/단검) 엔트리를 찾아 동일 chance 로 구슬 entry 삽입

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

// 무기 ID → 동급 구슬 ID 매핑
// common (검/지팡이/홀/단검) → 구슬
const COMMON_WEAPON_TO_ORB = {
  // lv1
  352: 462, 363: 462, 374: 462, 385: 462,
  // lv10
  353: 463, 364: 463, 375: 463, 386: 463,
  // lv20
  354: 464, 365: 464, 376: 464, 387: 464,
  // lv30
  355: 465, 366: 465, 377: 465, 388: 465,
  // lv40
  356: 466, 367: 466, 378: 466, 389: 466,
  // lv50
  357: 467, 368: 467, 379: 467, 390: 467,
  // lv60
  358: 468, 369: 468, 380: 468, 391: 468,
  // lv70
  359: 469, 370: 469, 381: 469, 392: 469,
  // lv80
  360: 470, 371: 470, 382: 470, 393: 470,
  // lv90
  361: 471, 372: 471, 383: 471, 394: 471,
  // lv100
  362: 472, 373: 472, 384: 472, 395: 472,
};

// legendary (대검/지팡이/홀/단검) → 구슬
const LEGENDARY_WEAPON_TO_ORB = {
  // 발라카스 lv70
  293: 473, 294: 473, 295: 473, 296: 473,
  // 카르나스 lv80
  302: 474, 303: 474, 304: 474, 305: 474,
  // 아트라스 lv90
  311: 475, 312: 475, 313: 475, 314: 475,
};

(async () => {
  const r = await pool.query(`SELECT id, name, level, drop_table FROM monsters WHERE drop_table IS NOT NULL ORDER BY level`);
  console.log(`스캔: ${r.rowCount} 몬스터`);

  const client = await pool.connect();
  let updated = 0;
  let totalAdded = 0;
  try {
    await client.query('BEGIN');
    for (const m of r.rows) {
      const dt = m.drop_table || [];
      if (dt.length === 0) continue;

      // 기존 entry 의 itemId 셋
      const existingIds = new Set(dt.map(e => e.itemId));
      const newEntries = [...dt];

      // common 무기 → 구슬 추가 (동일 chance, 한 번만)
      const commonOrbsToAdd = new Map(); // orbId → chance (first found)
      for (const e of dt) {
        const orbId = COMMON_WEAPON_TO_ORB[e.itemId];
        if (orbId && !existingIds.has(orbId) && !commonOrbsToAdd.has(orbId)) {
          commonOrbsToAdd.set(orbId, e.chance);
        }
      }
      for (const [orbId, chance] of commonOrbsToAdd) {
        newEntries.push({ chance, itemId: orbId, minQty: 1, maxQty: 1 });
        existingIds.add(orbId);
        totalAdded++;
      }

      // legendary 무기 → legendary 구슬 추가
      const legOrbsToAdd = new Map();
      for (const e of dt) {
        const orbId = LEGENDARY_WEAPON_TO_ORB[e.itemId];
        if (orbId && !existingIds.has(orbId) && !legOrbsToAdd.has(orbId)) {
          legOrbsToAdd.set(orbId, e.chance);
        }
      }
      for (const [orbId, chance] of legOrbsToAdd) {
        newEntries.push({ chance, itemId: orbId, minQty: 1, maxQty: 1 });
        existingIds.add(orbId);
        totalAdded++;
      }

      if (newEntries.length > dt.length) {
        await client.query(
          `UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2`,
          [JSON.stringify(newEntries), m.id]
        );
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

  console.log(`\n업데이트: ${updated} 몬스터, 추가된 entry: ${totalAdded}`);

  // 검증: 구슬이 들어간 몬스터 수
  const v = await pool.query(`
    SELECT COUNT(*) FROM monsters
    WHERE drop_table::text LIKE '%462%' OR drop_table::text LIKE '%463%' OR drop_table::text LIKE '%464%'
       OR drop_table::text LIKE '%465%' OR drop_table::text LIKE '%466%' OR drop_table::text LIKE '%467%'
       OR drop_table::text LIKE '%468%' OR drop_table::text LIKE '%469%' OR drop_table::text LIKE '%470%'
       OR drop_table::text LIKE '%471%' OR drop_table::text LIKE '%472%'
       OR drop_table::text LIKE '%473%' OR drop_table::text LIKE '%474%' OR drop_table::text LIKE '%475%'
  `);
  console.log(`구슬 드랍 가능한 몬스터: ${v.rows[0].count}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
