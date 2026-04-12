const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

// 패턴 B: 자기버프/디버프 스킬에 damage_mult 부여 → 1턴 손해 제거
// (heal_pct/gauge_*/poison_burst/resurrect/invincible/stun/신성사슬/shield 류는 즉발 효과가 페이백이므로 제외)
const PATTERNS = [
  // 전사
  { class: 'warrior', name: '철벽',           mult: 1.20, descSuffix: ' (ATK x120% 동시 타격)' },
  { class: 'warrior', name: '반격의 의지',     mult: 1.50, descSuffix: ' (ATK x150% 동시 타격)' },
  { class: 'warrior', name: '전쟁의 함성',     mult: 1.80, descSuffix: ' (ATK x180% 동시 타격)' },
  { class: 'warrior', name: '전장의 포효',     mult: 2.20, descSuffix: ' (ATK x220% 동시 타격)' },
  { class: 'warrior', name: '갑옷 분쇄',       mult: 2.50, descSuffix: ' (ATK x250% 동시 타격)' },
  // 마법사
  { class: 'mage',    name: '빙결 감옥',       mult: 1.50, descSuffix: ' (MATK x150% 동시 타격)' },
  { class: 'mage',    name: '마력 집중',       mult: 2.50, descSuffix: ' (MATK x250% 동시 타격)' },
  { class: 'mage',    name: '시간 왜곡',       mult: 2.20, descSuffix: ' (MATK x220% 동시 타격)' },
  // 성직자
  { class: 'cleric',  name: '신성 방벽',       mult: 1.20, descSuffix: ' (ATK x120% 동시 타격)' },
  { class: 'cleric',  name: '신의 가호',       mult: 1.50, descSuffix: ' (ATK x150% 동시 타격)' },
  { class: 'cleric',  name: '천상의 방벽',     mult: 2.00, descSuffix: ' (ATK x200% 동시 타격)' },
  { class: 'cleric',  name: '신의 축복',       mult: 2.20, descSuffix: ' (ATK x220% 동시 타격)' },
  // 도적
  { class: 'rogue',   name: '연막탄',         mult: 1.30, descSuffix: ' (ATK x130% 동시 타격)' },
  { class: 'rogue',   name: '독안개',         mult: 1.80, descSuffix: ' (ATK x180% 동시 타격)' },
  { class: 'rogue',   name: '맹독의 안개',     mult: 2.50, descSuffix: ' (ATK x250% 동시 타격)' },
];

(async () => {
  for (const p of PATTERNS) {
    const r = await pool.query(
      `UPDATE skills
         SET damage_mult = $1,
             description = description || $2
       WHERE class_name = $3 AND name = $4
         AND (damage_mult IS NULL OR damage_mult = 0)`,
      [p.mult, p.descSuffix, p.class, p.name]
    );
    console.log(`[${p.class}] ${p.name}: ${r.rowCount}행 (mult=${p.mult})`);
  }
  await pool.end();
  console.log('완료');
})().catch(e => { console.error(e); process.exit(1); });
