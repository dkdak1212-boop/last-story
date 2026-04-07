-- 모든 노드를 단일 존(core)으로 통합, PoE처럼 중앙에서 시작
BEGIN;

-- 모든 존을 'core'로 통합
UPDATE node_definitions SET zone = 'core';

-- 기존 선행조건 초기화 (016에서 설정한 것)
UPDATE node_definitions SET prerequisites = '{}';

-- 선행조건 재설정: 중앙 시작, 방사형 확장
-- 1) 중앙 소형 노드들은 선행 없음 (진입점)
-- 2) 중앙 중형 → 중앙 소형 3개 필요
-- 3) 중앙 대형 → 중앙 중형 2개 필요
-- 4) 기본/공격/유틸 소형 시작 노드 → 중앙 소형 아무거나 1개
-- 5) 직업 소형 시작 노드 → 중앙 중형 아무거나 1개

DO $$
DECLARE
  center_smalls INT[];
  center_mediums INT[];
  center_larges INT[];
  grp_nodes INT[];
  grp_smalls INT[];
  grp_mediums INT[];
  grp_larges INT[];
  orig_zone TEXT;
  zones TEXT[] := ARRAY['south','east','west','north_warrior','north_mage','north_cleric','north_rogue'];
  z TEXT;
  i INT;
BEGIN
  -- 중앙 노드 ID 수집 (원래 center 존이었던 것들)
  SELECT array_agg(id ORDER BY tier, id) INTO center_smalls
  FROM node_definitions WHERE name LIKE '%기본 %' OR (name IN (
    SELECT name FROM node_definitions WHERE id IN (
      SELECT id FROM node_definitions ORDER BY id LIMIT 302
    )
  ) AND position_x BETWEEN 0 AND 2 AND position_y BETWEEN 10 AND 12);

  -- 더 정확하게: 원래 center 존 노드들 식별
  -- center 존 소형 12개: 기본 힘/민첩/지능/체력/스피드/치명타 (2개씩)
  -- 이름 패턴으로 찾기
  SELECT array_agg(id ORDER BY id) INTO center_smalls
  FROM node_definitions WHERE tier = 'small' AND name LIKE '기본 %';

  SELECT array_agg(id ORDER BY id) INTO center_mediums
  FROM node_definitions WHERE tier = 'medium' AND name LIKE '만능 %';

  SELECT array_agg(id ORDER BY id) INTO center_larges
  FROM node_definitions WHERE tier = 'large' AND (
    name LIKE '광전사%' OR name LIKE '철의%' OR name LIKE '마력%' OR name LIKE '극한 집중%'
  );

  -- 중앙 소형 체인 (2개씩 묶기)
  IF center_smalls IS NOT NULL THEN
    FOR i IN 2..array_length(center_smalls, 1) BY 2
    LOOP
      UPDATE node_definitions SET prerequisites = ARRAY[center_smalls[i-1]]
      WHERE id = center_smalls[i];
    END LOOP;
  END IF;

  -- 중앙 중형 → 중앙 소형 2개 선행
  IF center_mediums IS NOT NULL AND center_smalls IS NOT NULL THEN
    FOR i IN 1..LEAST(array_length(center_mediums, 1), array_length(center_smalls, 1) / 2)
    LOOP
      UPDATE node_definitions SET prerequisites = ARRAY[
        center_smalls[(i-1)*2 + 1],
        center_smalls[(i-1)*2 + 2]
      ] WHERE id = center_mediums[i];
    END LOOP;
    -- 나머지 중형은 이전 중형 선행
    FOR i IN (array_length(center_smalls, 1) / 2 + 1)..COALESCE(array_length(center_mediums, 1), 0)
    LOOP
      UPDATE node_definitions SET prerequisites = ARRAY[center_mediums[i-1]]
      WHERE id = center_mediums[i];
    END LOOP;
  END IF;

  -- 중앙 대형 → 중앙 중형 2개 선행
  IF center_larges IS NOT NULL AND center_mediums IS NOT NULL THEN
    FOR i IN 1..array_length(center_larges, 1)
    LOOP
      UPDATE node_definitions SET prerequisites = ARRAY[
        center_mediums[LEAST(i*2-1, array_length(center_mediums, 1))],
        center_mediums[LEAST(i*2, array_length(center_mediums, 1))]
      ] WHERE id = center_larges[i];
    END LOOP;
  END IF;

  -- 각 브랜치(원래 south, east, west, north_*) 내부 체인 + 중앙 연결
  -- 원래 존 정보는 이미 잃어버렸으므로, 이름 패턴으로 그룹핑
  -- 간단하게: center 이외의 모든 소형/중형/대형을 ID순으로 처리

  -- 비중앙 소형 노드들
  SELECT array_agg(id ORDER BY id) INTO grp_smalls
  FROM node_definitions WHERE tier = 'small' AND name NOT LIKE '기본 %';

  -- 비중앙 중형 노드들
  SELECT array_agg(id ORDER BY id) INTO grp_mediums
  FROM node_definitions WHERE tier = 'medium' AND name NOT LIKE '만능 %';

  -- 비중앙 대형 노드들
  SELECT array_agg(id ORDER BY id) INTO grp_larges
  FROM node_definitions WHERE tier = 'large' AND NOT (
    name LIKE '광전사%' OR name LIKE '철의%' OR name LIKE '마력%' OR name LIKE '극한 집중%'
  );

  -- 소형 노드 체인: 6개씩 묶어서, 각 묶음 첫 노드는 중앙 소형 하나를 선행으로
  IF grp_smalls IS NOT NULL AND center_smalls IS NOT NULL THEN
    FOR i IN 1..array_length(grp_smalls, 1)
    LOOP
      IF (i - 1) % 6 = 0 THEN
        -- 각 6개 그룹의 첫 노드: 중앙 소형 노드 중 하나를 선행
        UPDATE node_definitions SET prerequisites = ARRAY[
          center_smalls[((i - 1) / 6) % array_length(center_smalls, 1) + 1]
        ] WHERE id = grp_smalls[i];
      ELSE
        -- 나머지: 이전 노드 선행
        UPDATE node_definitions SET prerequisites = ARRAY[grp_smalls[i - 1]]
        WHERE id = grp_smalls[i];
      END IF;
    END LOOP;
  END IF;

  -- 중형 노드: 소형 6개 그룹의 마지막 노드를 선행으로
  IF grp_mediums IS NOT NULL AND grp_smalls IS NOT NULL THEN
    FOR i IN 1..array_length(grp_mediums, 1)
    LOOP
      IF i * 6 <= array_length(grp_smalls, 1) THEN
        UPDATE node_definitions SET prerequisites = ARRAY[grp_smalls[i * 6]]
        WHERE id = grp_mediums[i];
      ELSE
        UPDATE node_definitions SET prerequisites = ARRAY[grp_mediums[GREATEST(i-1, 1)]]
        WHERE id = grp_mediums[i];
      END IF;
    END LOOP;
  END IF;

  -- 대형 노드: 중형 2개를 선행으로
  IF grp_larges IS NOT NULL AND grp_mediums IS NOT NULL THEN
    FOR i IN 1..array_length(grp_larges, 1)
    LOOP
      UPDATE node_definitions SET prerequisites = ARRAY[
        grp_mediums[LEAST(i*2-1, array_length(grp_mediums, 1))],
        grp_mediums[LEAST(i*2, array_length(grp_mediums, 1))]
      ] WHERE id = grp_larges[i];
    END LOOP;
  END IF;

END $$;

COMMIT;
