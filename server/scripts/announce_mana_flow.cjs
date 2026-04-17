const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const TITLE = '[패치] 마법사 고유 패시브 "마나의 흐름" 추가';
const BODY = `━━━━━━━━━━━━━━━━━━━━━━━━
◈ 마나의 흐름 (마법사 전용)
━━━━━━━━━━━━━━━━━━━━━━━━
· 스킬을 사용할 때마다 스택이 1씩 쌓입니다. (최대 5)
· 5스택 도달 시 "버스트" 상태가 발동되어 5행동 동안 모든 스킬 쿨다운을 무시하고 자유롭게 시전할 수 있습니다.
· 버스트 중에는 기존의 쿨다운 감소 패시브(cooldown_reduce / mana_flow 노드)가 적용되지 않습니다. 중복 이득 방지를 위한 조치입니다.
· 버스트가 끝나면 모든 스킬이 기본 쿨다운 상태로 돌아가며, 스택은 0부터 다시 쌓입니다.
· 전투 화면의 분노 게이지 자리 아래에 "마나의 흐름" 전용 게이지가 새로 표시됩니다. 현재 스택과 남은 버스트 행동 수를 확인할 수 있습니다.

━━━━━━━━━━━━━━━━━━━━━━━━
◈ 설계 의도
━━━━━━━━━━━━━━━━━━━━━━━━
· 전사의 "분노"처럼, 마법사도 전투를 이어갈수록 강력해지는 고유 리소스를 갖도록 추가했습니다.
· 버스트 타이밍에 고쿨다운 핵심 스킬(유성 낙하, 마력 과부하, 별의 종말 등)을 연속으로 시전하는 운영이 가능합니다.
· 기존 쿨다운 감소 빌드와 버스트 빌드가 서로 다른 방향으로 차별화되도록 의도했습니다.

━━━━━━━━━━━━━━━━━━━━━━━━
◈ 참고 사항
━━━━━━━━━━━━━━━━━━━━━━━━
· 버스트 중 시전한 스킬도 기본 쿨다운은 기록되므로, 버스트 종료 직후에는 주요 스킬이 잠시 쿨다운에 들어갑니다.
· 수동 모드에서도 정상적으로 쿨다운 무시가 적용됩니다.
· 스택/버스트 상태는 전투 세션이 유지되는 동안 계속 쌓이며, 전투 종료 시 초기화됩니다.

테스트 후 피드백 주시면 수치를 조정하겠습니다.`;

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
