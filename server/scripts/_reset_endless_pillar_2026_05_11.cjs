// 종언의 기둥 전체 초기화 — 순위 + 등반 (보상 미지급)
// - endless_pillar_progress: current_floor=1, paused=true, daily/highest = 0
// - endless_pillar_floor_log: 전체 삭제 (랭킹 동점/통계용)
// - 진행 중 캐릭: location='village', combat_sessions(field=1000) 삭제
// - total_kills / total_deaths: 보존 (사용자 미지정)
// - endless_pillar_daily_rewards: 감사 로그라 보존
const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 사전 확인
    const before = await c.query(`
      SELECT COUNT(*) FILTER (WHERE current_floor > 1) AS climbing,
             COUNT(*) FILTER (WHERE highest_floor > 0) AS ranked,
             COUNT(*) FILTER (WHERE daily_highest_floor > 0) AS daily_ranked,
             MAX(highest_floor) AS top_floor,
             MAX(daily_highest_floor) AS top_daily
        FROM endless_pillar_progress
    `);
    const flogR = await c.query(`SELECT COUNT(*)::int AS n FROM endless_pillar_floor_log`);
    const activeR = await c.query(`
      SELECT COUNT(*)::int AS n FROM characters WHERE location = 'field:1000'
    `);
    const sessR = await c.query(`SELECT COUNT(*)::int AS n FROM combat_sessions WHERE field_id = 1000`);
    console.log('=== BEFORE ===');
    console.log(' progress 현재 등반 중:    ', before.rows[0].climbing);
    console.log(' progress 역대 랭킹 보유:  ', before.rows[0].ranked, '(top', before.rows[0].top_floor, ')');
    console.log(' progress 일일 랭킹 보유:  ', before.rows[0].daily_ranked, '(top', before.rows[0].top_daily, ')');
    console.log(' floor_log 행 수:         ', flogR.rows[0].n);
    console.log(' characters field:1000:   ', activeR.rows[0].n);
    console.log(' combat_sessions field=1000:', sessR.rows[0].n);

    await c.query('BEGIN');
    try {
      // 진행 + 랭킹 초기화 (total_kills/deaths 는 보존)
      const upd = await c.query(`
        UPDATE endless_pillar_progress
           SET current_floor = 1,
               current_hp = 0,
               paused = TRUE,
               highest_floor = 0,
               daily_highest_floor = 0,
               daily_highest_at = NULL,
               last_updated = NOW()
      `);
      console.log(`[reset] endless_pillar_progress: ${upd.rowCount} 행`);

      // 층 클리어 로그 전체 삭제
      const del = await c.query(`DELETE FROM endless_pillar_floor_log`);
      console.log(`[reset] endless_pillar_floor_log delete: ${del.rowCount} 행`);

      // 진행 중 캐릭 → 마을로
      const loc = await c.query(`
        UPDATE characters SET location = 'village'
         WHERE location = 'field:1000'
      `);
      console.log(`[reset] characters location field:1000 → village: ${loc.rowCount} 행`);

      // 활성 전투 세션 row 삭제 (서버 재시작 후 미복원)
      const sess = await c.query(`DELETE FROM combat_sessions WHERE field_id = 1000`);
      console.log(`[reset] combat_sessions field=1000 delete: ${sess.rowCount} 행`);

      await c.query('COMMIT');
      console.log('=== COMMIT 완료 ===');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }

    // 사후 확인
    const after = await c.query(`
      SELECT COUNT(*) FILTER (WHERE current_floor > 1) AS climbing,
             COUNT(*) FILTER (WHERE highest_floor > 0) AS ranked,
             COUNT(*) FILTER (WHERE daily_highest_floor > 0) AS daily_ranked
        FROM endless_pillar_progress
    `);
    const flogA = await c.query(`SELECT COUNT(*)::int AS n FROM endless_pillar_floor_log`);
    const activeA = await c.query(`SELECT COUNT(*)::int AS n FROM characters WHERE location = 'field:1000'`);
    const sessA = await c.query(`SELECT COUNT(*)::int AS n FROM combat_sessions WHERE field_id = 1000`);
    console.log('=== AFTER ===');
    console.log(' progress 등반 중:        ', after.rows[0].climbing);
    console.log(' progress 역대 랭킹:      ', after.rows[0].ranked);
    console.log(' progress 일일 랭킹:      ', after.rows[0].daily_ranked);
    console.log(' floor_log:               ', flogA.rows[0].n);
    console.log(' characters field:1000:   ', activeA.rows[0].n);
    console.log(' combat_sessions:         ', sessA.rows[0].n);
    console.log('\n★ 서버 재시작 필요 (인메모리 endlessFloor 클리어) — Railway 푸시로 redeploy 트리거');
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
