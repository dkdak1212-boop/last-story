// 종언의 기둥 (Endless Pillar) — 라우트
// 입장 / 진행 상태 / 자진 포기 / 랭킹 (일일 + 명예의 전당)
// MVP 1차 — 어드민 전용 입장. 추후 server_settings flag 로 일반 오픈 토글 예정.

import { Router, type Response, type NextFunction } from 'express';
import { query } from '../db/pool.js';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';
import { loadCharacterOwned, loadCharacter } from '../game/character.js';
import { startCombatSession, stopCombatSession, isInCombat } from '../combat/engine.js';
import {
  ENDLESS_FIELD_ID,
  loadOrCreateProgress,
  loadProgress,
  resumeProgress,
  recordDeath,
  isBossFloor,
  bossMonsterIdForFloor,
  getScaleMultiplier,
} from '../game/endlessPillar.js';

const router = Router();
router.use(authRequired);

// 종언의 기둥 — 일반 오픈. 인증만 확인.
async function endlessAccessRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  next();
}

// 진행 상태 조회 — 사망 모달 / HUD 용
router.get('/:characterId/state', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const prog = await loadOrCreateProgress(cid);
  res.json({
    currentFloor: prog.current_floor,
    currentHp: prog.current_hp,
    paused: prog.paused,
    highestFloor: prog.highest_floor,
    dailyHighestFloor: prog.daily_highest_floor,
    totalKills: Number(prog.total_kills),
    totalDeaths: prog.total_deaths,
    nextBossFloor: Math.ceil(prog.current_floor / 100) * 100,
    isCurrentBossFloor: isBossFloor(prog.current_floor),
  });
});

// 입장 — paused 해제, 캐릭의 max_hp 로 HP 초기화 (current_hp 가 0 이면), startCombatSession
router.post('/:characterId/enter', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const full = await loadCharacter(cid);
  if (!full) return res.status(404).json({ error: 'character data missing' });

  await resumeProgress(cid, full.max_hp);

  // 기존 다른 컨텐츠 세션이 있으면 stopCombatSession 으로 정리 (외부 이동 = 일시정지 정책)
  if (isInCombat(cid)) {
    try { await stopCombatSession(cid); } catch (e) { console.error('[endless-enter] stop prev session', e); }
  }

  // 위치 표시용 location 변경 (사냥터 진입과 동일 패턴)
  await query(`UPDATE characters SET location = $1 WHERE id = $2`, [`field:${ENDLESS_FIELD_ID}`, cid]);

  // 종언 세션 시작 — engine 측 spawn 이 floor 기반으로 분기 처리
  await startCombatSession(cid, ENDLESS_FIELD_ID);

  const prog = await loadProgress(cid);
  res.json({
    ok: true,
    currentFloor: prog?.current_floor ?? 1,
    isBoss: isBossFloor(prog?.current_floor ?? 1),
  });
});

// 자진 포기 — 사망 처리 (-10층 회귀, paused)
router.post('/:characterId/give-up', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  // 현재 활성 세션 정리
  if (isInCombat(cid)) {
    try { await stopCombatSession(cid); } catch (e) { console.error('[endless-give-up] stop session', e); }
  }
  await recordDeath(cid);
  // 마을로 이동
  await query(
    `UPDATE characters SET hp = max_hp, location = 'village', last_online_at = NOW() WHERE id = $1`,
    [cid]
  );
  res.json({ ok: true });
});

