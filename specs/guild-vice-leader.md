# 길드 부길마(officer) 시스템 스펙

## 개요
길드장(leader) 외에 **부길마(officer)** 역할을 도입해 길드 운영 권한을 분담한다.

## 역할 및 제한
- role 값: `leader` / `officer` / `member` (DB는 이미 지원 — 마이그레이션 불필요)
- 부길마 최대 **2명** / 길드
- 부길마 임명·해제: **길드장만**

## 권한 매트릭스

| 행동 | leader | officer | member |
|---|---|---|---|
| 가입 신청 승인/거절 | O | O | X |
| 길드원 추방 (일반 멤버만) | O | O | X |
| 부길마 추방 | O | X | X |
| 길드장 추방 | X | X | X |
| 길드 소개글 수정 | O | O | X |
| 길드 스킬 업그레이드 | O | O | X |
| 부길마 임명/해제 | O | X | X |
| 길드 해산 | O | X | X |
| 길드장 위임 (수동) | O | X | X |

## 길드장 자동 승계
- 길드장이 `leave`(탈퇴) 시도 시:
  - 부길마가 존재하면 **가장 먼저 임명된(joined_at 또는 role 승격 시각 기준) 부길마**가 자동 승계
  - 부길마가 없고 멤버만 있으면 현행대로 `leader must disband or transfer first` 반환 (또는 추후 최고 기여자 승계 — 이번 범위 밖)
  - 혼자면 현행대로 해산
- 길드장 계정이 장기 미접속 시 자동 승계: **이번 범위 밖** (나중 이슈)

## 서버 변경 (`server/src/routes/guilds.ts`)

### 헬퍼 추가
```ts
// 'leader' | 'officer' 모두 허용
function isManager(role: string) { return role === 'leader' || role === 'officer'; }
```

### 수정할 엔드포인트
1. `POST /description` — `role !== 'leader'` → `!isManager(role)`
2. `POST /skill/upgrade` — 동일
3. `GET /:guildId/applications` — 동일
4. `POST /applications/:appId/approve` — 동일
5. `POST /applications/:appId/reject` — 동일
6. `POST /kick` — `isManager(leaderRole)` 체크 + **target.role === 'leader' || target.role === 'officer'` 이면 차단** (일반 멤버만 추방). 단, 길드장은 officer도 추방 가능하도록 분기.
7. `POST /leave/:characterId` — 길드장 탈퇴 시 officer 자동 승계 로직 추가

### 신규 엔드포인트
- `POST /promote` — body: `{ leaderCharacterId, targetCharacterId }`
  - 길드장만, 같은 길드, 현재 member → officer, officer 정원 2명 체크
- `POST /demote` — body: `{ leaderCharacterId, targetCharacterId }`
  - 길드장만, officer → member

## 클라이언트 변경 (`client/src/screens/GuildScreen.tsx` 등)

### 멤버 목록 UI
- role에 따른 이름 색상:
  - leader → 금색 `#ffd700`
  - officer → 하늘색 `#66ccff`
  - member → 기본 흰색
- 역할 앞에 짧은 텍스트 태그 ([길마]/[부길마])

### 관리 버튼 (멤버 옆)
- 길드장 시점:
  - member 행: `[부길마 임명]`, `[추방]`
  - officer 행: `[해제]`, `[추방]`
  - leader 행 (본인): 없음
- 부길마 시점:
  - member 행: `[추방]`
  - officer/leader 행: 없음
- member 시점: 버튼 없음

### API 클라이언트
- `promoteMember`, `demoteMember` 함수 추가

## 위임(leadership transfer) 엔드포인트
기존에 수동 위임이 없다면 스코프 밖. 있으면 그대로 유지. (확인 필요)

## 테스트 체크리스트
- [ ] 부길마 임명/해제 정상 동작
- [ ] 부길마 2명 초과 임명 차단
- [ ] 부길마가 가입 승인/거절, 소개글·스킬 업글, 일반 멤버 추방 가능
- [ ] 부길마가 다른 부길마/길드장 추방 시 차단
- [ ] 길드장 탈퇴 시 부길마 자동 승계
- [ ] 멤버 색상 구분 표시
- [ ] 버튼 권한별 노출 제어
