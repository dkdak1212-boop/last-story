const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 명중/PvP도트/EXP/노드 7종 버그 수정';
const BODY = `■ 1. 명중률 100% 빗나감 (긴급)
calcDamage가 회피만 굴리고 명중률을 무시하던 버그 수정.
명중률 80(기본)~100이 회피율을 비례 상쇄합니다. 명중률 100% = 빗맞 0% 보장.

■ 2. PvP 도트 데미지 비정상
PvP 시뮬레이터가 ATK 하드코딩 + 0.3배 멀티로 도트를 만들어 마법사·노드빌드 캐릭터의 도트가 1/4 수준이던 버그.
필드와 동일하게 useMatk 베이스 × 1.2(dot)/1.5(poison) + 방어 50% 무시 적용.

■ 3. 독안개 / 맹독의 안개 도트 미발동
설명에 "독 도트"가 있었으나 실제로는 명중률 디버프만 걸렸음. 이제 독 도트도 함께 적용됩니다.

■ 4. EXP 증가 효과 (오프라인) 미작동
오프라인 보상이 길드 EXP 버프, 장비 접두사 EXP 보너스, 골드 부스터를 적용하지 않던 버그. 이제 온라인 사냥과 동일하게 적용됩니다.

■ 5. 독의 군주 노드 역효과
ATK -15% 페널티가 다른 dot_amp 스택이 큰 빌드에서 +60% 도트 보너스보다 우세해져 도트 데미지가 오히려 감소하던 버그. ATK 페널티 완전 제거 — 이제 순수 +60% 도트 보너스 + 독 중첩 +3.

■ 6. 성직자 심판/공격 노드가 실드 데미지 미적용
신성 방벽/천상의 방벽 등 실드 스킬의 동시 데미지에 judge_amp/holy_judge 노드 보너스가 누락되던 버그. 풀 파이프라인(judge_amp, spell_amp, 접두사, 크리 추가배율) 적용으로 통일.

■ 7. 찢어진 스크롤 설명 정정
설명 "3개 모으면 복원"은 오타였습니다. 실제 노드 스크롤 +8 복원 레시피는 100개입니다. 설명을 100개로 수정.

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
