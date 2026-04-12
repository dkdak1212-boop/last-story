const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 버프 스킬 전면 개편 + 잠금/우편 버그 수정';
const BODY = `■ 1. 버프 스킬 전면 개편 — "1턴 손해" 문제 해결
턴마다 스킬 1개만 사용 가능한 구조에서 자기버프 액티브들이 사실상 사용되지 않던 문제 개선.
모든 자기버프/디버프 액티브 15종이 사용 시 동시에 ATK 배율로 공격합니다.

[전사]
- 철벽: ATK x120% 동시 타격 (받는 데미지 30% 감소)
- 반격의 의지: ATK x150% 동시 타격 (반사 50%)
- 전쟁의 함성: ATK x180% 동시 타격 (자신 ATK +40% 3행동)
- 전장의 포효: ATK x220% 동시 타격 (자신 스피드 +40%)
- 갑옷 분쇄: ATK x250% 동시 타격 (적 스피드 -50%)

[마법사]
- 빙결 감옥: MATK x150% (적 게이지 동결)
- 마력 집중: MATK x250% (자신 스피드 +50%)
- 시간 왜곡: MATK x220% (적 게이지 동결)

[성직자]
- 신성 방벽: ATK x120% (실드)
- 신의 가호: ATK x150% (반사)
- 천상의 방벽: ATK x200% (실드 + 감소)
- 신의 축복: ATK x220% (받는 데미지 감소)

[도적]
- 연막탄: ATK x130% (적 게이지/명중률 감소)
- 독안개: ATK x180% (명중 -40% + 독)
- 맹독의 안개: ATK x250% (명중 -50% + 독)

또한 버프 스킬은 이미 같은 버프가 걸려 있어도 사용 가능합니다 (데미지 손해 없음).

■ 2. 무기 잠금 무시 전체판매 버그 수정 (긴급)
장착 상태에서 잠근 장비를 해제 후 인벤토리로 옮기면 잠금이 풀려 전체판매로 사라지던 치명적 버그 수정.
이제 장착-해제 / 장착-교체 모두 잠금이 정확히 보존됩니다.
※ 이미 사라진 장비 보상이 필요한 분은 별도 신청해 주세요.

■ 3. 우편 품질 0 고정 버그 수정
가방이 가득 차서 드랍 장비가 우편으로 발송될 때 품질·접두사가 0/없음으로 고정되던 문제 수정.
이제 인벤토리에 들어갔을 때와 동일하게 접두사·품질이 보존된 채 우편으로 도착합니다.

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
