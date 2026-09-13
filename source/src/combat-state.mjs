export const surpriseCondition=c=>/^(surprised|surprise|突袭|受惊|措手不及)$/i.test(typeof c==='string'?c:(c?.key||c?.name||''));
export const isSurprised=u=>(u.conditions||[]).some(surpriseCondition);
export const monsterName=name=>String(name||'').trim().replace(/\s*[#＃]?\d+$/,'').replace(/([\u3400-\u9fff])[A-ZＡ-Ｚ]$/,'$1').trim();
export const completeAttack=p=>p?.attackBonus!=null&&p.attackBonus!==''&&Number.isFinite(Number(p.attackBonus))&&/^\d{1,2}d\d{1,3}(?:[+-]\d{1,3})?$/.test(p.damage||'')&&Number(p.reach)>0;
export function meleeProfile(sb){
 // PDF extraction may split one attack across several action fragments. Stop at
 // another attack or stat block so missing data never borrows a neighbour's dice.
 const text=(sb.actions||[]).join(' ').normalize('NFKC');
 const first=text.split(/(?:AC|护甲等级)\s*[:：]/i)[0];
 const segments=first.split(/(?=(?:近战武器攻击|近战攻击|远程武器攻击|远程攻击|Melee Weapon Attack|Ranged Weapon Attack))/i);
 for(const segment of segments){
  if(!/^(?:近战武器攻击|近战攻击|Melee Weapon Attack)/i.test(segment))continue;
  const head=segment.slice(0,300),bonus=head.match(/(?:命中|to hit)\s*[:：]?\s*([+-]\s*\d+)/i)||head.match(/([+-]\s*\d+)\s*(?:命中|to hit)/i);
  const damage=head.match(/(\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?)/i),reach=head.match(/(?:触及|reach)\s*[:：]?\s*(\d+)/i);
  if(bonus&&damage&&reach){const p={attackBonus:Number(bonus[1].replace(/\s/g,'')),damage:damage[1].replace(/\s/g,'').toLowerCase(),reach:Number(reach[1])};if(completeAttack(p))return p;}
 }
 return {};
}
