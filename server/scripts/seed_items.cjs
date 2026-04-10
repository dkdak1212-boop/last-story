const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const NAMES = {1:'견습',10:'훈련용',20:'일반',30:'정교한',40:'정련된',50:'단단한',60:'강철',70:'정예',80:'영웅',90:'전설',100:'신화'};
const LEVELS = [1,10,20,30,40,50,60,70,80,90,100];
const W_ATK = {1:5,10:12,20:22,30:35,40:52,50:75,60:105,70:145,80:195,90:260,100:340};
const A_HP = {
  helm:{1:30,10:60,20:110,30:180,40:270,50:380,60:510,70:660,80:830,90:1020,100:1230},
  chest:{1:50,10:100,20:180,30:300,40:450,50:630,60:850,70:1100,80:1380,90:1700,100:2050},
  boots:{1:20,10:40,20:70,30:120,40:180,50:250,60:340,70:440,80:550,90:680,100:820},
};
const A_DEF = {
  helm:{1:2,10:4,20:7,30:12,40:18,50:26,60:35,70:46,80:58,90:72,100:88},
  chest:{1:4,10:8,20:14,30:24,40:36,50:52,60:70,70:92,80:116,90:144,100:176},
  boots:{1:2,10:4,20:6,30:10,40:15,50:22,60:30,70:40,80:52,90:66,100:82},
};
const ACC_ATK = {ring:{1:2,10:4,20:7,30:12,40:18,50:26,60:35,70:46,80:58,90:72,100:88},amulet:{1:3,10:6,20:10,30:17,40:25,50:36,60:49,70:64,80:80,90:100,100:122}};
const ACC_DEF = {ring:{1:1,10:2,20:4,30:7,40:11,50:16,60:22,70:29,80:37,90:46,100:57},amulet:{1:2,10:3,20:6,30:10,40:16,50:22,60:30,70:40,80:52,90:64,100:78}};
const ACC_HP = {ring:{1:10,10:20,20:40,30:70,40:110,50:160,60:220,70:290,80:370,90:460,100:570},amulet:{1:15,10:30,20:60,30:100,40:160,50:230,60:315,70:415,80:530,90:660,100:810}};

const WEAPONS = [
  { class: 'warrior', baseName: '검', mage: false },
  { class: 'mage', baseName: '지팡이', mage: true },
  { class: 'cleric', baseName: '홀', mage: true },
  { class: 'rogue', baseName: '단검', mage: false },
];

(async()=>{
  const client = await pool.connect();
  try {
    const maxR = await client.query('SELECT COALESCE(MAX(id),0) AS m FROM items');
    await client.query(`SELECT setval('items_id_seq', ${maxR.rows[0].m + 1})`);

    const rows = [];
    for (const w of WEAPONS) {
      for (const lv of LEVELS) {
        const atk = W_ATK[lv];
        const stats = w.mage ? { matk: atk } : { atk };
        rows.push({ name: NAMES[lv]+' '+w.baseName, type:'weapon', slot:'weapon', stats, desc: w.class+' 전용 무기', sell: atk*5, lv });
      }
    }
    const ARMOR = [{slot:'helm',name:'투구'},{slot:'chest',name:'갑옷'},{slot:'boots',name:'장화'}];
    for (const a of ARMOR) {
      for (const lv of LEVELS) {
        const stats = { hp: A_HP[a.slot][lv], def: A_DEF[a.slot][lv] };
        rows.push({ name: NAMES[lv]+' '+a.name, type:'armor', slot: a.slot, stats, desc:'방어구', sell: stats.hp + stats.def*5, lv });
      }
    }
    const ACC = [{slot:'ring',name:'반지'},{slot:'amulet',name:'목걸이'}];
    for (const a of ACC) {
      for (const lv of LEVELS) {
        const stats = { atk: ACC_ATK[a.slot][lv], def: ACC_DEF[a.slot][lv], hp: ACC_HP[a.slot][lv] };
        rows.push({ name: NAMES[lv]+' '+a.name, type:'accessory', slot: a.slot, stats, desc:'악세서리', sell: stats.atk*8 + stats.def*5 + stats.hp, lv });
      }
    }

    const values = [];
    const params = [];
    rows.forEach((r, i) => {
      const off = i * 7;
      values.push(`($${off+1},$${off+2},'common',$${off+3},$${off+4}::jsonb,$${off+5},1,$${off+6},$${off+7})`);
      params.push(r.name, r.type, r.slot, JSON.stringify(r.stats), r.desc, r.sell, r.lv);
    });
    const sql = `INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level) VALUES ${values.join(',')}`;
    const result = await client.query(sql, params);
    console.log('INSERT 완료:', result.rowCount, '/', rows.length);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
