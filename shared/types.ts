// 클라이언트·서버 공유 타입

export type ClassName =
  | 'warrior'
  | 'swordsman'
  | 'archer'
  | 'rogue'
  | 'assassin'
  | 'mage'
  | 'priest'
  | 'druid';

export type ItemGrade = 'common' | 'rare' | 'epic' | 'legendary';

export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material';

export type EquipSlot = 'weapon' | 'helm' | 'chest' | 'boots' | 'ring' | 'amulet';

export interface Stats {
  str: number;  // 힘 — 물리 공격력
  dex: number;  // 민첩 — 회피·명중
  int: number;  // 지능 — 마법 공격력·MP
  vit: number;  // 체력 — HP
  spd: number;  // 스피드 — 틱 주기
  cri: number;  // 크리 확률(%)
}

export interface PotionSettings {
  hpEnabled: boolean;
  hpThreshold: number;  // 0~100
  mpEnabled: boolean;
  mpThreshold: number;
}

export interface Character {
  id: number;
  userId: number;
  name: string;
  className: ClassName;
  level: number;
  exp: number;
  gold: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  stats: Stats;
  location: string;          // 'village' | 'field:<id>'
  lastOnlineAt: string;      // ISO timestamp
  createdAt: string;
  potionSettings: PotionSettings;
}

export interface Item {
  id: number;
  name: string;
  type: ItemType;
  grade: ItemGrade;
  slot?: EquipSlot;
  stats?: Partial<Stats>;
  description: string;
  stackSize: number;
  sellPrice: number;
  enhanceLevel?: number;
  prefixIds?: number[];
  prefixStats?: Record<string, number>;
}

export interface InventorySlot {
  slotIndex: number;
  item: Item;
  quantity: number;
  enhanceLevel: number;
  prefixIds: number[];
  prefixStats: Record<string, number>;
}

export interface Equipped {
  weapon?: Item;
  helm?: Item;
  chest?: Item;
  boots?: Item;
  ring?: Item;
  amulet?: Item;
}

export interface Monster {
  id: number;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  expReward: number;
  goldReward: number;
  stats: Stats;
  dropTable: DropEntry[];
}

export interface DropEntry {
  itemId: number;
  chance: number; // 0.0 ~ 1.0
  minQty: number;
  maxQty: number;
}

export interface Field {
  id: number;
  name: string;
  requiredLevel: number;
  monsterPool: number[];  // monster IDs
  description: string;
}

// 오프라인 보상 리포트
export interface OfflineReport {
  minutesAccounted: number;
  efficiency: number;        // 0.9 or 1.0
  killCount: number;
  expGained: number;
  goldGained: number;
  itemsDropped: { itemId: number; name: string; quantity: number; grade: ItemGrade }[];
  levelsGained: number;
  overflow: number;          // inventory overflow → mailbox count
}

// 월드 이벤트
export interface WorldEventStatus {
  active: boolean;
  eventId?: number;
  bossName?: string;
  bossLevel?: number;
  currentHp?: number;
  maxHp?: number;
  startedAt?: string;
  endsAt?: string;
  myDamage?: number;
  myRank?: number;
  myAttackCount?: number;
  leaderboard?: { rank: number; characterName: string; className: string; damage: number }[];
}

// WebSocket 메시지
export type WSMessage =
  | { type: 'chat'; channel: 'global' | 'party' | 'guild' | 'trade'; from: string; text: string }
  | { type: 'combat_log'; text: string }
  | { type: 'loot_overflow'; count: number }
  | { type: 'announcement'; title: string; body: string }
  | { type: 'world_event_start'; bossName: string; endsAt: string }
  | { type: 'world_event_end'; bossName: string; result: 'defeated' | 'expired' };
