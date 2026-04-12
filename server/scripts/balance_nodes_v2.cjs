const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 전사 war_god 40 → 60
  const wg = await pool.query(`
    SELECT id, effects FROM node_definitions
    WHERE class_exclusive = 'warrior' AND effects::text LIKE '%war_god%'
  `);
  for (const row of wg.rows) {
    const effects = row.effects.map(e => e.key === 'war_god' ? { ...e, value: 60 } : e);
    await pool.query('UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2', [JSON.stringify(effects), row.id]);
    console.log(`전사 war_god → 60`);
  }

  // 도적 poison_burst_amp 총합 50 → 30 (비례 축소)
  const pb = await pool.query(`
    SELECT id, name, effects FROM node_definitions
    WHERE class_exclusive = 'rogue' AND effects::text LIKE '%poison_burst_amp%'
  `);
  for (const row of pb.rows) {
    const effects = row.effects.map(e => {
      if (e.key === 'poison_burst_amp') return { ...e, value: Math.round(e.value * (30 / 50)) };
      return e;
    });
    await pool.query('UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2', [JSON.stringify(effects), row.id]);
    console.log(`도적 ${row.name} poison_burst_amp 하향`);
  }

  console.log('완료');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
