const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  await pool.query(`UPDATE node_definitions SET description = '독 데미지 +30%, 독 지속시간 +3행동' WHERE name = '독의 군주'`);
  console.log('완료');
  await pool.end();
})();
