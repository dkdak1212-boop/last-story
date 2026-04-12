const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // large/keystone 급 노드 전체 확인
  const r = await pool.query(`
    SELECT id, name, tier, class_exclusive, effects, description
    FROM node_definitions
    WHERE tier IN ('large', 'keystone') OR cost >= 3
    ORDER BY class_exclusive, cost DESC
  `);

  console.log(`=== 키스톤/대형 노드 ${r.rows.length}개 ===\n`);
  for (const n of r.rows) {
    console.log(`[${n.class_exclusive || '공용'}] ${n.name} (${n.tier}, ${n.cost || '?'}pt)`);
    console.log(`  현재: ${n.description}`);
    console.log(`  효과: ${JSON.stringify(n.effects)}`);
    console.log();
  }

  // 의미 통합이 필요한 노드들 수동 수정
  const fixes = {
    '마력의 흐름': '모든 스킬 쿨다운 -1행동 (추가 감소 포함)',
    '절대자의 무공': '힘 +30, 모든 스킬 쿨다운 -1행동, 치명타 데미지 +15%',
    '신속의 발': '모든 스킬 쿨다운 -1행동',
    '불멸의 방패': '체력 +30, HP 40% 이하 시 방어 +30%, 반사 데미지 +15%',
    '절대 신앙': '지능 +25, 회복량 +30%, 실드량 +30%, HP 40% 이하 시 방어 +25%',
    '신의 심판': '심판 데미지 +25%, 치명타 데미지 +20%, 치명타 흡혈 +20%',
    '그림자 왕': '민첩 +30, 치명타 확률 +5%, 치명타 데미지 +20%',
    '시공간 왜곡': '지능 +20, 게이지 제어 +50%, 동결 지속 +1행동',
    '원소의 지배자': '지능 +30, 스킬 데미지 +29%, 도트 데미지 +25%',
    '원소 폭주': '도트 지속 +40행동',
    '집중의 경지': '명중 강화, 치명타 확률 +4%, 치명타 데미지 +50%',
    '전쟁의 신': '물리 공격력 +60%',
    '불굴의 투혼': '체력 비례 공격 +30%, 방어 관통 +20%',
    '반격의 화신': '상시 피격 데미지 15% 반사',
    '광전사의 심장': '공격력 +20% (방어 -10%), 힘 +10, 속도 +6',
    '철벽의 의지': '방어력 +25%, 체력 +13',
    '맹독의 화신': '독 데미지 +40%, 도트 지속 +1행동, 독 폭발 +13%',
    '독의 군주': '독 데미지 +30%, 독 중첩 +3',
    '시간 지배자': '스피드 +100%',
    '성역의 수호자': '최대 HP +25%',
    '균형의 사도': '공격력/마법공격/방어 +10%',
    '트릭스터': '치명타 확률 +25%',
    '마력 과적': '마법공격 +25%',
    '신성한 심판자': '신성 심판 데미지 +23%',
  };

  let updated = 0;
  for (const [name, desc] of Object.entries(fixes)) {
    const u = await pool.query('UPDATE node_definitions SET description = $1 WHERE name = $2 AND description != $1', [desc, name]);
    if (u.rowCount > 0) {
      console.log(`✏️ ${name}: ${desc}`);
      updated++;
    }
  }

  console.log(`\n${updated}개 키스톤 설명 개선`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
