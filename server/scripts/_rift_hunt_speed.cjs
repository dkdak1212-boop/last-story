const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

// 균열 드랍 prefix 패턴 (rift breaker weapons / rift drop signature 단어)
// L100 균열 드랍: 사냥꾼의 반지·광부의 헬멧·회복의 부적 (균열 전용 아이템 베이스)
const RIFT_BASE_PATTERNS = ['사냥꾼의 반지', '광부의 헬멧', '회복의 부적'];

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 캐릭별 균열 드랍을 시간별로 모아 hunt rate 계산
    console.log('━━━ 클래스별 균열 사냥 속도 (최근 7일) ━━━\n');
    const sql = `
      WITH rift_drops AS (
        SELECT d.character_id, d.created_at, ch.class_name, ch.level
        FROM item_drop_log d
        JOIN characters ch ON ch.id = d.character_id
        WHERE d.created_at > now() - interval '7 days'
          AND (d.item_name LIKE '%사냥꾼의 반지%' OR d.item_name LIKE '%광부의 헬멧%' OR d.item_name LIKE '%회복의 부적%')
          AND ch.level >= 100
      ),
      per_char AS (
        SELECT character_id, class_name,
               COUNT(*)::int AS drops,
               EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60 AS span_min
        FROM rift_drops
        GROUP BY character_id, class_name
        HAVING COUNT(*) >= 20  -- 통계적 유의: 최소 20드랍
           AND EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/60 >= 30  -- 최소 30분 활동
      )
      SELECT class_name,
             COUNT(*)::int AS chars,
             ROUND(AVG(drops)::numeric, 1) AS avg_drops,
             ROUND(AVG(span_min)::numeric, 1) AS avg_span_min,
             ROUND(AVG(drops/NULLIF(span_min,0))::numeric, 3) AS drops_per_min,
             ROUND(MIN(drops/NULLIF(span_min,0))::numeric, 3) AS min_dpm,
             ROUND(MAX(drops/NULLIF(span_min,0))::numeric, 3) AS max_dpm,
             ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY drops/NULLIF(span_min,0))::numeric, 3) AS median_dpm
      FROM per_char
      GROUP BY class_name
      ORDER BY drops_per_min DESC
    `;
    const r = await c.query(sql);
    console.log('class      chars  avg_drops  avg_min  drops/min  median   min      max');
    console.log('────────────────────────────────────────────────────────────────────');
    for (const row of r.rows) {
      console.log(
        `${row.class_name.padEnd(10)} ${String(row.chars).padStart(5)}  ${String(row.avg_drops).padStart(8)}  ${String(row.avg_span_min).padStart(7)}  ${String(row.drops_per_min).padStart(8)}  ${String(row.median_dpm).padStart(6)}  ${String(row.min_dpm).padStart(6)}  ${String(row.max_dpm).padStart(6)}`
      );
    }

    // 드랍 != 처치이므로 드랍 빈도가 모든 클래스에 대해 비슷하다면 비율 비교는 OK
    // 균열 드랍률은 클래스 무관이라 가정 (아이템 시스템상 그렇다)
    console.log('\n[주]  drops/min 은 균열 사냥속도 비례 지표 (드랍률은 클래스 무관 가정)');

    // 최근 24h 동일 분석 (단기 추세)
    console.log('\n\n━━━ 최근 24시간 ━━━\n');
    const r2 = await c.query(sql.replace('7 days', '24 hours').replace('>= 20', '>= 10').replace('>= 30', '>= 20'));
    console.log('class      chars  avg_drops  avg_min  drops/min  median   min      max');
    console.log('────────────────────────────────────────────────────────────────────');
    for (const row of r2.rows) {
      console.log(
        `${row.class_name.padEnd(10)} ${String(row.chars).padStart(5)}  ${String(row.avg_drops).padStart(8)}  ${String(row.avg_span_min).padStart(7)}  ${String(row.drops_per_min).padStart(8)}  ${String(row.median_dpm).padStart(6)}  ${String(row.min_dpm).padStart(6)}  ${String(row.max_dpm).padStart(6)}`
      );
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
