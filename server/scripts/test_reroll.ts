import { rerollPrefixValues } from '../src/game/prefix.js';

(async () => {
  const prev = { vit: 5, guardian_pct: 2 };
  console.log('--- whole (prev preserved when prefix missing) ---');
  for (let i = 0; i < 5; i++) {
    const r = await rerollPrefixValues([13, 77], 35, { prevStats: prev });
    console.log(i, ':', JSON.stringify(r.bonusStats));
  }
  console.log('--- idx 0 reroll (vit targeted) ---');
  for (let i = 0; i < 3; i++) {
    const r = await rerollPrefixValues([13, 77], 35, { targetIndex: 0, prevStats: prev });
    console.log(i, ':', JSON.stringify(r.bonusStats));
  }
  console.log('--- idx 1 reroll (guardian_pct — missing in local cache!) ---');
  for (let i = 0; i < 3; i++) {
    const r = await rerollPrefixValues([13, 77], 35, { targetIndex: 1, prevStats: prev });
    console.log(i, ':', JSON.stringify(r.bonusStats));
  }
  process.exit(0);
})();
