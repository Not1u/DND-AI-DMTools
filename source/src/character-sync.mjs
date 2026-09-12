import {createHash} from 'node:crypto';

const str={type:'string'},num={type:'number'};
export const characterTools=[['character.update','将已裁定的剧情奖励/穿戴写入角色。grant只入背包；需要穿戴时同时给slot。装备自动计算AC，不要把奖励仅写在正文。相同changeId重试不重复增加；数值必须来自规则或已确认剧情。',{
 type:'object',additionalProperties:false,required:['actorId','changeId','reason'],properties:{actorId:str,changeId:str,reason:str,slot:{type:'string',enum:['armor','shield','mainHand','offHand','worn']},key:str,clear:{type:'boolean'},removeKey:str,item:{type:'object',additionalProperties:false,required:['key','name'],properties:{key:str,name:str,kind:str,qty:num,base:num,dexCap:{type:['number','null']},acBonus:num,magicBonus:num,damage:str,dmgType:str,props:{type:'array',items:str},desc:str}}}
}]];

export function installCharacter({reg,ops,load,capture,commit,event,entity,check,loadSrd}){
 reg('character.update',async args=>{
  if(!args.reason?.trim()||!args.changeId||!/^[\w-]{1,100}$/.test(args.changeId))throw Error('需要reason和稳定changeId。');
  const b=await load(),key=args.actorId+':'+args.changeId;
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const digest=createHash('sha256').update(JSON.stringify(canonical(args))).digest('hex');
  const receipt=b.characterReceipts?.[key];
  if(receipt){if(receipt.digest!==digest)throw Error('同一changeId不能用于不同修改。');return {...receipt.result,duplicate:true}}
  if(b.active)throw Error('请先完成当前行动。');
  const w=await capture(),u=entity(w,args.actorId),pc=u.pc;
  if(!pc)throw Error('只能更新真实角色卡。');
  const before=check(await ops['party.sheet']({id:pc.id})).sheet,srd=await loadSrd();
  pc.inventory=pc.inventory||[];
  const hadEquipment=!!pc.equipment;
  pc.equipment=pc.equipment||structuredClone(before.equipment||{armor:null,shield:null,mainHand:null,offHand:null,worn:[]});
  if(!hadEquipment&&!pc.equipment.mainHand&&pc.weapons?.[0]&&srd.weapons[pc.weapons[0]])pc.equipment.mainHand={key:pc.weapons[0],...srd.weapons[pc.weapons[0]]};
  let changed=false;
  if(args.item){
   const raw=args.item;
   if(!raw.key?.trim()||!raw.name?.trim())throw Error('物品需要key与name。');
   const qty=raw.qty??1;if(!Number.isInteger(qty)||qty<1||qty>999)throw Error('物品数量无效。');
   for(const field of ['base','dexCap','acBonus','magicBonus'])if(raw[field]!=null&&(!Number.isFinite(raw[field])||Math.abs(raw[field])>100))throw Error('物品数值无效：'+field);
   if(raw.damage&&!/^\d+d\d+(?:[+-]\d+)?$/.test(raw.damage))throw Error('伤害公式无效。');
   const def=srd.weapons[raw.key]||srd.armor[raw.key]||{};
   const item={...def,...raw,qty,kind:raw.kind||(srd.weapons[raw.key]?'weapon':srd.armor[raw.key]?'armor':'gear')};
   const existing=pc.inventory.find(i=>i.key===item.key);
   if(existing){for(const f of ['base','dexCap','acBonus','magicBonus','damage'])if(item[f]!=null&&existing[f]!=null&&item[f]!==existing[f])throw Error('同key物品的属性不同，请使用独立物品key。');existing.qty=(existing.qty||1)+qty}else pc.inventory.push(item);
   changed=true;
  }
  if(args.removeKey){pc.inventory=pc.inventory.filter(i=>i.key!==args.removeKey);for(const slot of ['armor','shield','mainHand','offHand'])if(pc.equipment[slot]?.key===args.removeKey)pc.equipment[slot]=null;pc.equipment.worn=(pc.equipment.worn||[]).filter(i=>i.key!==args.removeKey);changed=true}
  if(args.slot){
   if(!['armor','shield','mainHand','offHand','worn'].includes(args.slot))throw Error('装备槽位无效。');
   if(args.clear){pc.equipment[args.slot]=args.slot==='worn'?[]:null}else{
    const item=pc.inventory.find(i=>i.key===(args.key||args.item?.key));if(!item)throw Error('背包没有此装备。');
    const def=srd.weapons[item.key]||srd.armor[item.key]||{};
    const entry={...def,...Object.fromEntries(Object.entries(item).filter(([,v])=>v!=null)),magicBonus:item.magicBonus||0};
    if(!entry.damage&&def.damage)entry.damage=def.damage;
    if(args.slot==='armor'&&entry.base==null)throw Error('护甲缺少基础AC。');
    if(args.slot==='shield'&&entry.acBonus==null){if(entry.key==='shield')entry.acBonus=2;else throw Error('盾牌缺少AC加值。')}
    if(['mainHand','offHand'].includes(args.slot)&&!entry.damage)throw Error('武器缺少伤害公式。');
    if(args.slot==='worn')pc.equipment.worn=[...(pc.equipment.worn||[]).filter(i=>i.key!==entry.key),entry];else pc.equipment[args.slot]=entry;
   }
   changed=true;
  }
  if(!changed)throw Error('没有提供角色修改。');
  pc.meta={...pc.meta,updatedAt:new Date().toISOString()};
  const summary=pc.name+'：'+args.reason+'（已写入角色卡）';
  event(b,w,summary,{kind:'state',actor:pc.name});
  b.characterReceipts=b.characterReceipts||{};b.characterReceipts[key]={digest,result:{ok:true,summary,actorId:pc.id}};
  await commit(b,w);
  const sheet=check(await ops['party.sheet']({id:pc.id})).sheet;
  return {ok:true,summary,hp:sheet.hp,ac:sheet.ac,acBreakdown:sheet.acBreakdown,overrideActive:!!sheet.acOverride,inventory:sheet.inventory,equipment:sheet.equipment};
 });
}
