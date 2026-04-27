// Monster pixel art icons (DCSS CC0) – 이름 키워드 기반 매핑

const KEYWORD_MAP: [string[], string][] = [
  // 종언의 기둥 — 정확한 이름 매칭 (키워드 충돌 방지로 최상단)
  // 일반 몬스터 5종
  [['망자의 그림자'], 'shadow'],
  [['차원의 사냥꾼'], 'deep_elf_knight'],
  [['영겁의 잔재'], 'sun_demon'],
  [['침묵의 수도자'], 'mummy_priest'],
  [['종언의 첨병'], 'hell_knight'],
  // 보스 10종
  [['깨어난 수문장'], 'iron_golem'],
  [['시간의 포식자'], 'shadow_dragon'],
  [['균열의 폭군'], 'fire_dragon'],
  [['무한의 환영'], 'lich_new'],
  [['종말의 기수'], 'skeletal_warrior'],
  [['절멸의 권능'], 'balrug'],
  [['영원의 파수자'], 'titan'],
  [['차원 군주'], 'ancient_lich'],
  [['끝없는 심판자'], 'cyclops'],
  [['종언 그 자체'], 'phoenix'],
  // 길드 보스 — 정확한 이름 매칭 우선
  [['강철의 거인'], 'iron_golem'],
  [['광속의 환영'], 'shadow'],
  [['화염의 군주'], 'fire_giant_new'],
  [['그림자 황제'], 'boss_dark'],
  [['시계태엽 거인'], 'stone_giant'],
  [['천공의 용'], 'golden_dragon'],
  [['차원의 지배자'], 'ancient_lich'],
  // 시공의 균열 (Lv.110) — 정확 이름 매칭. '수호자'/'군주' 키워드 충돌 방지.
  [['차원의 잔재'], 'hellion'],
  [['시공의 수호자'], 'raid_titan'],
  [['균열의 군주'], 'kraken'],
  // 일반 몬스터
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
