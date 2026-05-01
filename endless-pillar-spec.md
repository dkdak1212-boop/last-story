# 종언의 기둥 (Endless Pillar) 컨텐츠 스펙

> 작성일: 2026-04-27
> 인터뷰 기반 1차 스펙. 구현 시 세부 수치/UI 는 영자님 추가 결정 받음.

## 0. 컨셉 한 줄

탑 등반 무한 컨텐츠. 매 층 1마리 처치, 100층마다 보스, 죽으면 1층 회귀.
일일 랭킹 1~100위에게만 보상이 나가는 도전형 명예 컨텐츠.

---

## 1. 진행 메커니즘

### 1.1 한 층 사이클
- 클리어 조건: 몬스터 1마리 처치
- 시간 제한: 1분 (60초). 초과 시 패배 → 1층 회귀
- 클리어 → 자동으로 다음 층 진입 (캐릭터 클릭 없이)
- 일반 사냥과 동일 시스템: 100ms tick + 게이지 + 자동/수동 전투

### 1.2 HP 회복 정책
- 일반 층 사이: 회복 없음 (HP 끌고 감)
- 100층 / 200층 / 300층 ... 보스 층 클리어 시: 풀회복

### 1.3 패배 (= 1층 회귀) 트리거
1. 플레이어 HP 0
2. 층 시간 초과 (60초)
3. 자진 포기 버튼 (모달 확인 후 1층 회귀)

### 1.4 회귀 시 처리
- 진행 도달 층수 → 1층으로 리셋
- 사망 직전까지 받은 골드/EXP/킬카운트 등 부수 효과: 전부 유지 (회수 없음)
- 단, 본 컨텐츠는 자동 처치 보상이 없으므로 (4.1) 실제로 회수할 부수 보상은 거의 없음

### 1.5 세션 보존 (튕김/강종)
- 브라우저 닫음 / 네트워크 끊김: 현재 층 + 현재 HP 그대로 보존
- 다음 접속 시 종언 입장하면 그 시점에서 이어감 (60초 카운트는 새로 시작)
- 단, 60초 카운트는 종언 화면 진입 후 다시 0초부터 시작

### 1.6 외부 컨텐츠 진입 시
- 마을/사냥터/시공 균열/길드 보스 등 외부 진입 시: 종언 자동 일시정지
- 일시정지 상태: 현재 층 + HP 그대로 보존, 60초 카운트만 reset
- 다음 종언 입장 시 그 층/HP 에서 재개

---

## 2. 몬스터 & 스케일링

### 2.1 일반층 몬스터
- 종언 전용 신규 몬스터 5종 풀에서 매 층 랜덤 추첨
- 외형/스킬/이름 신규 디자인 필요 (DCSS pixel art 활용 — 이 사용자 정책)
- 종 5마리 모두 동일 base stat, 층 스케일링은 동일 적용

### 2.2 보스 풀
- 1~1000층: 100층마다 1마리씩 = 신규 보스 10종 (100층 보스, 200층 보스, ..., 1000층 보스)
- 1001층 이후: 위 10종을 100층 단위로 순환 (1100층 = 100층 보스 디자인 재활용, 단 HP/공격력은 1100층 스케일링)

### 2.3 스케일링 곡선 (HP / 공격력 동일 비율)
- 층 N 의 능력치 = base × (1 + (N-1) × 0.025)
- 매 층 +2.5% 가산 (선형)
- 예시:
  - 100층: base × 3.475
  - 1000층: base × 25.975
  - 5000층: base × 125.975
  - 10000층: base × 250.975
- base 는 2.4 에 정의

### 2.4 base 능력치 기준 (구현 시 조율)
- 일반층 base: TBD (1층 = 일반 사냥터 Lv.50 몬스터 정도 참고선)
- 보스층 base: 일반층 base × 5~10 가량 (난이도 조정용)
- 모든 클래스가 1층은 손쉽게 클리어 가능, 50~100층 부근에서 빌드 격차 보이기 시작하는 지점이 목표

