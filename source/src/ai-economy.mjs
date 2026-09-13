const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>v?.[k]!=null).map(k=>[k,v[k]]));
export function compactScene(s={}){
 return {clock:s.clock,combat:s.combat?{...pick(s.combat,['active','round','turnIndex','current']),order:s.combat.order?.map(e=>pick(e,['id','pcId','tokenId','name','kind','init','hp','max','ac','conditions','econ']))}:undefined,map:s.map?{...pick(s.map,['id','name','w','h','cell']),terrainHint:'需要具体格子时调用map.get/los；不要臆测障碍',tokens:s.map.tokens?.slice(0,60).map(t=>pick(t,['id','name','kind','x','y','hp','max','temp','ac','hidden','ownerId','spell','attackBonus','damage','reach']))}:undefined,
 characters:s.characters?.map(c=>({...pick(c,['id','name','hp','ac','slots','conditions']),spells:c.spells?.map(x=>pick(x,['key','name','level','source'])),equipment:c.equipment?Object.fromEntries(Object.entries(c.equipment).map(([k,v])=>[k,typeof v==='object'&&v?pick(v,['key','name','base','acBonus','magicBonus','damage','props']):v])):undefined,inventory:c.inventory?.map(x=>pick(x,['key','name','qty']))})),requests:s.requests,dice:s.dice?.slice(-3),pendingDice:s.pendingDice,completed:s.completed?.slice(-3).map(x=>({...pick(x,['id','kind','label','status']),result:pick(x.result,['actorId','ability','targetIds','origin','feet','total','success','expr'])})),effects:s.effects?.map(x=>pick(x,['id','name','spell','actorId','targetId','rounds','expiresAt','concentration'])),battle:s.battle};
}
export const historyBudget=messages=>{let size=0;return messages.slice(-10).reverse().map(m=>({role:m.role,content:String(m.speaker?m.speaker+'：'+m.content:m.content||'').slice(-1800)})).filter(m=>{size+=m.content.length;return size<=7000}).reverse()};
export function taskTools(tools,task){
 const rules=/^(rules_|mod_|party_(sheet|spells|list)$|scene_get$|map_(get|los|area)$|combat_get$)/;
 const map=/^(rules_|mod_|map_(get|tiles|compose)$|party_list$)/;
 const recap=/^(scene_get$|combat_get$|log_(list|stats)$|map_get$)/;
 return tools.filter(t=>!task||({rules,map,recap}[task]||/$a/).test(t.function.name));
}
export const payloadSize=body=>JSON.stringify(body).length;
