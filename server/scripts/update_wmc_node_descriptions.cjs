// 전사·마법사·성직자 전용 노드 102개의 description 일괄 업데이트.
// 이름+zone 으로 매칭. 기존 효과는 건드리지 않고 description 만 채움.

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

// [zone, name, description]
const ROWS = [
  // ── 전사 광전사 (north_warrior_berserk) ──
  ['north_warrior_berserk', '격노의 근력 1', '힘 +4'],
  ['north_warrior_berserk', '격노의 근력 2', '힘 +4'],
  ['north_warrior_berserk', '격노의 근력 3', '힘 +4'],
  ['north_warrior_berserk', '격노의 일격 1', '공격력 +2%'],
  ['north_warrior_berserk', '격노의 일격 2', '공격력 +2%'],
  ['north_warrior_berserk', '격노의 예감 1', '치명타 +3'],
  ['north_warrior_berserk', '격노의 예감 2', '치명타 +3'],
  ['north_warrior_berserk', '출혈 강화 1', '출혈 도트 데미지 +15%'],
  ['north_warrior_berserk', '출혈 강화 2', '출혈 도트 데미지 +15%'],
  ['north_warrior_berserk', '깊은 상처', '도트 지속 시간 +1행동'],
  ['north_warrior_berserk', '광기의 충동', '스킬 적중 시 10% 확률로 다음 스킬 데미지 +30%'],
  ['north_warrior_berserk', '광전사의 본능', '공격력 +5%'],
  ['north_warrior_berserk', '분노의 파동', '키스톤 — 체력 70% 이하일 때 공격력 +50% (상시)'],
  ['north_warrior_berserk', '광폭한 일격', '치명타 +5'],
  ['north_warrior_berserk', '피의 갈증', '몬스터 처치 시 최대 체력 5% 회복'],
  ['north_warrior_berserk', '야성의 분노', '공격력 +4%'],
  ['north_warrior_berserk', '폭발하는 분노', '키스톤 — 최대 체력이 35%로 고정되고 공격력 +50% / 받는 데미지 30% 감소 (곱연산)'],

  // ── 전사 수호자 (north_warrior_guard) ──
  ['north_warrior_guard', '강철의 살결 1', '최대 체력 +50'],
  ['north_warrior_guard', '강철의 살결 2', '최대 체력 +50'],
  ['north_warrior_guard', '강철의 살결 3', '최대 체력 +50'],
  ['north_warrior_guard', '굳건한 의지 1', '최대 체력 +80'],
  ['north_warrior_guard', '굳건한 의지 2', '최대 체력 +80'],
  ['north_warrior_guard', '강건한 체력 1', '활력 +5 (방어력·최대 체력 동시 상승)'],
  ['north_warrior_guard', '강건한 체력 2', '활력 +5 (방어력·최대 체력 동시 상승)'],
  ['north_warrior_guard', '견고한 방어 1', '활력 +10'],
  ['north_warrior_guard', '견고한 방어 2', '활력 +12'],
  ['north_warrior_guard', '도발의 의지', '활력 +15 (도발 메커니즘 없어 방어 강화로 대체)'],
  ['north_warrior_guard', '흔들림 없는 자세', '받는 데미지 -5%'],
  ['north_warrior_guard', '수호의 본능', '방어력 +10%'],
  ['north_warrior_guard', '강철의 의지', '키스톤 — 체력 30% 이하일 때 받는 데미지 -50% (상시)'],
  ['north_warrior_guard', '반격', '피격 시 50% 확률로 본체 평타 1회 즉시 발동 (치명타·방어 적용)'],
  ['north_warrior_guard', '방벽 강화', '흡수형 방벽 효과 +20%'],
  ['north_warrior_guard', '불굴의 정신', '받는 데미지 -8%'],
  ['north_warrior_guard', '응징의 방벽', '키스톤 — 피격 시 다음 스킬 데미지 +60% 누적 (최대 3 중첩, 스킬 사용 시 소진)'],

  // ── 마법사 일타 폭딜 (north_mage_burst) ──
  ['north_mage_burst', '정련된 지능 1', '지능 +5'],
  ['north_mage_burst', '정련된 지능 2', '지능 +5'],
  ['north_mage_burst', '정련된 지능 3', '지능 +5'],
  ['north_mage_burst', '마력의 응축 1', '마법공격력 +2%'],
  ['north_mage_burst', '마력의 응축 2', '마법공격력 +2%'],
  ['north_mage_burst', '한 발의 정수 1', '치명타 +3'],
  ['north_mage_burst', '한 발의 정수 2', '치명타 +3'],
  ['north_mage_burst', '폭격의 증폭 1', '스킬 데미지 +10%'],
  ['north_mage_burst', '폭격의 증폭 2', '스킬 데미지 +10%'],
  ['north_mage_burst', '정확한 시전', '민첩 +20 (명중·치명·회피 상승)'],
  ['north_mage_burst', '치명적 마법', '치명타 데미지 +15%'],
  ['north_mage_burst', '충전된 일격', '5행동마다 다음 스킬 데미지 +30%'],
  ['north_mage_burst', '일점 폭발', '키스톤 — 모든 스킬 데미지 +50% (상시, 단일 대상 1대1 전투에 항상 적용)'],
  ['north_mage_burst', '압도적 권능', '마법공격력 +4%'],
  ['north_mage_burst', '회심의 일격', '치명타 +8'],
  ['north_mage_burst', '영혼의 권능', '지능 +12'],
  ['north_mage_burst', '종결의 일격', '키스톤 — 몬스터 처치 시 다음 스킬 데미지 +100% (2행동 유지, 다음 스킬로 적 처치 시 즉시 스택 소진)'],

  // ── 마법사 지속 도트 (north_mage_dot) ──
  ['north_mage_dot', '부패의 마법 1', '지능 +5'],
  ['north_mage_dot', '부패의 마법 2', '지능 +5'],
  ['north_mage_dot', '부패의 마법 3', '지능 +5'],
  ['north_mage_dot', '끈질긴 시전 1', '마법공격력 +2%'],
  ['north_mage_dot', '끈질긴 시전 2', '마법공격력 +2%'],
  ['north_mage_dot', '침식의 권능 1', '모든 도트 데미지 +50%'],
  ['north_mage_dot', '침식의 권능 2', '모든 도트 데미지 +50%'],
  ['north_mage_dot', '화염 강화 1', '화상 도트 데미지 +50%'],
  ['north_mage_dot', '마법 강화', '스킬 데미지 +20%'],
  ['north_mage_dot', '화염 강화 2', '화상 도트 데미지 +50%'],
  ['north_mage_dot', '깊이 새기는 저주', '모든 도트 지속 시간 +3행동'],
  ['north_mage_dot', '침식의 가속', '모든 도트 데미지 +10%'],
  ['north_mage_dot', '도트 과부하', '키스톤 — 도트가 1종 이상 적용된 적에게 데미지 +40% (상시)'],
  ['north_mage_dot', '영원한 침식', '모든 도트 데미지 +75%'],
  ['north_mage_dot', '침투하는 권능', '마법공격력 +4%'],
  ['north_mage_dot', '부패의 영혼', '지능 +15'],
  ['north_mage_dot', '도트 폭발', '키스톤 — 도트 적용된 적 처치 시 잔여 도트 데미지 3배로 다음 적에게 전파 (도트 데미지로 처치된 경우는 추가 전파 없음 · 무한 전파 방지)'],

  // ── 성직자 수호 (north_cleric_guard) ──
  ['north_cleric_guard', '신성한 살결 1', '최대 체력 +60'],
  ['north_cleric_guard', '신성한 살결 2', '최대 체력 +60'],
  ['north_cleric_guard', '신성한 살결 3', '최대 체력 +60'],
  ['north_cleric_guard', '굳건한 신앙 1', '최대 체력 +80'],
  ['north_cleric_guard', '굳건한 신앙 2', '최대 체력 +80'],
  ['north_cleric_guard', '강건한 의지 1', '활력 +6 (방어력·최대 체력 동시 상승)'],
  ['north_cleric_guard', '강건한 의지 2', '활력 +6 (방어력·최대 체력 동시 상승)'],
  ['north_cleric_guard', '회복의 손길 1', '회복 효과 +15%'],
  ['north_cleric_guard', '회복의 손길 2', '회복 효과 +15%'],
  ['north_cleric_guard', '자가 치유', '회복 효과 +25%'],
  ['north_cleric_guard', '신성한 보호', '받는 데미지 -10%'],
  ['north_cleric_guard', '수호의 권능', '활력 +15'],
  ['north_cleric_guard', '신성한 보호막', '키스톤 — 피격 시 받는 데미지의 30% 만큼 즉시 자가 회복'],
  ['north_cleric_guard', '방벽 강화', '흡수형 방벽 효과 +30%'],
  ['north_cleric_guard', '흔들림 없는 신앙', '받는 데미지 -8%'],
  ['north_cleric_guard', '영원한 회복', '회복 효과 +30%'],
  ['north_cleric_guard', '부서지지 않는 신앙', '키스톤 — 체력 50% 이하 도달 시 5행동 동안 받는 데미지 -60% (종료 후 5행동 재발동 대기)'],

  // ── 성직자 광명 (north_cleric_radiant) — 지능·마법공격력 노드 없음. HP×20 스킬 강화 중심. ──
  ['north_cleric_radiant', '광명의 의지 1', '최대 체력 +60 (신의 타격·천상 강림 데미지 동시 상승)'],
  ['north_cleric_radiant', '광명의 의지 2', '최대 체력 +60 (신의 타격·천상 강림 데미지 동시 상승)'],
  ['north_cleric_radiant', '광명의 의지 3', '최대 체력 +60 (신의 타격·천상 강림 데미지 동시 상승)'],
  ['north_cleric_radiant', '빛의 가속 1', '속도 +10'],
  ['north_cleric_radiant', '빛의 가속 2', '속도 +10'],
  ['north_cleric_radiant', '신성한 결의 1', '치명타 +3'],
  ['north_cleric_radiant', '신성한 결의 2', '치명타 +3'],
  ['north_cleric_radiant', '신성 권능 1', '성직자 공격 스킬 데미지 +10%'],
  ['north_cleric_radiant', '신성 권능 2', '성직자 공격 스킬 데미지 +10%'],
  ['north_cleric_radiant', '빠른 시전', '속도 +100'],
  ['north_cleric_radiant', '광명의 화살', '최대 체력 +10% (신의 타격·천상 강림 데미지 동시 상승)'],
  ['north_cleric_radiant', '강건한 신성', '최대 체력 +100'],
  ['north_cleric_radiant', '광휘의 폭발', '키스톤 — 몬스터 처치 시 15% 확률로 모든 스킬 쿨다운 즉시 초기화'],
  ['north_cleric_radiant', '신성한 정수', '성직자 공격 스킬 데미지 +20%'],
  ['north_cleric_radiant', '회심의 신성', '치명타 +8'],
  ['north_cleric_radiant', '영원한 광명', '최대 체력 +150'],
  ['north_cleric_radiant', '새벽의 사자', '키스톤 — 최대 체력 비례 스킬(신의 타격·천상 강림) 사용 시 데미지 +30%'],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    let notFound = 0;
    for (const [zone, name, desc] of ROWS) {
      const r = await client.query(
        `UPDATE node_definitions SET description = $1 WHERE zone = $2 AND name = $3`,
        [desc, zone, name]
      );
      if (r.rowCount === 0) {
        console.log('  NOT FOUND:', zone, '|', name);
        notFound++;
      } else {
        updated++;
      }
    }
    await client.query('COMMIT');
    console.log(`완료 — 업데이트 ${updated} / 미발견 ${notFound} / 총 ${ROWS.length}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('실패:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
