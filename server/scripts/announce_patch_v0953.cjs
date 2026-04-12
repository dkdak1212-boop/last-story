const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 버프 자유 행동 + 레벨차 EXP + PvP 슬롯순서';
const BODY = `■ 1. 버프류 스킬 = 자유 행동 (큰 변경)
신성 방벽, 전쟁의 함성, 천상의 방벽 등 kind='buff' 12종 스킬이 더 이상 턴을 소모하지 않습니다. 매 행동마다 슬롯 순서대로 사용 가능한 모든 버프가 자동 발동된 뒤, 메인 딜 스킬 1개가 시전됩니다. 쿨다운은 정상 적용.

이전 패치에서 "버프 + 동시 데미지"로 1턴 손해를 보상하던 B 패턴은 자유 행동화로 불필요해져 제거되었습니다. 첫공격 접두사가 버프 스킬에 소비되던 부작용도 같이 해소.

대상: 신성 방벽/신의 가호/부활의 기적/천상의 방벽/신의 축복/마력 집중/백스텝/그림자 은신/철벽/반격의 의지/전쟁의 함성/전장의 포효

■ 2. 레벨차 EXP 페널티 추가
저레벨 사냥터 farming 방지. 캐릭터가 몬스터보다 레벨이 높을수록 EXP 감소:
- 0~9 차이: 100% (페널티 없음)
- 10~11: 70%
- 12~14: 50%
- 15~17: 30%
- 18~19: 15%
- 20+: 10% (최저)

페널티 적용 시 전투 로그에 표시됩니다. 온라인/오프라인 양쪽 동일 적용.

■ 3. PvP 스킬 슬롯 순서 적용
PvP 시뮬레이터가 "가장 강한 스킬만 골라 쓰던" 동작을 슬롯 순서로 변경. 필드 사냥과 동일하게 사용자가 설정한 우선순위를 존중합니다.

■ 4. 회귀 수정
- 신성방벽-심판철퇴 사이클 복구 (어제 보고)
- 첫공격 접두사가 버프 스킬에서 소비되던 문제 해소

쾌적한 사냥 되세요!`;

(async () => {
  const adminRow = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  const authorId = adminRow.rows[0]?.id ?? null;
  await pool.query(
    `INSERT INTO announcements (title, body, priority, expires_at, author_id, active)
     VALUES ($1, $2, 'urgent', NOW() + INTERVAL '10 days', $3, TRUE)`,
    [TITLE, BODY, authorId]
  );
  console.log('공지 등록 완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
