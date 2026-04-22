// 무한의 차원 (필드 21, Lv.100~105) 전용 유니크 39종 + 드롭 등록
// 유저 만렙 100 기준. 하루 1드롭 목표 → per-item chance 0.00005
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const START_ID = 800;
const REQ_LV = 100;
const DROP_CHANCE = 0.00005; // per item per kill — 두 몹 합산 ≈ 1/day
const FIELD_MONSTERS = [115, 116];

// ── 무기 (15) ──────────────────────────────────────────────
// 5직업 × 3개. class_restriction 필수.
const WEAPONS = [
  // 전사 (warrior)
  { name: '시공의 절단검',         cls: 'warrior', stats: { atk: 290, hp: 800, cri: 8 },          uniq: { atk_pct: 18, crit_dmg_pct: 25 },  desc: '공격 +18%, 치명타 데미지 +25%' },
  { name: '무한 망각의 대검',       cls: 'warrior', stats: { atk: 270, hp: 1400, vit: 25 },        uniq: { hp_pct: 15, atk_pct: 12 },         desc: '최대 HP +15%, 공격 +12%' },
  { name: '차원 분쇄자',           cls: 'warrior', stats: { atk: 305, hp: 700, cri: 6 },          uniq: { def_reduce_pct: 25, crit_dmg_pct: 30 }, desc: '적 방어 -25%, 치명타 데미지 +30%' },
  // 마법사 (mage)
  { name: '시간의 종말',           cls: 'mage',    stats: { matk: 305, hp: 700, int: 28 },        uniq: { matk_pct: 20, gauge_on_crit_pct: 25 },  desc: '마법공격 +20%, 치명타 시 게이지 +25%' },
  { name: '무한 별의 지팡이',       cls: 'mage',    stats: { matk: 290, hp: 800, int: 24 },        uniq: { matk_pct: 15, dot_amp_pct: 30 },        desc: '마법공격 +15%, 도트 +30%' },
  { name: '차원 균열의 홀',         cls: 'mage',    stats: { matk: 280, hp: 900, int: 22 },        uniq: { matk_pct: 14, crit_dmg_pct: 20, dot_amp_pct: 15 }, desc: '마법공격 +14%, 치명타 데미지 +20%, 도트 +15%' },
  // 성직자 (cleric)
  { name: '신성한 차원의 홀',       cls: 'cleric',  stats: { matk: 270, hp: 1100, int: 22 },       uniq: { matk_pct: 14, hp_regen: 100 },          desc: '마법공격 +14%, HP 재생 +100' },
  { name: '영원한 빛의 성구',       cls: 'cleric',  stats: { matk: 260, hp: 1300, vit: 20 },       uniq: { hp_pct: 18, lifesteal_pct: 25 },        desc: '최대 HP +18%, 흡혈 +25%' },
  { name: '무한의 심판',           cls: 'cleric',  stats: { matk: 285, hp: 950, def: 60 },        uniq: { matk_pct: 15, damage_taken_down_pct: 12 }, desc: '마법공격 +15%, 받는 데미지 -12%' },
  // 도적 (rogue)
  { name: '그림자 차원의 단검',     cls: 'rogue',   stats: { atk: 295, hp: 700, cri: 12, dex: 22 }, uniq: { atk_pct: 15, crit_dmg_pct: 35 },        desc: '공격 +15%, 치명타 데미지 +35%' },
  { name: '시간 조각의 단검',       cls: 'rogue',   stats: { atk: 280, hp: 750, spd: 60, dex: 20 }, uniq: { atk_pct: 12, ambush_pct: 30 },          desc: '공격 +12%, 각성 +30%' },
  { name: '무한 독의 단검',         cls: 'rogue',   stats: { atk: 285, hp: 720, dex: 24 },          uniq: { atk_pct: 13, dot_amp_pct: 40 },         desc: '공격 +13%, 도트 +40%' },
  // 소환사 (summoner)
  { name: '무한 소환의 보주',       cls: 'summoner', stats: { matk: 285, hp: 950, int: 24 },        uniq: { matk_pct: 16, hp_regen: 80 },           desc: '마법공격 +16%, HP 재생 +80' },
  { name: '차원 균열의 토템',       cls: 'summoner', stats: { matk: 270, hp: 1200, int: 22 },       uniq: { matk_pct: 13, hp_pct: 12 },             desc: '마법공격 +13%, 최대 HP +12%' },
  { name: '시공 소환술서',         cls: 'summoner', stats: { matk: 295, hp: 800, int: 26 },        uniq: { matk_pct: 18, gauge_on_crit_pct: 20 },  desc: '마법공격 +18%, 치명타 시 게이지 +20%' },
];

