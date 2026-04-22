// 아이템 이름 기반 DCSS 픽셀아트 매핑
// 무기는 서브타입(검/단검/대검/지팡이/홀) + 티어로, 방어구는 티어로, 유니크는 개별 지정

// 티어 순서 (낮은 레벨 → 높은 레벨)
const TIER_ORDER = [
  '견습', '훈련용', '일반', '정교한', '정련된', '단단한', '강철', '정예', '영웅', '전설', '신화',
];

function getTierIndex(name: string): number {
  for (let i = 0; i < TIER_ORDER.length; i++) {
    if (name.includes(TIER_ORDER[i])) return i;
  }
  return -1;
}

// ───── 무기 ─────
const SWORD_TIERS = [
  '/images/items/weapon/short_sword1.png',   // 견습
  '/images/items/weapon/short_sword2.png',   // 훈련용
  '/images/items/weapon/long_sword1.png',    // 일반
  '/images/items/weapon/long_sword2.png',    // 정교한
  '/images/items/weapon/long_sword3.png',    // 정련된
  '/images/items/weapon/falchion1.png',      // 단단한
  '/images/items/weapon/scimitar1.png',      // 강철
  '/images/items/weapon/rapier1.png',        // 정예
  '/images/items/weapon/double_sword.png',   // 영웅
  '/images/items/weapon/demon_blade.png',    // 전설
  '/images/items/weapon/demon_blade2.png',   // 신화
];
const GREATSWORD_TIERS = [
  '/images/items/weapon/broad_axe1.png',
  '/images/items/weapon/battle_axe1.png',
  '/images/items/weapon/battle_axe2.png',
  '/images/items/weapon/halberd1.png',
  '/images/items/weapon/bardiche1.png',
  '/images/items/weapon/greatsword1.png',
  '/images/items/weapon/greatsword2.png',
  '/images/items/weapon/bardiche1.png',
  '/images/items/weapon/greatsword2.png',
  '/images/items/weapon/demon_blade2.png',
  '/images/items/weapon/demon_blade2.png',
];
const DAGGER_TIERS = [
  '/images/items/weapon/dagger.png',
  '/images/items/weapon/dagger.png',
  '/images/items/weapon/dagger2.png',
  '/images/items/weapon/dagger2.png',
  '/images/items/weapon/dagger3.png',
  '/images/items/weapon/dagger3.png',
  '/images/items/weapon/rapier1.png',
  '/images/items/weapon/rapier1.png',
  '/images/items/weapon/scimitar1.png',
  '/images/items/weapon/demon_blade.png',
  '/images/items/weapon/demon_blade.png',
];
const STAFF_TIERS = [
  '/images/items/staff/staff00.png',
  '/images/items/staff/staff00.png',
  '/images/items/staff/staff01.png',
  '/images/items/staff/staff01.png',
  '/images/items/staff/staff02.png',
  '/images/items/staff/staff02.png',
  '/images/items/staff/staff03.png',
  '/images/items/staff/staff03.png',
  '/images/items/staff/staff04.png',
  '/images/items/staff/staff04.png',
  '/images/items/staff/staff04.png',
];
// 소환사 무기 (구슬) — 모든 티어 흰색(배틀스피어) 단일 아이콘 통일
const ORB_ICON = '/images/skills/spells/battlesphere.png';
const ORB_TIERS = Array(11).fill(ORB_ICON);
const MACE_TIERS = [
  '/images/items/weapon/morningstar1.png',
  '/images/items/weapon/morningstar1.png',
  '/images/items/weapon/eveningstar1.png',
  '/images/items/weapon/eveningstar1.png',
  '/images/items/weapon/eveningstar2.png',
  '/images/items/weapon/eveningstar2.png',
  '/images/items/weapon/trident1.png',
  '/images/items/weapon/trident1.png',
  '/images/items/weapon/demon_trident.png',
  '/images/items/weapon/demon_trident.png',
  '/images/items/weapon/demon_trident.png',
];

