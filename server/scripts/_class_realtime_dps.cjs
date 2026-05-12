const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    console.log('━━━ 클래스별 평균 1마리 처치시간 (실측, 초) ━━━\n');

    // L100+ 캐릭, 최근 24h 활동 (last_online_at), kill_time NULL 아닌 표본
    const rs = [
      { label: '일반 사냥터', col: 'recent_avg_kill_time_sec' },
      { label: '시공의 균열', col: 'recent_avg_kill_time_rift_sec' },
    ];
    for (const r of rs) {
      console.log(`【${r.label}】`);
      const q = await c.query(`
        SELECT class_name,
               COUNT(*)::int AS chars,
               ROUND(AVG(${r.col})::numeric, 2) AS avg_sec,
               ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${r.col})::numeric, 2) AS median_sec,
               ROUND(MIN(${r.col})::numeric, 2) AS min_sec,
               ROUND(MAX(${r.col})::numeric, 2) AS max_sec,
               ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY ${r.col})::numeric, 2) AS p25,
               ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY ${r.col})::numeric, 2) AS p75
        FROM characters
        WHERE level >= 100
          AND ${r.col} IS NOT NULL
          AND ${r.col} > 0
          AND last_online_at > now() - interval '7 days'
        GROUP BY class_name
        ORDER BY avg_sec ASC
      `);
      console.log('class       chars   avg     median    p25     p75     min     max');
      console.log('────────────────────────────────────────────────────────────────────');
      for (const row of q.rows) {
        console.log(
          `${row.class_name.padEnd(10)}  ${String(row.chars).padStart(5)}   ${String(row.avg_sec).padStart(5)}    ${String(row.median_sec).padStart(5)}     ${String(row.p25).padStart(5)}    ${String(row.p75).padStart(5)}    ${String(row.min_sec).padStart(5)}    ${String(row.max_sec).padStart(5)}`
        );
      }
      console.log();
    }

    // 환산: 마리당 초 → 분당 마리수 → 1초당 처치 비례 DPS 점수
    console.log('━━━ 환산 (1마리당 초 → 분당 처치수, 도적=1.00 기준 상대값) ━━━\n');
    for (const r of rs) {
      const q = await c.query(`
        SELECT class_name, AVG(${r.col})::numeric AS avg_sec, COUNT(*)::int AS chars
        FROM characters
        WHERE level >= 100 AND ${r.col} IS NOT NULL AND ${r.col} > 0
          AND last_online_at > now() - interval '7 days'
        GROUP BY class_name
      `);
      const rogue = q.rows.find(r=>r.class_name==='rogue');
      console.log(`【${r.label}】`);
      console.log('class       avg_sec/마리   분당 마리수    상대 DPS (도적=1.00)');
      console.log('──────────────────────────────────────────────────────────────');
      for (const row of q.rows.sort((a,b)=>Number(a.avg_sec)-Number(b.avg_sec))) {
        const sec = Number(row.avg_sec);
        const perMin = (60/sec).toFixed(2);
        const rel = rogue ? (Number(rogue.avg_sec)/sec).toFixed(3) : '-';
        console.log(`${row.class_name.padEnd(10)}    ${sec.toFixed(2).padStart(7)}        ${perMin.padStart(6)}         ${rel}`);
      }
      console.log();
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