// 일일 랭킹 — 200위까지 표기 (당일 도달 최고층 기준, 동점 시 daily_highest_at 빠른 순)
// ?class=warrior|mage|rogue|cleric|summoner 옵션으로 클래스별 랭킹 (없으면 전체)
const CLASS_FILTER = new Set(['warrior','mage','rogue','cleric','summoner']);
router.get('/ranking/daily', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cls = typeof req.query.class === 'string' && CLASS_FILTER.has(req.query.class) ? req.query.class : null;
  const r = await query<{
    character_id: number; name: string; class_name: string; level: number;
    guild_name: string | null;
    daily_highest_floor: number; daily_highest_at: string | null;
  }>(
    `SELECT epp.character_id, c.name, c.class_name, c.level,
            g.name AS guild_name,
            epp.daily_highest_floor, epp.daily_highest_at
       FROM endless_pillar_progress epp
       JOIN characters c ON c.id = epp.character_id
       LEFT JOIN guild_members gm ON gm.character_id = c.id
       LEFT JOIN guilds g ON g.id = gm.guild_id
      WHERE epp.daily_highest_floor > 0
        AND ($1::text IS NULL OR c.class_name = $1::text)
      ORDER BY epp.daily_highest_floor DESC, epp.daily_highest_at ASC
      LIMIT 200`, [cls]
  );
  res.json({
    rankings: r.rows.map((row, idx) => ({
      rank: idx + 1,
      characterId: row.character_id,
      name: row.name,
      className: row.class_name,
      level: row.level,
      guildName: row.guild_name,
      floor: row.daily_highest_floor,
      reachedAt: row.daily_highest_at,
    })),
  });
});

// 명예의 전당 — 역대 최고 도달층 200위까지 (?class= 옵션 동일)
router.get('/ranking/all-time', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cls = typeof req.query.class === 'string' && CLASS_FILTER.has(req.query.class) ? req.query.class : null;
  const r = await query<{
    character_id: number; name: string; class_name: string; level: number;
    guild_name: string | null;
    highest_floor: number;
  }>(
    `SELECT epp.character_id, c.name, c.class_name, c.level,
            g.name AS guild_name,
            epp.highest_floor
       FROM endless_pillar_progress epp
       JOIN characters c ON c.id = epp.character_id
       LEFT JOIN guild_members gm ON gm.character_id = c.id
       LEFT JOIN guilds g ON g.id = gm.guild_id
      WHERE epp.highest_floor > 0
        AND ($1::text IS NULL OR c.class_name = $1::text)
      ORDER BY epp.highest_floor DESC, epp.last_updated ASC
      LIMIT 200`, [cls]
  );
  res.json({
    rankings: r.rows.map((row, idx) => ({
      rank: idx + 1,
      characterId: row.character_id,
      name: row.name,
      className: row.class_name,
      level: row.level,
      guildName: row.guild_name,
      floor: row.highest_floor,
    })),
  });
});

// 랭킹 산출 시 자기 순위 별도 조회 (200위 밖 인지 확인용)
router.get('/:characterId/my-rank', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });

  const myProg = await loadProgress(cid);
  if (!myProg || myProg.daily_highest_floor === 0) {
    return res.json({ dailyRank: null, allTimeRank: null });
  }

  const dailyR = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM endless_pillar_progress
      WHERE daily_highest_floor > $1
         OR (daily_highest_floor = $1 AND daily_highest_at < $2)`,
    [myProg.daily_highest_floor, myProg.daily_highest_at]
  );
  const allTimeR = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM endless_pillar_progress
      WHERE highest_floor > $1`,
    [myProg.highest_floor]
  );
  res.json({
    dailyRank: Number(dailyR.rows[0].n) + 1,
    dailyFloor: myProg.daily_highest_floor,
    allTimeRank: Number(allTimeR.rows[0].n) + 1,
    allTimeFloor: myProg.highest_floor,
  });
});

// 디버그용: 현재 층의 보스 여부 / 스케일 / 다음 보스까지 거리
router.get('/:characterId/floor-info', endlessAccessRequired, async (req: AuthedRequest, res: Response) => {
  const cid = Number(req.params.characterId);
  const char = await loadCharacterOwned(cid, req.userId!);
  if (!char) return res.status(404).json({ error: 'not found' });
  const prog = await loadOrCreateProgress(cid);
  const f = prog.current_floor;
  res.json({
    floor: f,
    isBoss: isBossFloor(f),
    bossMonsterId: isBossFloor(f) ? bossMonsterIdForFloor(f) : null,
    scaleMultiplier: getScaleMultiplier(f),
    nextBossFloor: Math.ceil(f / 100) * 100,
    floorsToBoss: Math.ceil(f / 100) * 100 - f,
  });
});

export default router;
