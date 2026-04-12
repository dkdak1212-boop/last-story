const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`SELECT id, name, level FROM characters WHERE name = '근느'`);
  if (r.rowCount === 0) { console.error('캐릭터 없음'); process.exit(1); }
  const c = r.rows[0];
  console.log(`대상: ${c.name} (id=${c.id}) 현재 Lv.${c.level}`);

  const levelsGained = 100 - c.level;
  if (levelsGained <= 0) { console.log('이미 Lv.100'); await pool.end(); return; }

  const hpGain = levelsGained * 25;
  const nodePoints = levelsGained;
  const statPoints = levelsGained * 2;

  await pool.query(`
    UPDATE characters SET
      level = 100, exp = 0,
      max_hp = max_hp + $1, hp = max_hp + $1,
      node_points = node_points + $2,
      stat_points = COALESCE(stat_points, 0) + $3
    WHERE id = $4
  `, [hpGain, nodePoints, statPoints, c.id]);

  console.log(`Lv.${c.level} → Lv.100 (+HP ${hpGain}, +노드 ${nodePoints}, +스탯 ${statPoints})`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
