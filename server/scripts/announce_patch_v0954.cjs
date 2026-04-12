const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 인벤토리 반지/목걸이 탭 + 거래소 개편';
const BODY = `■ 인벤토리
가방 탭에 "반지" / "목걸이" 카테고리가 분리되어 추가되었습니다. 기존엔 액세서리가 한데 섞여 있어 찾기가 불편했던 점 해소.

■ 거래소
1. 등록 한도: 계정당 동시 활성 등록 5개로 제한 (모든 캐릭터 합산)
2. 품질 검색: 0~100% 범위로 필터링 가능
3. 접두사 검색: 공격력/마법공격/HP/도트증폭/경험치 등 20종의 접두사 stat_key로 필터링
4. 30제 이상 유니크가 목록에 안 보이던 버그 수정 — 정렬이 "낮은 레벨순 + 1000개 제한"이라 고레벨 매물이 잘려나가던 문제. 이제 등록 최신순 + 5000개로 변경, 유니크 탭은 모든 유니크 매물을 직접 필터링하여 표시.

쾌적한 거래 되세요!`;

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
