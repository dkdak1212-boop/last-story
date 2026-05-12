const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
const USER_ID = 707;

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const ur = await c.query('SELECT id, username, is_admin FROM users WHERE id = $1', [USER_ID]);
    if (ur.rowCount === 0) { console.log('user not found'); return; }
    if (ur.rows[0].is_admin) { console.log('admin account, abort'); return; }
    console.log(`삭제 대상: ${ur.rows[0].username} (id=${ur.rows[0].id})`);

    const charR = await c.query('SELECT id, name FROM characters WHERE user_id = $1', [USER_ID]);
    const charIds = charR.rows.map(r => r.id);
    console.log(`캐릭 ${charIds.length}개: ${charR.rows.map(r => `${r.name}(#${r.id})`).join(', ')}`);

    if (charIds.length > 0) {
      const cleanupTables = [
        'item_drop_log', 'enhance_log', 'guestbook', 'feedback',
        'announcement_reads', 'board_posts', 'board_comments', 'board_reports',
        'pvp_battles', 'pvp_cooldowns', 'guild_boss_runs', 'guild_boss_guild_daily',
        'guild_boss_weekly_settlements', 'guild_boss_shop_purchases',
        'world_event_participants', 'premium_purchases',
      ];
      for (const t of cleanupTables) {
        try {
          const r = await c.query(`DELETE FROM ${t} WHERE character_id = ANY($1::int[])`, [charIds]);
          if (r.rowCount && r.rowCount > 0) console.log(`  ${t}: ${r.rowCount}행 삭제`);
        } catch (e) { /* table or column missing */ }
      }
      try {
        const r = await c.query(`DELETE FROM auctions WHERE seller_id = ANY($1::int[])`, [charIds]);
        if (r.rowCount && r.rowCount > 0) console.log(`  auctions(seller): ${r.rowCount}`);
      } catch (e) {}
      try {
        const r = await c.query(`UPDATE auctions SET current_bidder_id = NULL WHERE current_bidder_id = ANY($1::int[])`, [charIds]);
        if (r.rowCount && r.rowCount > 0) console.log(`  auctions(bidder→NULL): ${r.rowCount}`);
      } catch (e) {}
      try {
        const r = await c.query(`DELETE FROM party_invites WHERE to_id = ANY($1::int[]) OR from_id = ANY($1::int[])`, [charIds]);
        if (r.rowCount && r.rowCount > 0) console.log(`  party_invites: ${r.rowCount}`);
      } catch (e) {}
      try {
        const r = await c.query(`UPDATE pvp_battles SET winner_id = NULL WHERE winner_id = ANY($1::int[])`, [charIds]);
        if (r.rowCount && r.rowCount > 0) console.log(`  pvp_battles(winner→NULL): ${r.rowCount}`);
      } catch (e) {}
      try {
        const gr = await c.query(`SELECT id, name FROM guilds WHERE leader_id = ANY($1::int[])`, [charIds]);
        if (gr.rowCount && gr.rowCount > 0) {
          const gids = gr.rows.map(r => r.id);
          console.log(`  길드장 길드 ${gids.length}개 삭제: ${gr.rows.map(r => r.name).join(', ')}`);
          await c.query(`DELETE FROM guild_members WHERE guild_id = ANY($1::int[])`, [gids]);
          await c.query(`DELETE FROM guilds WHERE id = ANY($1::int[])`, [gids]);
        }
      } catch (e) { console.error('  guild cleanup err', e.message); }
    }

    const userCleanup = ['user_login_log', 'premium_purchases'];
    for (const t of userCleanup) {
      try {
        const r = await c.query(`DELETE FROM ${t} WHERE user_id = $1`, [USER_ID]);
        if (r.rowCount && r.rowCount > 0) console.log(`  ${t}: ${r.rowCount}`);
      } catch (e) {}
    }

    const final = await c.query('DELETE FROM users WHERE id = $1', [USER_ID]);
    console.log(`\n✅ users 삭제: ${final.rowCount}행`);
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
