const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  // 전사 노드 좌표 분포 (참고용)
  const r = await pool.query(`SELECT tier, position_x, position_y FROM node_definitions WHERE class_exclusive = 'warrior' ORDER BY position_y, position_x`);
  console.log(`전사 노드 ${r.rowCount}개 — 좌표 범위`);
  let minX=999,maxX=-999,minY=999,maxY=-999;
  r.rows.forEach(n => {
    minX = Math.min(minX, n.position_x); maxX = Math.max(maxX, n.position_x);
    minY = Math.min(minY, n.position_y); maxY = Math.max(maxY, n.position_y);
  });
  console.log(`x: ${minX}~${maxX}, y: ${minY}~${maxY}`);
  console.log('처음 20개:', r.rows.slice(0, 20).map(r => `${r.tier}(${r.position_x},${r.position_y})`).join(' '));
  await pool.end();
})();