// ───── 방어구 ─────
const ARMOR_TIERS = [
  '/images/items/armor/leather_armour1.png',
  '/images/items/armor/leather_armour2.png',
  '/images/items/armor/ring_mail1.png',
  '/images/items/armor/scale_mail1.png',
  '/images/items/armor/chain_mail1.png',
  '/images/items/armor/chain_mail2.png',
  '/images/items/armor/plate1.png',
  '/images/items/armor/plate2.png',
  '/images/items/armor/plate3.png',
  '/images/items/armor/crystal_plate.png',
  '/images/items/armor/golden_dragon_armour.png',
];
const HELM_TIERS = [
  '/images/items/helm/hat1.png',
  '/images/items/helm/hat2.png',
  '/images/items/helm/hat3.png',
  '/images/items/helm/elven_leather_helm.png',
  '/images/items/helm/helmet1.png',
  '/images/items/helm/helmet1.png',
  '/images/items/helm/helmet2.png',
  '/images/items/helm/helmet2.png',
  '/images/items/helm/helmet3.png',
  '/images/items/helm/helmet3.png',
  '/images/items/helm/helmet3.png',
];
const BOOTS_TIERS = [
  '/images/items/boots/boots1.png',
  '/images/items/boots/boots1.png',
  '/images/items/boots/boots1.png',
  '/images/items/boots/boots2.png',
  '/images/items/boots/boots2.png',
  '/images/items/boots/boots2.png',
  '/images/items/boots/boots_ego1.png',
  '/images/items/boots/boots_ego1.png',
  '/images/items/boots/boots_ego2.png',
  '/images/items/boots/boots_ego2.png',
  '/images/items/boots/boots_ego2.png',
];
const RING_TIERS = [
  '/images/items/ring/iron.png',
  '/images/items/ring/iron.png',
  '/images/items/ring/bronze.png',
  '/images/items/ring/coral.png',
  '/images/items/ring/agate.png',
  '/images/items/ring/jade.png',
  '/images/items/ring/silver.png',
  '/images/items/ring/moonstone.png',
  '/images/items/ring/emerald.png',
  '/images/items/ring/gold.png',
  '/images/items/ring/diamond.png',
];
const AMULET_TIERS = [
  '/images/items/amulet/copper.png',
  '/images/items/amulet/copper.png',
  '/images/items/amulet/silver.png',
  '/images/items/amulet/jade.png',
  '/images/items/amulet/emerald.png',
  '/images/items/amulet/pearl.png',
  '/images/items/amulet/sapphire.png',
  '/images/items/amulet/ruby.png',
  '/images/items/amulet/platinum.png',
  '/images/items/amulet/golden.png',
  '/images/items/amulet/diamond.png',
];

// ───── 유니크 / 네임드 세트 이름 기반 직접 매핑 ─────
const NAMED_ICON: Record<string, string> = {
  // 유니크
  '늑대왕의 가죽': '/images/items/armor/leather_armour2.png',
  '광부의 헬멧': '/images/items/helm/helmet1.png',
  '모래폭풍의 장화': '/images/items/boots/boots_ego1.png',
  '용암의 인장': '/images/items/ring/coral.png',
  '마그마의 룬': '/images/items/ring/moonstone.png',
  '고대 현자의 부적': '/images/items/amulet/jade.png',
  '심연의 갑옷': '/images/items/armor/plate2.png',
  '와이번의 투구': '/images/items/helm/helmet3.png',
  '황혼의 장화': '/images/items/boots/boots_ego2.png',
  '신성한 사슬': '/images/items/ring/gold.png',
  '시간의 파편': '/images/items/amulet/diamond.png',

  // 발라카스 세트 (얼음 테마)
  '발라카스의 대검': '/images/items/weapon/greatsword2.png',
  '발라카스의 지팡이': '/images/items/staff/staff03.png',
  '발라카스의 홀': '/images/items/weapon/trident1.png',
  '발라카스의 단검': '/images/items/weapon/rapier1.png',
  '발라카스의 투구': '/images/items/helm/helmet2.png',
  '발라카스의 갑옷': '/images/items/armor/ice_dragon_armour.png',
  '발라카스의 장화': '/images/items/boots/boots_ego1.png',
  '발라카스의 반지': '/images/items/ring/moonstone.png',
  '발라카스의 목걸이': '/images/items/amulet/sapphire.png',

  // 카르나스 세트 (화염 테마)
  '카르나스의 대검': '/images/items/weapon/battle_axe2.png',
  '카르나스의 지팡이': '/images/items/staff/staff04.png',
  '카르나스의 홀': '/images/items/weapon/demon_trident.png',
  '카르나스의 단검': '/images/items/weapon/demon_blade.png',
  '카르나스의 투구': '/images/items/helm/helmet3.png',
  '카르나스의 갑옷': '/images/items/armor/fire_dragon_armour.png',
  '카르나스의 장화': '/images/items/boots/boots_ego2.png',
  '카르나스의 반지': '/images/items/ring/coral.png',
  '카르나스의 목걸이': '/images/items/amulet/ruby.png',

  // 아트라스 세트 (황금 테마)
  '아트라스의 대검': '/images/items/weapon/demon_blade2.png',
  '아트라스의 지팡이': '/images/items/staff/staff04.png',
  '아트라스의 홀': '/images/items/weapon/demon_trident.png',
  '아트라스의 단검': '/images/items/weapon/demon_blade.png',
  '아트라스의 투구': '/images/items/helm/helmet3.png',
  '아트라스의 갑옷': '/images/items/armor/golden_dragon_armour.png',
  '아트라스의 장화': '/images/items/boots/boots_ego2.png',
  '아트라스의 반지': '/images/items/ring/gold.png',
  '아트라스의 목걸이': '/images/items/amulet/golden.png',
};

