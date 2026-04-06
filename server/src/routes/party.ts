import { Router, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned } from '../game/character.js';

const router = Router();
router.use(authRequired);

const PARTY_MAX = 4;

// 내 파티 정보
router.get('/my/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const pm = await query<{ party_id: number; leader_id: number }>(
    `SELECT pm.party_id, p.leader_id
     FROM party_members pm JOIN parties p ON p.id = pm.party_id
     WHERE pm.character_id = $1`,
    [cid]
  );
  if (pm.rowCount === 0) return res.json({ party: null, invites: await listInvites(cid) });

  const mr = await query<{ character_id: number; name: string; level: number; class_name: string }>(
    `SELECT pm.character_id, c.name, c.level, c.class_name
     FROM party_members pm JOIN characters c ON c.id = pm.character_id
     WHERE pm.party_id = $1 ORDER BY pm.joined_at`,
    [pm.rows[0].party_id]
  );
  res.json({
    party: {
      id: pm.rows[0].party_id,
      isLeader: pm.rows[0].leader_id === cid,
      members: mr.rows.map(m => ({ id: m.character_id, name: m.name, level: m.level, className: m.class_name })),
    },
    invites: await listInvites(cid),
  });
});

async function listInvites(cid: number) {
  const r = await query<{ id: number; party_id: number; from_name: string }>(
    `SELECT pi.id, pi.party_id, c.name AS from_name
     FROM party_invites pi JOIN characters c ON c.id = pi.from_id
     WHERE pi.to_id = $1 ORDER BY pi.created_at DESC`,
    [cid]
  );
  return r.rows;
}

// 파티 초대 (없으면 파티 생성 후 초대)
router.post('/invite', async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({
    fromCharacterId: z.number().int().positive(),
    toName: z.string().min(1).max(12),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.fromCharacterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const target = await query<{ id: number }>('SELECT id FROM characters WHERE name = $1', [parsed.data.toName]);
  if (target.rowCount === 0) return res.status(404).json({ error: 'target not found' });
  if (target.rows[0].id === char.id) return res.status(400).json({ error: 'cannot invite self' });

  // 대상이 이미 파티 있음
  const targetParty = await query('SELECT 1 FROM party_members WHERE character_id = $1', [target.rows[0].id]);
  if (targetParty.rowCount && targetParty.rowCount > 0) return res.status(400).json({ error: 'target already in party' });

  // 내가 파티에 없으면 생성
  let partyId: number;
  const myParty = await query<{ party_id: number; leader_id: number }>(
    `SELECT pm.party_id, p.leader_id FROM party_members pm JOIN parties p ON p.id = pm.party_id WHERE pm.character_id = $1`,
    [char.id]
  );
  if (myParty.rowCount === 0) {
    const p = await query<{ id: number }>('INSERT INTO parties (leader_id) VALUES ($1) RETURNING id', [char.id]);
    partyId = p.rows[0].id;
    await query('INSERT INTO party_members (party_id, character_id) VALUES ($1, $2)', [partyId, char.id]);
  } else {
    if (myParty.rows[0].leader_id !== char.id) return res.status(403).json({ error: 'only leader can invite' });
    partyId = myParty.rows[0].party_id;
    // 파티 인원 체크
    const mc = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM party_members WHERE party_id = $1', [partyId]);
    if (Number(mc.rows[0].count) >= PARTY_MAX) return res.status(400).json({ error: 'party full' });
  }

  await query(
    `INSERT INTO party_invites (party_id, from_id, to_id) VALUES ($1, $2, $3)
     ON CONFLICT (party_id, to_id) DO NOTHING`,
    [partyId, char.id, target.rows[0].id]
  );
  res.json({ ok: true });
});

// 초대 수락
router.post('/invite/:inviteId/accept', async (req: AuthedRequest, res: Response) => {
  const inviteId = Number(req.params.inviteId);
  const parsed = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(parsed.data.characterId, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const inv = await query<{ party_id: number; to_id: number }>(
    'SELECT party_id, to_id FROM party_invites WHERE id = $1', [inviteId]
  );
  if (inv.rowCount === 0) return res.status(404).json({ error: 'invite not found' });
  if (inv.rows[0].to_id !== char.id) return res.status(403).json({ error: 'not your invite' });

  // 이미 파티 있음
  const ex = await query('SELECT 1 FROM party_members WHERE character_id = $1', [char.id]);
  if (ex.rowCount && ex.rowCount > 0) return res.status(400).json({ error: 'already in party' });

  const mc = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM party_members WHERE party_id = $1', [inv.rows[0].party_id]);
  if (Number(mc.rows[0].count) >= PARTY_MAX) return res.status(400).json({ error: 'party full' });

  await query('INSERT INTO party_members (party_id, character_id) VALUES ($1, $2)', [inv.rows[0].party_id, char.id]);
  await query('DELETE FROM party_invites WHERE id = $1 OR to_id = $2', [inviteId, char.id]);
  res.json({ ok: true });
});

// 초대 거절
router.post('/invite/:inviteId/decline', async (req: AuthedRequest, res: Response) => {
  const inviteId = Number(req.params.inviteId);
  await query('DELETE FROM party_invites WHERE id = $1', [inviteId]);
  res.json({ ok: true });
});

// 파티 탈퇴
router.post('/leave/:characterId', async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const r = await query<{ party_id: number; leader_id: number }>(
    `SELECT pm.party_id, p.leader_id FROM party_members pm JOIN parties p ON p.id = pm.party_id
     WHERE pm.character_id = $1`, [cid]
  );
  if (r.rowCount === 0) return res.status(400).json({ error: 'not in party' });

  await query('DELETE FROM party_members WHERE character_id = $1', [cid]);
  // 파티장이 탈퇴 → 파티 해산
  if (r.rows[0].leader_id === cid) {
    await query('DELETE FROM parties WHERE id = $1', [r.rows[0].party_id]);
  }
  res.json({ ok: true });
});

// 멤버 추방 (파티장만)
router.post('/kick/:characterId', async (req: AuthedRequest, res: Response) => {
  const leaderCid = Number(req.params.characterId);
  const parsed = z.object({ targetId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const char = await loadCharacterOwned(leaderCid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const r = await query<{ party_id: number; leader_id: number }>(
    `SELECT pm.party_id, p.leader_id FROM party_members pm JOIN parties p ON p.id = pm.party_id
     WHERE pm.character_id = $1`, [leaderCid]
  );
  if (r.rowCount === 0 || r.rows[0].leader_id !== leaderCid) return res.status(403).json({ error: 'not leader' });

  await query('DELETE FROM party_members WHERE party_id = $1 AND character_id = $2', [r.rows[0].party_id, parsed.data.targetId]);
  res.json({ ok: true });
});

export default router;
