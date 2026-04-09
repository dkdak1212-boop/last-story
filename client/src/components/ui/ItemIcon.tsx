// 아이템 등급/슬롯에 따른 DCSS 픽셀아트 아이콘
const ICON_MAP: Record<string, Record<string, string>> = {
  weapon: {
    common: '/images/items/weapon/short_sword1.png',
    rare: '/images/items/weapon/long_sword1.png',
    epic: '/images/items/weapon/greatsword1.png',
    legendary: '/images/items/weapon/demon_blade.png',
  },
  helm: {
    common: '/images/items/helm/hat1.png',
    rare: '/images/items/helm/helmet1.png',
    epic: '/images/items/helm/helmet2.png',
    legendary: '/images/items/helm/elven_leather_helm.png',
  },
  chest: {
    common: '/images/items/armor/leather_armour1.png',
    rare: '/images/items/armor/chain_mail1.png',
    epic: '/images/items/armor/plate1.png',
    legendary: '/images/items/armor/crystal_plate.png',
  },
  boots: {
    common: '/images/items/boots/boots1.png',
    rare: '/images/items/boots/boots2.png',
    epic: '/images/items/boots/boots_ego1.png',
    legendary: '/images/items/boots/boots_ego2.png',
  },
  ring: {
    common: '/images/items/ring/iron.png',
    rare: '/images/items/ring/bronze.png',
    epic: '/images/items/ring/silver.png',
    legendary: '/images/items/ring/gold.png',
  },
  amulet: {
    common: '/images/items/amulet/copper.png',
    rare: '/images/items/amulet/emerald.png',
    epic: '/images/items/amulet/sapphire.png',
    legendary: '/images/items/amulet/diamond.png',
  },
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

export function getItemIconPath(slot: string | null | undefined, grade: string, itemName?: string): string {
  if (itemName && CONSUMABLE_ICON[itemName]) return CONSUMABLE_ICON[itemName];
  if (!slot) return FALLBACK;
  return ICON_MAP[slot]?.[grade] || ICON_MAP[slot]?.common || FALLBACK;
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