// ── 방어구 (16) ─────────────────────────────────────────────
// 4 슬롯(helm/chest/legs/boots) × 4
const ARMOR_SLOTS = ['helm', 'chest', 'legs', 'boots'];
const ARMOR = [];
const ARMOR_TEMPLATES = {
  helm: [
    { name: '무한 명상의 투구',    stats: { hp: 1500, def: 145, int: 18 },             uniq: { matk_pct: 12, hp_pct: 10 },              desc: '마법공격 +12%, 최대 HP +10%' },
    { name: '시공 수호자의 투구',  stats: { hp: 1700, def: 165 },                       uniq: { damage_taken_down_pct: 12, hp_regen: 60 }, desc: '받는 데미지 -12%, HP 재생 +60' },
    { name: '차원의 왕관',         stats: { hp: 1450, def: 140, atk: 90, matk: 90 },    uniq: { atk_pct: 10, matk_pct: 10 },             desc: '공격/마법공격 +10%' },
    { name: '영원의 면류관',       stats: { hp: 1550, def: 150, cri: 6 },               uniq: { crit_dmg_pct: 25, gauge_on_crit_pct: 20 }, desc: '치명타 데미지 +25%, 치명타 시 게이지 +20%' },
  ],
  chest: [
    { name: '무한 차원의 망토',    stats: { hp: 2000, def: 180 },                       uniq: { hp_pct: 15, damage_taken_down_pct: 10 }, desc: '최대 HP +15%, 받는 데미지 -10%' },
    { name: '시공 사도의 갑옷',    stats: { hp: 1800, def: 200 },                       uniq: { damage_taken_down_pct: 15, thorns_pct: 20 }, desc: '받는 데미지 -15%, 가시 +20%' },
    { name: '차원 직조자의 의복',  stats: { hp: 1700, def: 175, matk: 100 },            uniq: { matk_pct: 14, hp_regen: 70 },            desc: '마법공격 +14%, HP 재생 +70' },
    { name: '영원불멸의 갑주',     stats: { hp: 2200, def: 190 },                       uniq: { hp_pct: 18, lifesteal_pct: 20 },         desc: '최대 HP +18%, 흡혈 +20%' },
  ],
  // legs 유니크는 아직 미출시 — 제거됨 (migration 037)
  legs: [],
  boots: [
    { name: '무한 질주의 신발',    stats: { hp: 1300, def: 130, spd: 70 },              uniq: { atk_pct: 10, matk_pct: 10 },             desc: '공격/마법공격 +10%' },
    { name: '시공 침투자의 부츠',  stats: { hp: 1350, def: 135, dex: 20 },              uniq: { first_strike_pct: 30, ambush_pct: 20 }, desc: '약점간파 +30%, 각성 +20%' },
    { name: '차원 보행의 장화',    stats: { hp: 1400, def: 140, vit: 18 },              uniq: { hp_pct: 10, damage_taken_down_pct: 10 }, desc: '최대 HP +10%, 받는 데미지 -10%' },
    { name: '영원 군주의 장화',    stats: { hp: 1380, def: 138, cri: 7 },               uniq: { crit_dmg_pct: 28, gauge_on_crit_pct: 18 }, desc: '치명타 데미지 +28%, 치명타 시 게이지 +18%' },
  ],
};
for (const slot of ARMOR_SLOTS) {
  for (const tmpl of ARMOR_TEMPLATES[slot]) {
    ARMOR.push({ ...tmpl, slot });
  }
}

