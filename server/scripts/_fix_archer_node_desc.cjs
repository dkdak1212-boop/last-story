const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const updates = [
      { id: 1056, desc: '연속 처치마다 CRI +5 (최대 5중첩, 피격·사망 시 초기화) · SPD +30' },
    ];
    for (const u of updates) {
      const r = await c.query(`UPDATE node_definitions SET description = $1 WHERE id = $2 RETURNING name`, [u.desc, u.id]);
      for (const row of r.rows) console.log(`✓ #${u.id} ${row.name}\n  → ${u.desc}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
