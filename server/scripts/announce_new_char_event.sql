-- 신규 캐릭터 EXP 이벤트 공지 게시
INSERT INTO announcements (title, body, priority, expires_at, author_id)
VALUES (
  '신규 캐릭터 경험치 버프 이벤트 안내',
  E'신규 캐릭터 생성 시 경험치 버프가 자동으로 부여됩니다.\n\n- 버프 효과: 경험치 +300% (×4 배수)\n- 적용 대상: 이벤트 기간 중 새로 생성된 모든 신규 캐릭터\n- 이벤트 종료: 2026년 5월 24일 00시 (한국시간 기준)\n- 기존의 일일 퀘스트 +50% 경험치 부스터와 중첩 적용됩니다.\n\n새로운 직업에 도전하거나 부캐를 육성할 좋은 기회입니다. 많은 관심 부탁드립니다.',
  2,
  '2026-05-24 00:00:00+09',
  (SELECT id FROM users WHERE username = 'admin' LIMIT 1)
)
RETURNING id, title, priority, active, expires_at;