// ── 악세서리 (8) ────────────────────────────────────────────
// 2 슬롯(amulet/ring) × 4
const ACCESSORY = [
  // amulet
  { slot: 'amulet', name: '무한의 인장',     stats: { hp: 1100, atk: 130, matk: 130, def: 70 },   uniq: { atk_pct: 12, matk_pct: 12 },             desc: '공격/마법공격 +12%' },
  { slot: 'amulet', name: '시공의 목걸이',   stats: { hp: 1200, atk: 120, matk: 120, def: 75 },   uniq: { hp_pct: 12, gauge_on_crit_pct: 25 },     desc: '최대 HP +12%, 치명타 시 게이지 +25%' },
  { slot: 'amulet', name: '차원의 별',       stats: { hp: 1050, atk: 135, matk: 135, def: 65 },   uniq: { crit_dmg_pct: 30, dot_amp_pct: 20 },     desc: '치명타 데미지 +30%, 도트 +20%' },
  { slot: 'amulet', name: '영원의 부적',     stats: { hp: 1300, atk: 110, matk: 110, def: 80 },   uniq: { damage_taken_down_pct: 12, hp_regen: 90 }, desc: '받는 데미지 -12%, HP 재생 +90' },
  // ring
  { slot: 'ring',   name: '무한의 반지',     stats: { hp: 1050, atk: 140, matk: 140, def: 65 },   uniq: { atk_pct: 14, matk_pct: 14 },             desc: '공격/마법공격 +14%' },
  { slot: 'ring',   name: '시공의 인장반지', stats: { hp: 1100, atk: 125, matk: 125, def: 70 },   uniq: { def_reduce_pct: 22, crit_dmg_pct: 22 }, desc: '적 방어 -22%, 치명타 데미지 +22%' },
  { slot: 'ring',   name: '차원 균열의 반지', stats: { hp: 1000, atk: 145, matk: 145, def: 60 },  uniq: { ambush_pct: 30, first_strike_pct: 25 }, desc: '각성 +30%, 약점간파 +25%' },
  { slot: 'ring',   name: '영원의 봉인반지', stats: { hp: 1250, atk: 115, matk: 115, def: 75 },   uniq: { hp_pct: 14, lifesteal_pct: 25 },         desc: '최대 HP +14%, 흡혈 +25%' },
];

// 모두 합쳐서 ID 부여
const ALL = [];
let nextId = START_ID;
for (const w of WEAPONS) ALL.push({ id: nextId++, type: 'weapon',    slot: 'weapon', name: w.name, cls: w.cls, stats: w.stats, uniq: w.uniq, desc: w.desc });
for (const a of ARMOR)   ALL.push({ id: nextId++, type: 'armor',     slot: a.slot,   name: a.name, cls: null,  stats: a.stats, uniq: a.uniq, desc: a.desc });
for (const a of ACCESSORY) ALL.push({ id: nextId++, type: 'accessory', slot: a.slot, name: a.name, cls: null,  stats: a.stats, uniq: a.uniq, desc: a.desc });

(async () => {
  console.log(`총 ${ALL.length}개 유니크 INSERT 시작 (id ${START_ID}~${nextId - 1})`);

  for (const it of ALL) {
    await pool.query(
      `INSERT INTO items (id, name, type, grade, slot, stats, description, stack_size, sell_price, required_level, class_restriction, unique_prefix_stats)
       VALUES ($1, $2, $3, 'unique', $4, $5::jsonb, $6, 1, $7, $8, $9, $10::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         stats = EXCLUDED.stats,
         description = EXCLUDED.description,
         sell_price = EXCLUDED.sell_price,
         required_level = EXCLUDED.required_level,
         class_restriction = EXCLUDED.class_restriction,
         unique_prefix_stats = EXCLUDED.unique_prefix_stats`,
      [
        it.id, it.name, it.type, it.slot, JSON.stringify(it.stats),
        `[유니크] ${it.desc}`,
        50000, REQ_LV, it.cls, JSON.stringify(it.uniq),
      ]
    );
  }
  console.log(`INSERT 완료`);

  // 드롭테이블 — 두 몬스터 모두에 39종 전부 추가
  for (const mid of FIELD_MONSTERS) {
    const r = await pool.query(`SELECT drop_table FROM monsters WHERE id = $1`, [mid]);
    const cur = Array.isArray(r.rows[0].drop_table) ? r.rows[0].drop_table : [];
    const existingIds = new Set(cur.map(d => d.itemId));
    let added = 0;
    for (const it of ALL) {
      if (existingIds.has(it.id)) continue;
      cur.push({ chance: DROP_CHANCE, itemId: it.id, minQty: 1, maxQty: 1 });
      added++;
    }
    await pool.query(`UPDATE monsters SET drop_table = $1::jsonb WHERE id = $2`, [JSON.stringify(cur), mid]);
    console.log(`몬스터 ${mid}: ${added}개 드롭 추가 (전체 드롭 수 ${cur.length})`);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`아이템: ${ALL.length}종 (id ${START_ID}~${nextId - 1})`);
  console.log(`드롭률: 아이템당 ${DROP_CHANCE} (몬스터별)`);
  console.log(`기대치: 2 몹 × 250킬/일 × ${DROP_CHANCE} × ${ALL.length}종 = ${(2 * 250 * DROP_CHANCE * ALL.length).toFixed(2)} 드롭/일`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
