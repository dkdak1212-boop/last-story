const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 기존 노드 중복 방지
  const dup = await pool.query(
    `SELECT id FROM node_definitions WHERE class_exclusive = 'rogue' AND effects::text LIKE '%dot_to_crit%'`
  );
  if (dup.rowCount > 0) {
    console.log(`이미 존재: id=${dup.rows[0].id}`);
    await pool.end();
    return;
  }

  // 도적 노드 최대 x 확인
  const maxX = await pool.query(
    `SELECT MAX(position_x) AS mx FROM node_definitions WHERE class_exclusive = 'rogue'`
  );
  console.log(`도적 노드 최대 x: ${maxX.rows[0].mx}`);

  const effects = JSON.stringify([
    { type: 'passive', key: 'dot_to_crit', value: 50 },
    { type: 'passive', key: 'dot_penalty', value: 50 },
  ]);

  const r = await pool.query(
    `INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      '치명적 맹독',
      '도트 데미지 증가 1%당 치명타 데미지 0.5% 증가로 변환\n(아이템+노드+스킬 전부 반영)\n\n⚠ 도트 데미지 상시 -50%',
      'north_rogue',
      'huge',
      10,
      'rogue',
      effects,
      '{}',     // 선행 노드 없음
      42,       // 기존 최대(38)보다 오른쪽 분리 배치
      -18,
    ]
  );
  console.log(`노드 생성 완료: id=${r.rows[0].id}`);

  // 확인
  const check = await pool.query('SELECT id, name, cost, effects, prerequisites, position_x, position_y FROM node_definitions WHERE id = $1', [r.rows[0].id]);
  console.log(JSON.stringify(check.rows[0], null, 2));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
