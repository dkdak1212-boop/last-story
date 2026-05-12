const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const cols = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='mailbox' ORDER BY ordinal_position");
    console.log('mailbox columns:', cols.rows.map(x => x.column_name).join(', '));

    const mig = await p.query("SELECT name FROM _migrations WHERE name LIKE '%mailbox%' OR name LIKE '%soulbound%' ORDER BY name");
    console.log('migrations 관련:', mig.rows);

    const m = await p.query(`SELECT id, character_id, subject, item_id, item_quantity, enhance_level, prefix_ids, prefix_stats, quality, unidentified, read_at, created_at
       FROM mailbox WHERE subject LIKE '%거래소%' AND read_at IS NULL ORDER BY id DESC LIMIT 5`);
    console.log('미수령 거래소 우편 5건:');
    m.rows.forEach(r => console.log(' ', JSON.stringify(r)));
  } finally { await p.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
