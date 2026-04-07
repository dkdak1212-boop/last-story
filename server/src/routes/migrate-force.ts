import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();

router.post('/run', async (_req, res) => {
  const log: string[] = [];
  try {
    await query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);
    const applied = await query(`SELECT 1 FROM _migrations WHERE name = 'equip_overhaul_v3'`);
    if (applied.rowCount && applied.rowCount > 0) {
      return res.json({ status: 'already applied', log: ['equip_overhaul_v3 이미 적용됨'] });
    }

    log.push('1. 기존 장비 삭제');
    await query(`DELETE FROM character_inventory WHERE item_id IN (SELECT id FROM items WHERE slot IS NOT NULL)`);
    await query(`DELETE FROM character_equipped WHERE item_id IN (SELECT id FROM items WHERE slot IS NOT NULL)`);
    await query(`DELETE FROM items WHERE slot IS NOT NULL`);
    await query(`DELETE FROM character_inventory WHERE item_id >= 1000`);
    await query(`DELETE FROM character_equipped WHERE item_id >= 1000`);
    await query(`DELETE FROM items WHERE id >= 1000`);
    await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS required_level INT NOT NULL DEFAULT 1`);
    log.push('  완료');

    log.push('2. 장비 생성');
    const tiers = [{ lvl:1,label:'초급',maxLv:15 },{ lvl:16,label:'중급',maxLv:30 },{ lvl:31,label:'상급',maxLv:50 },{ lvl:51,label:'전설',maxLv:70 }];
    const grades = [{ g:'common',mult:1.0,label:'' },{ g:'rare',mult:1.2,label:'정예 ' },{ g:'epic',mult:1.4,label:'영웅 ' },{ g:'legendary',mult:2.0,label:'전설 ' }];
    const bAtk=[15,40,80,150], bDef=[8,22,45,85], bMdef=[5,15,30,60], bHp=[30,80,160,300], bAccAtk=[5,14,28,55], bAccHp=[15,40,80,150], bAccDef=[4,11,22,42];
    let id = 1000;
    const wIds:any={}, aIds:any={}, acIds:any={};
    const wClasses = [{cls:'warrior',name:'대검',at:'atk'},{cls:'mage',name:'지팡이',at:'matk'},{cls:'cleric',name:'홀',at:'matk'},{cls:'rogue',name:'단검',at:'atk'}];

    for (let ti=0;ti<4;ti++) { for (const g of grades) { for (const wc of wClasses) {
      const atk=Math.round(bAtk[ti]*g.mult); const s:any={}; s[wc.at]=atk;
      await query(`INSERT INTO items (id,name,type,grade,slot,stats,description,stack_size,sell_price,required_level) VALUES ($1,$2,'weapon',$3,'weapon',$4::jsonb,$5,1,$6,$7) ON CONFLICT(id) DO UPDATE SET name=$2,grade=$3,stats=$4::jsonb,description=$5,sell_price=$6,required_level=$7`,
        [id,`${g.label}${tiers[ti].label} ${wc.name}`,g.g,JSON.stringify(s),`Lv.${tiers[ti].lvl}~${tiers[ti].maxLv} ${wc.cls}`,atk*2,tiers[ti].lvl]);
      if(!wIds[wc.cls])wIds[wc.cls]={}; if(!wIds[wc.cls][ti])wIds[wc.cls][ti]={}; wIds[wc.cls][ti][g.g]=id; id++;
    }}}
    log.push(`  무기 ${id-1000}개`);

    const aSlots=[{sl:'helm',nm:'투구',fn:(t:number,m:number)=>({def:Math.round(bDef[t]*0.6*m),mdef:Math.round(bMdef[t]*0.6*m)})},{sl:'chest',nm:'갑옷',fn:(t:number,m:number)=>({def:Math.round(bDef[t]*m),hp:Math.round(bHp[t]*m)})},{sl:'boots',nm:'장화',fn:(t:number,m:number)=>({mdef:Math.round(bMdef[t]*m),hp:Math.round(bHp[t]*0.6*m)})}];
    for(let ti=0;ti<4;ti++){for(const g of grades){for(const a of aSlots){
      const s=a.fn(ti,g.mult);
      await query(`INSERT INTO items (id,name,type,grade,slot,stats,description,stack_size,sell_price,required_level) VALUES ($1,$2,'armor',$3,$4,$5::jsonb,$6,1,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,grade=$3,slot=$4,stats=$5::jsonb,description=$6,sell_price=$7,required_level=$8`,
        [id,`${g.label}${tiers[ti].label} ${a.nm}`,g.g,a.sl,JSON.stringify(s),`Lv.${tiers[ti].lvl}~${tiers[ti].maxLv}`,Object.values(s).reduce((a:number,b:number)=>a+b,0),tiers[ti].lvl]);
      if(!aIds[a.sl])aIds[a.sl]={}; if(!aIds[a.sl][ti])aIds[a.sl][ti]={}; aIds[a.sl][ti][g.g]=id; id++;
    }}}

    const acSlots=[{sl:'ring',nm:'반지',fn:(t:number,m:number)=>({atk:Math.round(bAccAtk[t]*m),matk:Math.round(bAccAtk[t]*m)})},{sl:'amulet',nm:'목걸이',fn:(t:number,m:number)=>({hp:Math.round(bAccHp[t]*m),def:Math.round(bAccDef[t]*m)})}];
    for(let ti=0;ti<4;ti++){for(const g of grades){for(const ac of acSlots){
      const s=ac.fn(ti,g.mult);
      await query(`INSERT INTO items (id,name,type,grade,slot,stats,description,stack_size,sell_price,required_level) VALUES ($1,$2,'accessory',$3,$4,$5::jsonb,$6,1,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,grade=$3,slot=$4,stats=$5::jsonb,description=$6,sell_price=$7,required_level=$8`,
        [id,`${g.label}${tiers[ti].label} ${ac.nm}`,g.g,ac.sl,JSON.stringify(s),`Lv.${tiers[ti].lvl}~${tiers[ti].maxLv}`,Object.values(s).reduce((a:number,b:number)=>a+b,0),tiers[ti].lvl]);
      if(!acIds[ac.sl])acIds[ac.sl]={}; if(!acIds[ac.sl][ti])acIds[ac.sl][ti]={}; acIds[ac.sl][ti][g.g]=id; id++;
    }}}
    log.push(`  총 ${id-1000}개 생성`);

    log.push('3. 드랍테이블');
    await query(`UPDATE monsters SET drop_table='[]'::jsonb`);
    const ms=await query<{id:number;level:number}>('SELECT id,level FROM monsters');
    const pots=[{mn:1,mx:15,id:100,c:0.3},{mn:16,mx:30,id:102,c:0.25},{mn:31,mx:50,id:104,c:0.2},{mn:51,mx:999,id:106,c:0.15}];
    const tfl=(l:number)=>l<=15?0:l<=30?1:l<=50?2:3;
    for(const m of ms.rows){
      const d:any[]=[];const ti=tfl(m.level);
      const p=pots.find(p=>m.level>=p.mn&&m.level<=p.mx)||pots[3];
      d.push({itemId:p.id,chance:p.c,minQty:1,maxQty:2});
      for(const wc of wClasses){d.push({itemId:wIds[wc.cls][ti].common,chance:0.02,minQty:1,maxQty:1});d.push({itemId:wIds[wc.cls][ti].rare,chance:0.008,minQty:1,maxQty:1});d.push({itemId:wIds[wc.cls][ti].epic,chance:0.003,minQty:1,maxQty:1});d.push({itemId:wIds[wc.cls][ti].legendary,chance:0.001,minQty:1,maxQty:1});}
      for(const a of aSlots){d.push({itemId:aIds[a.sl][ti].common,chance:0.015,minQty:1,maxQty:1});d.push({itemId:aIds[a.sl][ti].rare,chance:0.006,minQty:1,maxQty:1});d.push({itemId:aIds[a.sl][ti].epic,chance:0.002,minQty:1,maxQty:1});d.push({itemId:aIds[a.sl][ti].legendary,chance:0.0008,minQty:1,maxQty:1});}
      for(const ac of acSlots){d.push({itemId:acIds[ac.sl][ti].common,chance:0.01,minQty:1,maxQty:1});d.push({itemId:acIds[ac.sl][ti].rare,chance:0.004,minQty:1,maxQty:1});d.push({itemId:acIds[ac.sl][ti].epic,chance:0.0015,minQty:1,maxQty:1});d.push({itemId:acIds[ac.sl][ti].legendary,chance:0.0005,minQty:1,maxQty:1});}
      await query('UPDATE monsters SET drop_table=$1::jsonb WHERE id=$2',[JSON.stringify(d),m.id]);
    }
    log.push(`  ${ms.rowCount}마리`);

    log.push('4. 유저 지급');
    const chars=await query<{id:number;level:number;class_name:string}>('SELECT id,level,class_name FROM characters');
    for(const c of chars.rows){
      const ti=tfl(c.level);
      const wId=wIds[c.class_name]?.[ti]?.common;
      if(wId)await query(`INSERT INTO mailbox(character_id,subject,body,item_id,item_quantity,gold)VALUES($1,'장비개편보상','무기',$2,1,0)`,[c.id,wId]);
      for(const a of aSlots){const ai=aIds[a.sl]?.[ti]?.common;if(!ai)continue;const u=await query<{slot_index:number}>('SELECT slot_index FROM character_inventory WHERE character_id=$1',[c.id]);const us=new Set(u.rows.map(r=>r.slot_index));let f=-1;for(let i=0;i<100;i++){if(!us.has(i)){f=i;break;}}if(f<0)continue;await query(`INSERT INTO character_inventory(character_id,item_id,slot_index,quantity,prefix_ids,prefix_stats)VALUES($1,$2,$3,1,$4,$5::jsonb)`,[c.id,ai,f,[],JSON.stringify({})]);}
      for(const ac of acSlots){const ai=acIds[ac.sl]?.[ti]?.common;if(!ai)continue;const u=await query<{slot_index:number}>('SELECT slot_index FROM character_inventory WHERE character_id=$1',[c.id]);const us=new Set(u.rows.map(r=>r.slot_index));let f=-1;for(let i=0;i<100;i++){if(!us.has(i)){f=i;break;}}if(f<0)continue;await query(`INSERT INTO character_inventory(character_id,item_id,slot_index,quantity,prefix_ids,prefix_stats)VALUES($1,$2,$3,1,$4,$5::jsonb)`,[c.id,ai,f,[],JSON.stringify({})]);}
    }
    log.push(`  ${chars.rowCount}캐릭터`);

    await query(`DELETE FROM character_inventory WHERE item_id NOT IN (SELECT id FROM items)`);
    await query(`DELETE FROM character_equipped WHERE item_id NOT IN (SELECT id FROM items)`);
    await query(`INSERT INTO _migrations(name)VALUES('equip_overhaul_v3') ON CONFLICT DO NOTHING`);
    log.push('5. 완료!');
    res.json({status:'success',log});
  } catch(e:any){log.push(`ERROR: ${e.message}`);res.json({status:'error',error:e.message,log});}
});

export default router;
