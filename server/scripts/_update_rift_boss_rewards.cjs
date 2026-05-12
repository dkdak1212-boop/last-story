const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const UPDATES = [
  { id: 500, name: '차원의 잔재',   exp: 100000, gold: 1000 },
  { id: 501, name: '시공의 수호자', exp: 200000, gold: 2000 },
  { id: 502, name: '균열의 군주',   exp: 300000, gold: 3000 },
];
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    for (const u of UPDATES) {
      const before = await c.query('SELECT exp_reward, gold_reward FROM monsters WHERE id = $1', [u.id]);
      if (before.rowCount === 0) { console.log(`✗ #${u.id} ${u.name} 없음`); continue; }
      const r = await c.query('UPDATE monsters SET exp_reward = $1, gold_reward = $2 WHERE id = $3 RETURNING name, exp_reward, gold_reward', [u.exp, u.gold, u.id]);
      const b = before.rows[0];
      const a = r.rows[0];
      console.log(`✓ ${a.name} (#${u.id})`);
      console.log(`  EXP  ${b.exp_reward.toLocaleString()} → ${a.exp_reward.toLocaleString()}`);
      console.log(`  골드 ${b.gold_reward.toLocaleString()} → ${a.gold_reward.toLocaleString()}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
