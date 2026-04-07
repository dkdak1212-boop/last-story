-- 노드 선행 조건 연결 (PoE 스타일 그물망)
-- 같은 존 내에서 순차적으로 연결: 소형→소형→중형→대형
-- 각 존의 시작 노드는 선행 없음 (진입점)

BEGIN;

-- 존별 체인 연결 함수
-- 같은 존의 노드를 ID 순서대로 가져와서
-- 소형 노드: 3개씩 그룹, 각 그룹의 첫 노드가 이전 그룹의 마지막에 연결
-- 중형 노드: 해당 존의 소형 노드 일정 수 이상 필요
-- 대형 노드: 해당 존의 중형 노드 일정 수 이상 필요

DO $$
DECLARE
  z TEXT;
  nodes INT[];
  smalls INT[];
  mediums INT[];
  larges INT[];
  i INT;
BEGIN
  FOR z IN SELECT DISTINCT zone FROM node_definitions ORDER BY zone
  LOOP
    -- 소형 노드 (ID순)
    SELECT array_agg(id ORDER BY id) INTO smalls
    FROM node_definitions WHERE zone = z AND tier = 'small';

    -- 중형 노드 (ID순)
    SELECT array_agg(id ORDER BY id) INTO mediums
    FROM node_definitions WHERE zone = z AND tier = 'medium';

    -- 대형 노드 (ID순)
    SELECT array_agg(id ORDER BY id) INTO larges
    FROM node_definitions WHERE zone = z AND tier = 'large';

    -- 소형 노드 체인: 3개씩 묶어서 이전 묶음의 마지막 노드를 선행으로
    IF smalls IS NOT NULL THEN
      FOR i IN 1..array_length(smalls, 1)
      LOOP
        IF i > 3 THEN
          -- 4번째부터는 3개 전 노드를 선행으로
          UPDATE node_definitions
          SET prerequisites = ARRAY[smalls[i - 3]]
          WHERE id = smalls[i];
        ELSIF i > 1 AND (i - 1) % 3 = 0 THEN
          -- 각 3개 그룹의 첫 노드는 이전 그룹 마지막에 연결
          UPDATE node_definitions
          SET prerequisites = ARRAY[smalls[i - 1]]
          WHERE id = smalls[i];
        END IF;
      END LOOP;
    END IF;

    -- 중형 노드: 해당 존 소형 3개 이상 투자 필요 (소형 3번째를 선행으로)
    IF mediums IS NOT NULL AND smalls IS NOT NULL AND array_length(smalls, 1) >= 3 THEN
      FOR i IN 1..array_length(mediums, 1)
      LOOP
        -- 각 중형 노드는 소형 노드 중 적절한 것을 선행으로
        IF i <= array_length(smalls, 1) / 3 THEN
          UPDATE node_definitions
          SET prerequisites = ARRAY[smalls[LEAST(i * 3, array_length(smalls, 1))]]
          WHERE id = mediums[i];
        ELSE
          -- 나머지 중형은 이전 중형을 선행으로
          UPDATE node_definitions
          SET prerequisites = ARRAY[mediums[i - 1]]
          WHERE id = mediums[i];
        END IF;
      END LOOP;
    END IF;

    -- 대형 노드: 해당 존 중형 2개 이상 필요
    IF larges IS NOT NULL AND mediums IS NOT NULL AND array_length(mediums, 1) >= 2 THEN
      FOR i IN 1..array_length(larges, 1)
      LOOP
        -- 각 대형 노드는 중형 2개를 선행으로
        UPDATE node_definitions
        SET prerequisites = ARRAY[
          mediums[LEAST(i * 2 - 1, array_length(mediums, 1))],
          mediums[LEAST(i * 2, array_length(mediums, 1))]
        ]
        WHERE id = larges[i];
      END LOOP;
    END IF;

  END LOOP;
END $$;

-- 센터 존의 대형 키스톤은 중앙 중형 2개 필요하도록 보장
-- (위 루프에서 이미 처리되었을 수 있으나 확인)

COMMIT;