### 2.5 능력치 폭주 안전선
- +2.5%/층 곡선이라 1만층까지는 일반 Number 범위 안전
- 향후 5만층/10만층 도달자 발생 시 BigInt 도입 또는 sigmoid 둔화 추가 검토

---

## 3. 죽음 / 회귀 / 부활

### 3.1 부활/재도전 시스템
- 없음. 죽으면 무조건 1층부터 즉시 재도전 가능
- 일일 입장 횟수 제한 없음

### 3.2 체크포인트 / 안전선
- 없음. 강한 도전형 컨텐츠 의도

---

## 4. 보상 구조

### 4.1 자동 처치 보상
- 매 층 몬스터 처치 시 골드/EXP/드랍 발생: **없음**
- 종언 안에서는 일반 사냥터 EMA / 처치 카운터 / 드랍 풀 모두 비적용

### 4.2 일일 랭킹 보상 (유일한 인센티브)
- 매일 KST 00:00 (자정) 기준 평가 및 우편 발송
- 평가 대상: **당일 도달한 최고 층수** (전날 진행분은 평가에서 무시되지만 진행 자체는 누적/보존됨)
- 평가 시점에 실제 살아있던 층수가 아니라, 당일 어느 시점이라도 도달한 최고 층수가 기록됨 (죽기 전 1500층 → 1층 회귀 → 자정 평가에서도 1500층 인정)
- 1위~100위에게 보상 우편 발송

### 4.3 보상 매핑
- 사전에 운영자가 1~100위 각 순위별 보상 아이템/수량 매핑을 등록
- 매일 자정 cron 으로 자동 우편 발송
- 보상 미수령 우편 정책은 기존 mailbox 정책 따름 (만료 N 일)

### 4.4 보상 미적용
- 마일스톤 보상 (50/100/500/1000층 첫 도달): 없음
- 100층 보스 클리어 추가 보너스: 없음
- 종언 전용 화폐: 없음

### 4.5 동점 처리 (TBD)
- 같은 도달 층수 다수 발생 시 순위 배정 정책 (선착 / 더 빠른 클리어 / 모두 동순위) — 구현 시 결정

---

## 5. 입장 / 정책

### 5.1 입장 조건
- 레벨 제한 없음 (Lv.1 부터 입장 가능)
- 일일 입장/도전 횟수 무제한
- **초기 단계 — 어드민 전용 (is_admin = TRUE) 만 사냥터 목록에서 메뉴 노출 + 입장 허용**
  - 일반 유저: 사냥터 목록에 종언의 기둥 항목 자체가 안 보임
  - 일반 유저가 직접 API 호출로 입장 시도해도 백엔드에서 `is_admin` 체크 후 403 차단
  - 정식 오픈 시점에 `server_settings` 또는 server_config 의 feature flag (`endless_pillar_open: true`) 로 일반 유저 개방 (별도 코드 변경 없이 운영 토글)

### 5.2 오프라인 모드
- 종언은 온라인 전용. 오프라인 전환 불가
- 자리 비우면 60초 시간 초과로 패배 가능

### 5.3 멀티 캐릭터
- 한 계정 3캐릭 모두 별도 종언 진행 가능 (각자 도달 층수, 독립 진행)
- 같은 user 의 다른 캐릭으로 로그인 진입 시 → 첫 캐릭 종언 일시정지 (G4 와 동일 — 1.6 자동 일시정지 정책)

### 5.4 외부 이동
- 종언 안에서 마을/다른 사냥터/시공 균열/길보 자유 진입 가능
- 진입 시 종언 자동 일시정지 (1.6 참조)

---

## 6. UI / UX

### 6.1 진입 동선
- 사냥터 목록에 별도 항목 "종언의 기둥" 추가 (어드민 전용 노출 — 5.1 참조)
- 클릭 시 입장 확인 모달 → 입장 처리
- "초짜티 안나는" 폴리시 기준:
  - 디버그 문자열/플레이스홀더 텍스트 금지 (모든 라벨 한글 자연어)
  - 종언 전용 배경 / HUD 컴포넌트 / 모달 디자인 정돈
  - 인터랙션 (클리어 → 다음 층 / 보스 진입 / 사망) 모두 트랜지션/이펙트 포함
  - 빈 상태 (랭킹 없음, 첫 입장) 자연스러운 안내 문구

