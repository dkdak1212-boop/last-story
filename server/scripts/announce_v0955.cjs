const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 성직자 실드 중첩 · 마법사 리밸런스 · 광전사 접두사 복구';
const BODY = `━━━━━━━━━━━━━━━━━━━━━━━━
◈ 성직자 실드 스킬 전부 중첩
━━━━━━━━━━━━━━━━━━━━━━━━
· 신성 방벽, 천상의 방벽, 신성의 갑주 3종이 이제 독립적으로 중첩됩니다.
· 쿨다운이 돌아오는 대로 자유 행동으로 각각 시전되어 동시에 활성화됩니다.
· 받는 데미지는 활성 실드를 순차적으로 소모합니다.
· 심판의 철퇴 / 대심판의 철퇴의 실드량 비례 추가 데미지는 모든 활성 실드의 합산값 기준으로 계산됩니다.
· 이론상 최대 HP 155%까지 실드 누적 가능.

━━━━━━━━━━━━━━━━━━━━━━━━
◈ 마법사 고유 패시브 재설계
━━━━━━━━━━━━━━━━━━━━━━━━
· 변경 전: CC(동결/기절) 걸린 적에게 스킬 데미지 +50%
· 변경 후: 도트(화상/독) 유지 중인 적에게 스킬 데미지 +30%
· 이유: 이미 CC로 잠긴 적을 더 때리는 구조라 체감이 약했음. 도트 사이클과 자연스럽게 맞물리도록 변경.

━━━━━━━━━━━━━━━━━━━━━━━━
◈ 마법사 스킬 - 마력 과부하 재설계
━━━━━━━━━━━━━━━━━━━━━━━━
· 변경 전: MATK x578% 단일 공격 (쿨다운 8)
· 변경 후: 자유 행동 자가 강화 버프
   - 자신 스피드 25% 감소 3행동
   - 디버프 중 모든 마법 데미지 +80%
   - 쿨다운 5행동 (업타임 약 60%)
· 하이리스크-하이리워드 폭주 빌드가 가능해집니다.

━━━━━━━━━━━━━━━━━━━━━━━━
◈ 접두사 "광전사" 복구
━━━━━━━━━━━━━━━━━━━━━━━━
· 발동 조건을 "적 HP 30% 이하"에서 "내 HP 30% 이하"로 되돌렸습니다.
· 원래 의도대로 저체력 상태에서 공격력이 증가합니다.

━━━━━━━━━━━━━━━━━━━━━━━━
◈ 툴팁 정리
━━━━━━━━━━━━━━━━━━━━━━━━
· 마법사 스킬 17종의 툴팁을 새 패시브에 맞게 갱신.
· 성직자 실드 3종 툴팁에 "중첩 가능" 표기 추가.

쾌적한 사냥 되세요.`;

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
