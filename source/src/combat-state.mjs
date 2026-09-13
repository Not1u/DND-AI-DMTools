export const surpriseCondition=c=>/^(surprised|surprise|突袭|受惊|措手不及)$/i.test(typeof c==='string'?c:(c?.key||c?.name||''));
export const isSurprised=u=>(u.conditions||[]).some(surpriseCondition);
export const monsterName=name=>String(name||'').trim().replace(/\s*[#＃]?\d+$/,'').replace(/([\u3400-\u9fff])[A-ZＡ-Ｚ]$/,'$1').trim();
export function meleeProfile(sb){
 for(const text of sb.actions||[]){const m=String(text).match(/(?:近战武器攻击|近战攻击|Melee Weapon Attack)[\s\S]{0,100}?(?:命中|hit)\s*[:：]?\s*\+?(\d+)[\s\S]{0,140}?(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);if(m)return {attackBonus:Number(m[1]),damage:m[2].replace(/\s/g,''),reach:Number(String(text).match(/(?:触及|reach)\s*(\d+)/i)?.[1])||5}}
 return {};
}