### 6.2 등반 중 화면
- 일반 전투 화면 그대로 사용
- 배경만 어두운 탑 분위기 변경 (전용 background asset 1개)
- 상단 HUD 에 종언 전용 정보 표시 (6.3)

### 6.3 진행 정보 표시 (HUD)
- 현재 N층
- 다음 보스까지 진척도 바 (예: "보스까지 23/100")
- 최고 기록 층 (개인 누적 최고)
- 당일 도달 최고 층
- 1분 카운트다운 (현재 층 남은 시간)
- 현재 몬스터 정보 (HP 바 / 이름)

### 6.4 랭킹 화면
- 별도 화면 또는 ranking 페이지 종언 탭
- 두 개 탭:
  1. 일일 랭킹 — 당일 진행 중 도달한 최고 층수 TOP 100 (실시간 또는 30초 폴링)
  2. 명예의 전당 — 역대 최고 도달 층수 TOP 100 (영구 누적)
- 표시 정보: 닉네임 / 클래스 / 길드 / 도달 층수
- 자기 순위 표시: 101위 밖이면 "내 순위: 257위"

### 6.5 사망 모달
- 표시 정보:
  - "1층으로 회귀합니다"
  - 도달했던 층수
  - 당일 최고 층수
  - 누적 (역대) 최고 층수
- 버튼:
  - "다시 도전" → 즉시 1층 재시작
  - "마을로" → 마을로 이동 (종언 진행 종료)

### 6.6 보스 진입 연출 (선택사항)
- 100/200/... 보스 층 입장 시 짧은 등장 컷씬/이펙트 (TBD — MVP 후속)

---

## 7. 리스크 / 트레이드오프 정책

### 7.1 클래스 격차
- 별도 보정 없음. 빌드/장비/도달 층수가 캐릭 강함의 척도가 됨
- 현재 Phase I 감사상 소환사가 약함 → 종언 도달 층수도 낮을 것
- 이는 "도전형" 의 의도된 특성으로 인정

### 7.2 사용자 부재 중 죽음
- 자동전투 중 부재 시 어려운 층에서 죽으면 1층 회귀 — 의도된 설계
- 완화책 (체크포인트/부활) 도입 안 함

---

## 8. 데이터 저장 구조

### 8.1 신규 테이블

```sql
-- 종언 진행 상태 (캐릭별 1행)
CREATE TABLE endless_pillar_progress (
  character_id        INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  current_floor       INT NOT NULL DEFAULT 1,           -- 현재 진행 층
  current_hp          INT NOT NULL DEFAULT 0,           -- 일시정지/세션 보존용 HP
  paused              BOOLEAN NOT NULL DEFAULT TRUE,     -- 외부 이동/세션 정리 시 TRUE
  highest_floor       INT NOT NULL DEFAULT 0,           -- 역대 최고 도달층
  daily_highest_floor INT NOT NULL DEFAULT 0,           -- 당일 도달 최고층 (자정 cron 으로 0 리셋)
  daily_highest_at    TIMESTAMPTZ,                      -- 당일 최고층 도달 시각
  total_kills         BIGINT NOT NULL DEFAULT 0,        -- 누적 처치 (통계용)
  total_deaths        INT NOT NULL DEFAULT 0,           -- 누적 사망
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 층별 클리어 시간 로그 (랭킹 동점 처리 / 통계용)
CREATE TABLE endless_pillar_floor_log (
  id              BIGSERIAL PRIMARY KEY,
  character_id    INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  floor           INT NOT NULL,
  cleared_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clear_time_ms   INT NOT NULL                  -- 해당 층 처치 소요 시간 (ms)
);
CREATE INDEX idx_epfl_char ON endless_pillar_floor_log(character_id, cleared_at DESC);
CREATE INDEX idx_epfl_floor ON endless_pillar_floor_log(floor);

-- 일일 랭킹 보상 매핑 (운영자가 사전 등록)
CREATE TABLE endless_pillar_reward_mapping (
  rank          INT PRIMARY KEY,                -- 1~100
  item_id       INT NOT NULL REFERENCES items(id),
  quantity      INT NOT NULL DEFAULT 1,
  enhance_level INT,                            -- 강화 보상 시
  prefix_ids    INT[],                          -- 접두사 보상 시
  description   TEXT
);

-- 일일 보상 발송 로그 (멱등성)
CREATE TABLE endless_pillar_daily_rewards (
  id              BIGSERIAL PRIMARY KEY,
  send_date       DATE NOT NULL,                -- KST 기준 날짜
  character_id    INT NOT NULL,
  rank            INT NOT NULL,
  floor_reached   INT NOT NULL,
  item_id         INT NOT NULL,
  quantity        INT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (send_date, character_id)
);
```

