# 게시판 (자유/공략) 스펙

## 목적
방명록(짧은 한마디) 위에 본격 글쓰기 게시판 2종을 추가. 자유게시판/공략게시판 탭으로 전환, 댓글 지원, 작성자/관리자 삭제 + 신고.

## 데이터 모델

### `board_posts`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | SERIAL PK | |
| board_type | VARCHAR(8) | `'free'` \| `'guide'` |
| character_id | INT FK characters(id) ON DELETE CASCADE | 작성자 |
| character_name | VARCHAR(40) | 표시 캐시 |
| class_name | VARCHAR(20) | 표시 캐시 |
| title | VARCHAR(60) NOT NULL | |
| body | TEXT NOT NULL | 최대 2000자 (서버 검증) |
| target_class | VARCHAR(20) NULL | 공략 전용 — 직업 태그 (warrior/mage/cleric/rogue/summoner/all) |
| target_level | INT NULL | 공략 전용 — 권장 레벨 |
| view_count | INT DEFAULT 0 | |
| comment_count | INT DEFAULT 0 | 비정규화 (목록 조회 최적화) |
| report_count | INT DEFAULT 0 | |
| deleted | BOOLEAN DEFAULT FALSE | 소프트 삭제 |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

인덱스: `(board_type, deleted, created_at DESC)` — 목록 정렬 최적화.

### `board_comments`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | SERIAL PK | |
| post_id | INT FK board_posts(id) ON DELETE CASCADE | |
| character_id | INT FK characters(id) ON DELETE CASCADE | |
| character_name | VARCHAR(40) | |
| class_name | VARCHAR(20) | |
| body | VARCHAR(500) NOT NULL | |
| deleted | BOOLEAN DEFAULT FALSE | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

인덱스: `(post_id, created_at)`.

### `board_reports`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | SERIAL PK | |
| post_id | INT NULL FK board_posts(id) ON DELETE CASCADE | |
| comment_id | INT NULL FK board_comments(id) ON DELETE CASCADE | |
| reporter_id | INT FK users(id) | |
| reason | VARCHAR(200) | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

UNIQUE `(post_id, reporter_id)` / `(comment_id, reporter_id)` — 중복 신고 방지 (NULL 허용 컬럼이라 DB 측은 partial index로).

## 권한/제한

- **작성**: 로그인 + 캐릭터 보유 필수
- **쿨타임**: 동일 계정(user_id)이 마지막 글 작성 후 **3분 경과** 필요 (댓글은 30초)
- **길이**: 제목 60자 / 본문 2000자 / 댓글 500자 (서버 zod 검증)
- **삭제**: 작성자 본인 또는 관리자 — 소프트 삭제(`deleted=TRUE`), 목록·상세에서 제외
- **신고**: 누적 5건 이상 시 자동 숨김(`deleted=TRUE`로 토글). 같은 사용자 중복 신고 불가
- **수정**: 미지원 (스펙 단순화)

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/forum?type=free\|guide&offset=0&limit=20` | 목록 (최신순). 더보기는 offset 증가 |
| GET | `/forum/:id` | 상세 + 댓글. view_count++ |
| POST | `/forum` | 글 작성 — body: `{characterId, boardType, title, body, targetClass?, targetLevel?}` |
| POST | `/forum/:id/comments` | 댓글 — body: `{characterId, body}` |
| POST | `/forum/:id/delete` | 글 삭제 (본인/관리자) |
| POST | `/forum/comments/:id/delete` | 댓글 삭제 |
| POST | `/forum/:id/report` | 글 신고 — body: `{reason?}` |
| POST | `/forum/comments/:id/report` | 댓글 신고 |

응답 포맷:
```ts
ListItem { id, boardType, title, characterName, className, commentCount, createdAt, targetClass?, targetLevel? }
Detail { ...ListItem, body, viewCount, comments: Comment[], isOwner, isAdmin }
Comment { id, characterName, className, body, createdAt, isOwner }
```

## UI

### 위치
`VillageScreen` 방명록 카드 **바로 위**에 새 카드.

### 구조
```
┌─ 게시판 ──────────────────┐
│ [자유게시판] [공략게시판]   │
│ ─────────────────────────  │
│ [+ 글쓰기]      (20개씩)   │
│                            │
│ ▶ 글 행 (제목, 작성자, 댓글수, 시간) │
│ ▶ 글 행                    │
│ ...                        │
│ [더 보기]                  │
└────────────────────────────┘
```

- **목록 행 클릭** → 인라인으로 펼침(아코디언) — 별도 모달 안 씀, 모바일 친화적
- **글쓰기 버튼** → 같은 카드 안에서 폼으로 변환 (취소 시 닫힘)
- **공략게시판 작성 폼**: 직업 셀렉트(전체/전사/마법사/성직자/도적) + 권장 레벨 input 추가 노출
- **목록 표기**: 공략 게시판 행에는 `[전사 Lv.40+]` 같은 작은 태그 좌측에 표시
- **더 보기 버튼**: 응답 length === limit 이면 노출, 클릭 시 offset += 20 후 추가 fetch (append)
- **상세 펼침 영역**: 본문 + 댓글 리스트 + 댓글 입력창

### 스타일
방명록 카드와 톤 통일 (보라/파랑 그라데이션), 다만 색상은 약간 차이 — 게시판은 호박/주황 톤(`#daa520`)으로 구분.

## 비기능

- 페이지네이션은 offset 기반 (게시글 수가 폭증하지 않는 MVP라서 충분)
- view_count는 같은 user_id가 같은 글을 1시간 내 재조회 시 카운트 안 함 — 단순화 위해 **이번 MVP에서는 매 GET마다 ++** (남용 시 추후 보완)
- 게시판은 캐릭터 단위가 아닌 **계정(user_id) 단위 쿨타임** — 부캐로 도배 방지
- 신고 자동 숨김 임계: 5건. 관리자가 admin 페이지에서 복원 가능 (관리 UI는 추후, MVP는 DB 직접)

## 마이그레이션 키
`forum_v1` — `_migrations` 테이블에 등록.

## 비범위 (NOT in MVP)
- 글 수정
- 댓글의 댓글(대댓글)
- 좋아요/추천
- 이미지 업로드
- 검색
- 알림
- 관리 페이지 신고함 (DB 직접)
