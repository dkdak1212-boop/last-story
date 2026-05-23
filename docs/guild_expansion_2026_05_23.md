# 길드 레벨·버프 확장 (2026-05-23)

## 배경
플레이어 건의: 길드 레벨 20 도달 길드가 대부분(106개 중 85개)이라 자금 기부·길드 경험치가 무의미해짐.
길드 레벨 상한 확장 + 버프 비례 확장 + 레벨업 난이도 상향 요청.

## 인터뷰 결정 (2026-05-23)
1. **레벨 상한: 20 → 40**
2. **누적 exp: 20렙 길드 exp 0 리셋 후 재등반** (공평한 새 출발)
3. **버프 확장: 11단계+ 효과 절반** (인플레 완화)
4. **난이도: 빡세게 — 상위 길드도 상한까지 1~2달+**

## ⚠️ 핵심 리스크: 누적 exp 점프
레벨 20에서 exp가 변환 안 되고 계속 쌓임(guild.ts 레벨업 루프 `level < MAX` 조건).
- 상위: Flower 1조, Endless Fantasy 7,340억 등 수백억~조 단위 보유
- 상한만 40으로 올리면 다음 flush(5초)에 대부분 즉시 40렙 점프 → 취지 무산
- **대응: 배포 전 `UPDATE guilds SET exp=0 WHERE level>=20` 먼저 실행** (배포 순서 중요)

## 변경 설계 (server/src/game/guild.ts)

### 상수
- `GUILD_MAX_LEVEL = 40` (was 20)
- `GUILD_SKILL_MAX = 20` (was 10) — 스킬 N단계 요구 길드레벨 = 2N (변경 없음) → 스킬20 = 길드40
- `GUILD_SKILL_TAPER_LEVEL = 10` — 11단계부터 %/단계 절반

### 버프 테이퍼 (신규 헬퍼)
```
guildSkillTotalPct(key, level):
  level<=10 → level * pct
  level>10  → 10*pct + (level-10) * pct/2
```
- pct: hp=1, gold=2, exp=2, drop=1
- 만렙(20) 효과: hp+15% · gold+30% · exp+30% · drop+15% (기존 10단계: +10/+20/+20/+10)
- 적용 지점 전부 교체: character.ts:164, engine.ts:6615-6617·6633, status.ts:221-223, guilds.ts:138
- 클라 표시용 `pctPerLevel` → "다음 단계 증가폭"(테이퍼 반영)으로 의미 변경 → **클라 수정 0**

### EXP 곡선 (재설계)
```
expToNextGuild(level):
  level<20 → floor(200_000 * level^2.4)          (기존 유지, 저렙 길드 영향 없음)
  level>=20 → floor(15_000_000_000 * 1.18^(level-20))   (엔드게임 곡선)
```
| 구간 | 필요 exp |
|------|---------|
| 20→21 | 150억 |
| 25→26 | 343억 |
| 30→31 | 785억 |
| 35→36 | 1,797억 |
| 39→40 | 3,484억 |
| **20→40 합계** | **약 2.2조** |
- 현재 최대 누적(Flower 1조)의 약 2배 → 가장 활발한 길드도 1~2달+, 일반 길드는 훨씬 장기 목표

### 스킬 업그레이드 비용 (자금 기부 의미 복원)
```
getGuildSkillUpgradeCost(nextLevel):
  nextLevel<=10 → nextLevel * 100_000           (기존 유지)
  nextLevel>10  → 1_000_000 + (nextLevel-10) * 2_000_000
```
- 11단계 300만 → 20단계 2,100만. 스킬당 11~20 합계 약 1.2억, 4종 약 4.8억
- 활발한 길드 일일 기부량(~1천만)으로 약 1~2달 → 레벨링과 보조 맞춤

## 마이그레이션 / 배포 순서 (둘 다 사용자 확인 필요)
1. 코드 구현 + `npm run build` 검증
2. **(확인 후)** `UPDATE guilds SET exp=0 WHERE level>=20` 실행 — 구버전(상한20) 구동 중 실행해야 안전 (점프 방지)
3. **(확인 후)** git push → Railway 배포

## 영향 범위 점검
- 클라 GuildScreen: API 값 기반 렌더(max/currentPct/nextReqLevel/pctPerLevel/maxLevel) → 수정 불필요. 스킬 막대 20칸 정상.
- 길드 24시간 부스트(+25%), 영토 보너스: 가산 방식 그대로, 영향 없음
- HP 버프 float(예 +12.5%): `Math.round(maxHp*(1+pct/100))` 처리 정상
- stat_buff_pct(전 길드 일괄 5%)는 이번 변경 대상 아님 (레벨 무관 상수 유지)