### 8.2 종언 전용 몬스터/보스 — items/skills 테이블 재활용
- 신규 monsters 행 추가 (5종 일반 + 10종 보스, type 필드로 분류)
- 일반 사냥터 monster_pool 에는 포함하지 않음 (종언 전용 풀)

### 8.3 active 세션
- 기존 `combat_sessions` 테이블 재활용 (종언 전용 fieldId = 99 또는 별도 마커)
- session.fieldId == ENDLESS_PILLAR_FIELD_ID 로 종언 모드 식별
- 정상 fieldId 와 분리해 일반 사냥터 기록과 섞이지 않게

---

## 9. 핵심 알고리즘

### 9.1 층 진행 루프
```
on enter endless_pillar:
  load endless_pillar_progress
  if progress.current_floor == 0: progress.current_floor = 1
  start combat session (fieldId = ENDLESS_PILLAR_FIELD_ID, monster = sampleMonster(progress.current_floor))
  paused = false
  start 60s timer

on monster killed:
  log floor cleared (endless_pillar_floor_log)
  progress.current_floor++
  update daily_highest_floor / highest_floor if needed
  if progress.current_floor % 100 == 1 (즉 직전이 보스):
    full HP heal
  spawn next floor monster
  reset 60s timer

on player HP <= 0 OR 60s timeout OR 자진 포기:
  progress.current_floor = 1
  progress.current_hp = max_hp
  progress.total_deaths++
  show death modal

on session disconnected (브라우저 닫힘):
  progress.paused = true
  progress.current_hp = 현재 HP 저장
  combat_session 정리

on external content enter (마을/사냥/길보 등):
  same as session disconnected (paused, HP 저장)
```

### 9.2 스케일링 산식
```
function getMonsterStats(floor, base) {
  const mult = 1 + (floor - 1) * 0.025;
  return {
    hp: Math.floor(base.hp * mult),
    atk: Math.floor(base.atk * mult),
  };
}

function isBossFloor(floor) {
  return floor % 100 === 0;
}

function getBossDef(floor) {
  // 1~1000층: 보스 1~10
  // 1001층+: 순환 — boss[(floor / 100 - 1) % 10]
  const bossIdx = Math.floor(floor / 100 - 1) % 10;
  return BOSS_POOL[bossIdx];
}
```

### 9.3 랭킹 + 일일 보상 cron
```
매일 KST 00:00 cron:
  // 1. 어제 (KST) 의 랭킹 산정
  rank_query = SELECT character_id, daily_highest_floor, daily_highest_at
               FROM endless_pillar_progress
               WHERE daily_highest_floor > 0
               ORDER BY daily_highest_floor DESC, daily_highest_at ASC
               LIMIT 100

  // 2. 보상 매핑 조회 + 우편 발송 (멱등 가드)
  for (rank = 1; rank <= 100; rank++) {
    if (rank_query[rank-1] not exists) break
    char = rank_query[rank-1]
    reward = endless_pillar_reward_mapping[rank]
    INSERT INTO endless_pillar_daily_rewards (send_date, character_id, rank, ...)
      ON CONFLICT (send_date, character_id) DO NOTHING
    if inserted:
      send mail to char with reward
  }

  // 3. daily_highest_floor 전부 0 으로 리셋
  UPDATE endless_pillar_progress SET daily_highest_floor = 0, daily_highest_at = NULL
```

