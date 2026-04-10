# 길드 시스템 1단계 — 스펙

## 결정사항 (인터뷰 기반)
- EXP 5% 자동 기여 (멤버 사냥 EXP의 5%가 길드 EXP로)
- 길드 레벨 상한 **20**, 천천히 성장
- 스킬 해금: **레벨 + 자금 모두 소모** (리더가 직접 찍기)
- 일일 기부 한도: 캐릭터당 **1,000,000G**
- 자금 사용 권한: **리더만**
- 길드 버프 표시: **사냥(전투) 화면**

## DB 변경

```sql
ALTER TABLE guilds ADD COLUMN level INT NOT NULL DEFAULT 1;
ALTER TABLE guilds ADD COLUMN exp BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN treasury BIGINT NOT NULL DEFAULT 0;

CREATE TABLE guild_skills (
  guild_id INT REFERENCES guilds(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,  -- 'hp' | 'gold' | 'exp' | 'drop'
  level INT NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, skill_key)
);

CREATE TABLE guild_contributions (
  guild_id INT REFERENCES guilds(id) ON DELETE CASCADE,
  character_id INT REFERENCES characters(id) ON DELETE CASCADE,
  exp_contributed BIGINT NOT NULL DEFAULT 0,
  gold_donated BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, character_id)
);

CREATE TABLE guild_donations_daily (
  character_id INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0
);
```

## 길드 레벨 공식
- `expToNextGuild(L) = floor(200_000 * L^2.4)`
  - Lv1→2: 200,000
  - Lv5→6: ~6.9M
  - Lv10→20 한계 ~ 약 35M
  - Lv19→20: ~280M
- 5% 기여 가정: 20명 길드가 시간당 평균 EXP 80,000 → 길드 EXP 시간당 8만 → Lv1→2 약 2.5시간, Lv19→20 약 1.5개월

## 길드 스킬 (4종, 각 max 10단계)
| 키 | 효과 | 단계당 |
|---|---|---|
| `hp` | 길드원 maxHp | +1% |
| `gold` | 골드 획득 | +2% |
| `exp` | 경험치 획득 | +2% |
| `drop` | 드랍률 | +1% |

### 업그레이드 비용/요구치
- 업그레이드 비용: `(nextLevel) * 100,000G` (1단계 100k → 10단계 1M)
- 길드 레벨 요구: `nextLevel * 2` (1단계 GL2, 5단계 GL10, 10단계 GL20)
- 리더 전용

## 기부 (POST /guilds/donate)
- 본인 골드 차감 → 길드 treasury 증가
- 일일 한도 1,000,000G/캐릭터
- guild_contributions.gold_donated 증가

## EXP 기여 (자동)
- 사냥 처치 시 `expGained * 0.05` 반올림 → 길드 exp + guild_contributions.exp_contributed 증가
- 길드 exp 임계치 도달 시 자동 레벨업

## 버프 적용
- **사냥 reward 계산**:
  - finalGold *= (1 + guild_gold * 0.02)
  - boostedExp *= (1 + guild_exp * 0.02)
  - drop chance *= (1 + guild_drop * 0.01)
- **maxHp 계산** (getEffectiveStats):
  - maxHp += baseMaxHp * (guild_hp * 0.01)
- 캐싱: 캐릭터 → 길드 스킬 레벨 매번 조회 (성능 OK, 길드원 < 100)

## API
- GET /guilds/my/:characterId — 기존 응답에 level, exp, expToNext, treasury, skills, myDonationToday 추가
- POST /guilds/donate — { characterId, amount }
- POST /guilds/skill/upgrade — { characterId, skillKey } (리더 전용)

## 클라이언트 (GuildScreen)
- 내 길드 화면에:
  - 길드 레벨 + EXP 바
  - 길드 자금 + 기부 입력칸
  - 4개 스킬 카드 (현재 단계 / 효과 / 다음 비용 / 업그레이드 버튼)
  - 멤버 목록 (기존 유지)

## 사냥 화면 (CombatScreen)
- 상단 또는 사이드에 길드 버프 작은 배지
  - 예: "길드 버프: HP+5% / 골드+10% / EXP+8% / 드랍+3%"
