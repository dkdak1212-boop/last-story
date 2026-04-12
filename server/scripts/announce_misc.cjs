const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] UI 개선 + 거래소 정리 + 툴팁 전면 수정';
const BODY = `■ 스탯 분배 개선
기존 +1만 가능했던 스탯 분배에 +5 / +10 버튼이 추가되었습니다. 포인트가 부족하면 해당 버튼이 비활성됩니다.

■ 전투 로그 자동스크롤 제어
전투 로그 화면에서 휠/터치/클릭 시 자동스크롤이 5초간 멈춥니다. 과거 로그를 편하게 확인할 수 있으며, "▼ 최신 로그" 버튼으로 즉시 복귀할 수 있습니다.

■ 거래소 정리
계정당 등록 한도(10개)를 초과한 유저의 오래된 매물이 정리되었습니다. 최신 10개만 유지되고, 나머지는 우편으로 아이템이 반환됩니다. 총 319개 매물이 반환 처리되었습니다.

■ 스킬 툴팁 전면 수정
전 직업 47개 스킬의 설명을 실제 DB 데이터 기반으로 재검증했습니다. 존재하지 않는 효과, 잘못된 수치, 인코딩 깨짐이 수정되었습니다.

주요 변경:
- 분노의 일격: ATK x500%, 방어 50% 무시 (출혈 효과 제거)
- 맹독 강화: 독 스택 200% 즉시 폭발 (잘못된 ATK x0% 표기 제거)
- 강타: 자신 HP 10% 소모 (소모량만큼 추가 데미지) 표기 추가

■ 노드 설명 전면 한글화
225개 노드의 설명이 실제 효과 데이터 기반으로 재생성되었습니다. iron_will, berserker_heart, dot_resist 등 영어로 표시되던 패시브가 모두 한글로 변환되었습니다.

예시:
- iron_will +25 → 방어력 +25%
- berserker_heart +20 → 광전사 (공격 +20%, 방어 -10%)
- balance_apostle +10 → 공격/마법공격/방어 +10%
- dot_resist +15 → 도트 저항 +15%
- 쿨다운 표기 통일: '쿨다운 추가 -1' → '쿨다운 -1행동'

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
