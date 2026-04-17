const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 성직자 실드 스킬 전부 중첩';
const BODY = `성직자의 3종 실드 스킬이 이제 독립적으로 중첩됩니다.

■ 대상 스킬
- 신성 방벽 (최대 HP 25%)
- 천상의 방벽 (최대 HP 50%)
- 신성의 갑주 (최대 HP 80%)

■ 변경 전
- 동일 행동에 1종만 발동 (우선순위: 갑주 > 방벽 > 신성 방벽)
- 기존 실드 활성 중엔 다른 실드 재시전 차단

■ 변경 후
- 준비된 실드 스킬은 쿨다운에 맞춰 전부 시전
- 여러 실드가 동시에 활성화되며 각자 독립적으로 데미지 흡수
- 받는 데미지는 활성 실드를 순차적으로 소모하며 감소
- 심판의 철퇴 / 대심판의 철퇴의 "실드량 비례" 추가 데미지는 모든 활성 실드의 합산값 기준으로 계산

■ 영향
- 성직자 생존력 대폭 상승 — 최대 HP의 155%까지 실드 누적 가능
- 심판 계열 폭딜 사이클 상향 (8배 배율 × 합산 실드량)

쾌적한 사냥 되세요!`;

(async () => {
  const adminRow = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  const authorId = adminRow.rows[0]?.id ?? null;
  await pool.query(
    `INSERT INTO announcements (title, body, priority, expires_at, author_id, active)
     VALUES ($1, $2, 'important', NOW() + INTERVAL '7 days', $3, TRUE)`,
    [TITLE, BODY, authorId]
  );
  console.log('공지 등록 완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
