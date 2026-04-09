import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const type = (req.query.type as string) || 'level';
  const limit = 100;

  let sql: string;
  let mapFn: (row: any, idx: number) => any;

  switch (type) {
    case 'gold':
      sql = `SELECT c.id, c.name, c.class_name, c.level, c.gold, c.exp
             FROM characters c JOIN users u ON u.id = c.user_id WHERE u.is_admin = FALSE
             ORDER BY c.gold DESC, c.level DESC LIMIT ${limit}`;
      mapFn = (row, idx) => ({ rank: idx + 1, id: row.id, name: row.name, className: row.class_name, level: row.level, value: Number(row.gold), label: `${Number(row.gold).toLocaleString()}G` });
      break;

    case 'pvp':
      sql = `SELECT c.id, c.name, c.class_name, c.level, COALESCE(p.elo, 1000) as elo, COALESCE(p.wins, 0) as wins, COALESCE(p.losses, 0) as losses
             FROM characters c JOIN users u ON u.id = c.user_id
             LEFT JOIN pvp_stats p ON p.character_id = c.id
             WHERE u.is_admin = FALSE
             ORDER BY COALESCE(p.elo, 1000) DESC LIMIT ${limit}`;
      mapFn = (row, idx) => ({ rank: idx + 1, id: row.id, name: row.name, className: row.class_name, level: row.level, value: Number(row.elo), label: `ELO ${Number(row.elo)}`, extra: `${row.wins}승 ${row.losses}패` });
      break;

    case 'enhance':
      sql = `SELECT c.id, c.name, c.class_name, c.level, MAX(ce.enhance_level) as max_enhance, i.name as item_name
             FROM characters c JOIN users u ON u.id = c.user_id
             JOIN character_equipped ce ON ce.character_id = c.id
             JOIN items i ON i.id = ce.item_id
             WHERE u.is_admin = FALSE
             GROUP BY c.id, c.name, c.class_name, c.level, i.name
             ORDER BY MAX(ce.enhance_level) DESC, c.level DESC LIMIT ${limit}`;
      mapFn = (row, idx) => ({ rank: idx + 1, id: row.id, name: row.name, className: row.class_name, level: row.level, value: Number(row.max_enhance), label: `+${row.max_enhance}`, extra: row.item_name });
      break;

    case 'kill':
      sql = `SELECT c.id, c.name, c.class_name, c.level, COALESCE(SUM(r.kill_count), 0)::text as kills
             FROM characters c JOIN users u ON u.id = c.user_id
             LEFT JOIN offline_reports r ON r.character_id = c.id
             WHERE u.is_admin = FALSE
             GROUP BY c.id, c.name, c.class_name, c.level
             ORDER BY COALESCE(SUM(r.kill_count), 0) DESC LIMIT ${limit}`;
      mapFn = (row, idx) => ({ rank: idx + 1, id: row.id, name: row.name, className: row.class_name, level: row.level, value: Number(row.kills), label: `${Number(row.kills).toLocaleString()}킬` });
      break;

    case 'level':
    default:
      sql = `SELECT c.id, c.name, c.class_name, c.level, c.gold, c.exp
             FROM characters c JOIN users u ON u.id = c.user_id WHERE u.is_admin = FALSE
             ORDER BY c.level DESC, c.exp DESC LIMIT ${limit}`;
      mapFn = (row, idx) => ({ rank: idx + 1, id: row.id, name: row.name, className: row.class_name, level: row.level, value: row.level, label: `Lv.${row.level}` });
      break;
  }

  const r = await query(sql);
  res.json(r.rows.map(mapFn));
});

export default router;
