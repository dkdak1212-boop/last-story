// 시공의 균열 — 클래스별 평균 킬타임 / 표본 수 집계
// 컬럼: characters.recent_avg_kill_time_rift_sec (시공 진입 중 EMA 갱신, 다른 필드 EMA 와 분리)
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  try {
    // 데이터 보유 캐릭(NULL 제외) 클래스별 통계
    const r = await pool.query(`
      SELECT class_name,
             COUNT(*) AS samples,
             ROUND(AVG(recent_avg_kill_time_rift_sec)::numeric, 3) AS avg_sec,
             ROUND(MIN(recent_avg_kill_time_rift_sec)::numeric, 3) AS min_sec,
             ROUND(MAX(recent_avg_kill_time_rift_sec)::numeric, 3) AS max_sec,
             ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY recent_avg_kill_time_rift_sec))::numeric, 3) AS median_sec,
             ROUND((PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY recent_avg_kill_time_rift_sec))::numeric, 3) AS p25_sec,
             ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY recent_avg_kill_time_rift_sec))::numeric, 3) AS p75_sec
        FROM characters
       WHERE recent_avg_kill_time_rift_sec IS NOT NULL
         AND level >= 100
       GROUP BY class_name
       ORDER BY avg_sec ASC
    `);
    console.log('=== 시공의 균열 평균 킬타임 (Lv100+ 캐릭, NULL 제외) ===');
    console.log('class       N      avg     med     p25     p75     min     max');
    console.log('─'.repeat(70));
    for (const row of r.rows) {
      const cls = String(row.class_name).padEnd(10);
      const n   = String(row.samples).padStart(4);
      const avg = String(row.avg_sec).padStart(7);
      const med = String(row.median_sec).padStart(7);
      const p25 = String(row.p25_sec).padStart(7);
      const p75 = String(row.p75_sec).padStart(7);
      const mn  = String(row.min_sec).padStart(7);
      const mx  = String(row.max_sec).padStart(7);
      console.log(`${cls} ${n}  ${avg} ${med} ${p25} ${p75} ${mn} ${mx}`);
    }
    // 전체 표본 부족 여부
    const total = r.rows.reduce((s, x) => s + Number(x.samples), 0);
    console.log('─'.repeat(70));
    console.log(`총 표본 ${total} 캐릭`);

    // 표본 빈약 클래스 표기 (N<10)
    const sparse = r.rows.filter(x => Number(x.samples) < 10);
    if (sparse.length) {
      console.log('\n[주의] 표본 N<10 클래스 (의미 있는 비교 어려움):');
      for (const s of sparse) console.log(`  - ${s.class_name}: N=${s.samples}`);
    }

    // 데이터 미보유 클래스 — Lv100+ 인데 rift sec NULL 인 캐릭 카운트
    const nul = await pool.query(`
      SELECT class_name, COUNT(*) AS n
        FROM characters
       WHERE recent_avg_kill_time_rift_sec IS NULL AND level >= 100
       GROUP BY class_name
       ORDER BY class_name
    `);
    if (nul.rowCount) {
      console.log('\n[참고] 시공 진입 미경험 또는 EMA 미수집 캐릭 (NULL):');
      for (const x of nul.rows) console.log(`  - ${x.class_name}: ${x.n}`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
