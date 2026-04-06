// Monster pixel art icons (DCSS CC0) – 이름 키워드 기반 매핑

const KEYWORD_MAP: [string[], string][] = [
  [['들쥐'], 'rat'],
  [['고블린'], 'goblin'],
  [['늑대', '서리'], 'wolf'],
  [['거미'], 'spider'],
  [['오크'], 'orc'],
  [['박쥐'], 'bat'],
  [['도적', '도굴'], 'bandit'],
  [['악어'], 'croc'],
  [['유령', '저주'], 'ghost'],
  [['전갈'], 'scorpion'],
  [['기사', '방랑'], 'knight'],
  [['웜', '모래'], 'worm'],
  [['정령', '용암'], 'elemental'],
  [['골렘', '마그마'], 'golem'],
  [['거인', '얼음'], 'frost_giant'],
  [['수호자', '유적'], 'guardian'],
  [['미라'], 'mummy'],
  [['악마', '수하'], 'demon'],
  [['그림자', '심연'], 'shadow'],
  [['숲의 왕', '숲의왕'], 'boss_forest'],
  [['염제'], 'boss_fire'],
  [['군주', '어둠'], 'boss_dark'],
  // v0.8 Lv.50-70
  [['나가'], 'naga'],
  [['트롤'], 'troll'],
  [['그리폰'], 'griffon'],
  [['가고일'], 'gargoyle'],
  [['히드라'], 'hydra'],
  [['망자'], 'knight'],
  [['오거'], 'ogre_mage'],
  [['와이번'], 'wyvern'],
  [['만티코어'], 'manticore'],
  [['리치'], 'lich'],
  [['피닉스'], 'phoenix'],
  [['타이탄'], 'titan'],
  [['발라카스', '용왕'], 'dragon'],
];

function resolveFile(name: string): string {
  for (const [keywords, file] of KEYWORD_MAP) {
    if (keywords.some((k) => name.includes(k))) return file;
  }
  return 'goblin'; // fallback
}

interface Props {
  name: string;
  size?: number;
}

export function MonsterIcon({ name, size = 32 }: Props) {
  return (
    <img
      src={`/images/monsters/${resolveFile(name)}.png`}
      alt={name}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}