const CONSUMABLE_ICON: Record<string, string> = {
  '작은 체력 물약': '/images/items/potion/ruby.png',
  '중급 체력 물약': '/images/items/potion/ruby.png',
  '고급 체력 물약': '/images/items/potion/ruby.png',
  '최상급 체력 물약': '/images/items/potion/ruby.png',
  '작은 마나 물약': '/images/items/potion/brilliant_blue.png',
  '중급 마나 물약': '/images/items/potion/brilliant_blue.png',
  '고급 마나 물약': '/images/items/potion/brilliant_blue.png',
  '최상급 마나 물약': '/images/items/potion/brilliant_blue.png',
};

const FALLBACK = '/images/items/misc/scroll.png';

function pickWeapon(name: string, tierIdx: number): string {
  const ti = tierIdx >= 0 ? tierIdx : 0;
  if (name.includes('대검')) return GREATSWORD_TIERS[ti] || GREATSWORD_TIERS[0];
  if (name.includes('단검')) return DAGGER_TIERS[ti] || DAGGER_TIERS[0];
  if (name.includes('지팡이')) return STAFF_TIERS[ti] || STAFF_TIERS[0];
  if (name.includes('구슬')) return ORB_TIERS[ti] || ORB_TIERS[0];
  if (name.includes('홀')) return MACE_TIERS[ti] || MACE_TIERS[0];
  if (name.includes('검')) return SWORD_TIERS[ti] || SWORD_TIERS[0];
  return SWORD_TIERS[ti] || SWORD_TIERS[0];
}

export function getItemIconPath(slot: string | null | undefined, grade: string, itemName?: string): string {
  if (!itemName) {
    // 이름 없으면 기본 슬롯 아이콘
    if (slot === 'weapon') return SWORD_TIERS[0];
    if (slot === 'helm') return HELM_TIERS[0];
    if (slot === 'chest') return ARMOR_TIERS[0];
    if (slot === 'boots') return BOOTS_TIERS[0];
    if (slot === 'ring') return RING_TIERS[0];
    if (slot === 'amulet') return AMULET_TIERS[0];
    return FALLBACK;
  }

  // 1. 네임드/유니크 직접 매핑
  if (NAMED_ICON[itemName]) return NAMED_ICON[itemName];
  // 2. 소모품
  if (CONSUMABLE_ICON[itemName]) return CONSUMABLE_ICON[itemName];
  if (!slot) return FALLBACK;

  // 3. 티어 기반
  const tierIdx = getTierIndex(itemName);
  const ti = tierIdx >= 0 ? tierIdx : 0;

  switch (slot) {
    case 'weapon': return pickWeapon(itemName, tierIdx);
    case 'helm':   return HELM_TIERS[ti] || HELM_TIERS[0];
    case 'chest':  return ARMOR_TIERS[ti] || ARMOR_TIERS[0];
    case 'boots':  return BOOTS_TIERS[ti] || BOOTS_TIERS[0];
    case 'ring':   return RING_TIERS[ti] || RING_TIERS[0];
    case 'amulet': return AMULET_TIERS[ti] || AMULET_TIERS[0];
  }

  // 4. fallback → 등급
  if (grade === 'unique') return FALLBACK;
  return FALLBACK;
}

export function ItemIcon({ slot, grade, itemName, size = 28 }: {
  slot?: string | null; grade: string; itemName?: string; size?: number;
}) {
  const src = getItemIconPath(slot, grade, itemName);
  return (
    <img src={src} alt="" width={size} height={size}
      style={{ imageRendering: 'pixelated', verticalAlign: 'middle', flexShrink: 0 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
