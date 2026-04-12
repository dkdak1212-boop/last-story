const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 전쟁의 함성 정상 작동 (전사 Lv.40)';
const BODY = `전사 스킬 "전쟁의 함성"이 설명대로 ATK 40% 증가 버프로 정상 작동합니다.

■ 문제
- 기존: 설명은 "ATK 40% 증가"였으나 실제로는 "받는 데미지 40% 감소"(방어 버프)로 잘못 동작.
- 엔진에 플레이어 공격력 증가 버프 타입(atk_buff) 자체가 없었음.

■ 수정
- atk_buff effect 타입 신설 → 데미지 계산 시 (1 + value/100) 배율 적용.
- 전쟁의 함성을 atk_buff 40% / 3행동으로 재등록.
- 전투 화면 버프 아이콘에 "공격+" 표시 추가.

■ 영향
- 전사가 자기 강화 사이클(40레벨~)을 정상적으로 활용할 수 있게 됩니다.
- 쿨다운 7행동, 지속 3행동 — 사이클 중 ~43% 시간 동안 +40% ATK.

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
