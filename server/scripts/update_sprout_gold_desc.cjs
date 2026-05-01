const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
const DESCS = {
  846: '개봉 시 Lv.1 클래스 무기 1개 + 방어구 5종 + 골드 50,000 획득. 장비는 접두사 3옵(T1~T2) 랜덤. 전부 계정 귀속.',
  847: '개봉 시 Lv.10 클래스 무기 1개 + 방어구 5종 + 골드 100,000 획득. 장비는 접두사 3옵(T1~T2) 랜덤. 전부 계정 귀속.',
  848: '개봉 시 Lv.30 클래스 무기+방어구 풀세트 + Lv.35 유니크 3종 + 골드 300,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
  849: '개봉 시 Lv.50 클래스 무기+방어구 풀세트 + Lv.55 유니크 3종 + 골드 500,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
  850: '개봉 시 Lv.70 클래스 무기+방어구 풀세트 + Lv.75 유니크 3종 + 골드 1,000,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
  851: '개봉 시 Lv.90 클래스 무기+방어구 풀세트 + Lv.95 유니크 3종 + 골드 2,000,000 획득. 접두사 3옵(T1~T2) 랜덤. 전부 귀속.',
};
(async () => {
  await c.connect();
  for (const [id, desc] of Object.entries(DESCS)) {
    await c.query('UPDATE items SET description = $1 WHERE id = $2', [desc, Number(id)]);
  }
  const { rows } = await c.query('SELECT id, description FROM items WHERE id BETWEEN 846 AND 851 ORDER BY id');
  for (const r of rows) console.log(`${r.id} | ${r.description}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