---

## 10. MVP 범위 / 단계

### 10.1 MVP (1차 패치)
- 8.1 의 endless_pillar_progress + endless_pillar_floor_log 테이블
- 종언 전용 몬스터 5종 + 보스 10종 (기존 몬스터 재스킨도 가능 — 영자님 결정)
- 진행 메커니즘 (층 진행 / 시간 제한 / 사망 / 회귀 / 일시정지 / 세션 보존)
- F1 사냥터 목록 진입 + F2 배경 변경 + F3 HUD + F5 사망 모달
- 일일 랭킹 산정 + 보상 매핑 + cron + 우편 발송
- F4.1 일일 랭킹 화면 (단일 탭)

### 10.2 Phase 2 (2차 패치)
- F4 명예의 전당 탭 (역대 최고)
- F4 자기 순위 표시 (101+ 외 표시)
- 6.6 보스 진입 컷씬/이펙트
- 4.5 동점 처리 (clear_time_ms 기반 우선)

### 10.3 후속 (3차+)
- 종언 전용 화폐/상점 (G5 답변상 보류 가능)
- 길드 평균 랭킹
- 클래스별 특수 보정 (필요 시 G3 재논의)

---

## 11. 인터뷰 확정 결과 (2026-04-27)

### 11-1. 일반층 base 능력치
- **1층 base = Lv.110 시공의 균열 일반 몬스터 평균 × 0.5 (반토막)**
- 구현 시 시공의 균열 (rift) 몬스터 평균 HP/공격력 산출 후 ÷2 적용

### 11-2. 보스층 base 배수
- **보스 base = 같은 층 일반 몬스터 base × 8** (확실한 벽)
- 예: 100층 보스 = 1층 base × (1 + 99×0.025) × 8 = 1층 base × 27.8

### 11-3. 일일 랭킹 동점 처리
- **`daily_highest_at` 빠른 순 (선착)** — 같은 층수 도달 시 먼저 도달한 사람이 상위

### 11-4. 보상 매핑

| 순위 | 보상 |
|---|---|
| 1~10위  | 접두사 3T 굴림권 + 품질굴림권 |
| 11~50위 | 접두사 2T 굴림권 + 접두사 수치 굴림권 |
| 51~100위 | 접두사 1T 굴림권 + 접두사 수치 굴림권 |
| 200위 안 랜덤 10명 | 3옵 접두사 굴림권 (위 보상에 추가 지급, 100위 안인 사람도 추첨 대상) |

- 매핑 등록: SQL/스크립트로 직접 endless_pillar_reward_mapping 테이블 INSERT
- 랭킹 화면 표기: 200위까지 노출 (보상은 100위 + 랜덤 10명)
- 굴림권 아이템 ID 들은 구현 단계 DB 매핑 (없는 굴림권은 신규 추가 요청)

### 11-5. 신규 몬스터/보스 디자인 워크플로
- 일반층 5종 + 보스 10종 모두 1차 안 (이름/외형 후보/스킬) 제시 → 영자님 선택/수정
- 이미지: DCSS CC0 32x32 pixel art (메모리 정책)

### 11-6. 우편 만료 일수
- 기존 mailbox 정책 그대로 따름

### 11-7. 종언 전용 fieldId
- 안 겹치는 빈 번호로 — 구현 시 fields 테이블 MAX(id) 조회 후 충분히 띄운 값 (예: 999 또는 max+100) 으로 지정

---

## 12. 메모리 저장 권고
구현 후 `reference_endless_pillar.md` 메모리 추가 (테이블 구조 / 스케일링 산식 / cron 시간 / 일시정지 정책 — 향후 세션에서 참조용).
