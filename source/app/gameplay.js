(function(){
 const h=React.createElement;
 window.SoloArchive=function({call}){
  const [items,setItems]=React.useState([]),[selected,setSelected]=React.useState(null),[error,setError]=React.useState('');
  const load=()=>call('archive.list',{}).then(r=>{if(r.ok)setItems(r.items)}).catch(e=>setError(e.message));
  return h('details',{className:'battle-archives',onToggle:e=>{if(e.currentTarget.open)load()}},h('summary',null,'战役回放 · 已归档战斗'),error&&h('p',null,error),h('div',{className:'archive-cards'},items.length?items.map(b=>h('button',{key:b.id,onClick:async()=>{const r=await call('archive.read',{id:b.id});if(r.ok)setSelected(r.archive);else setError(r.error)}},h('b',null,b.title),h('small',null,new Date(b.t).toLocaleString()+' · '+b.rounds+' 轮 · '+b.count+' 条记录'))):h('small',null,'战斗结束后自动存为回放卡片。')),
   selected&&h('div',{className:'archive-replay'},h('b',null,selected.title),h('button',{onClick:()=>setSelected(null)},'收起回放'),selected.log.entries.map(e=>h('p',{key:e.id},h('small',null,'R'+e.round+' · '+e.actor+' '),e.text,' ',e.detail))));
 };
 window.SoloHealthBlock=function({s,compact=false}){
  const hp=s.hp||{},cur=hp.cur??hp.current??0,max=hp.max||1,temp=hp.temp||0;
  return h('div',{className:'solo-health-block'+(compact?' compact':''),'aria-label':'生命值'},h('div',{className:'health-main'},h('span',{className:'health-symbol'},'♥'),h('strong',null,cur),h('span',null,'/ '+max),h('small',null,'HP'),temp>0?h('span',{className:'health-temp','aria-label':'临时生命'},'◆ +'+temp,h('small',null,'临时生命')):null),h('div',{className:'health-meter'},h('i',{style:{width:Math.max(0,Math.min(100,100*cur/max))+'%'}})),(hp.effects||[]).map(e=>h('span',{className:'health-buff',key:e.id},e.name+(e.maxHpBonus!=null?' · 上限 +'+e.maxHpBonus:'')+(e.rounds!=null?' · '+e.rounds+'轮':e.remainingSeconds!=null?' · '+Math.ceil(e.remainingSeconds/60)+'分钟':''))));
 };
 window.SoloTempHP=function({call,s}){
  const [live,setLive]=React.useState(null);
  React.useEffect(()=>{const load=()=>call('session.pending',{}).then(r=>{if(r.ok)setLive(r)}).catch(()=>{});load();const timer=setInterval(load,1500);return()=>clearInterval(timer)},[s.id]);
  const effects=(live?.effects||[]).filter(e=>e.temp!=null&&e.targetId===s.id);
  if(!s.hp?.temp)return null;
  return h('aside',{className:'temp-hp-card','aria-label':'临时生命值'},h('span',null,'临时生命'),h('strong',null,s.hp.temp),h('small',null,'先于本体生命扣除 · 不叠加'),effects.map(e=>h('small',{key:e.id},e.name+(e.rounds!=null?' · 剩 '+e.rounds+' 回合':'')+(e.expiresAt!=null?' · 游戏内剩 '+Math.max(0,Math.ceil((e.expiresAt-live.clock)/60))+' 分钟':''))));
 };
 window.SoloRacialChoice=function({call,s,onReload}){const [error,setError]=React.useState('');if(!s.racialSpellChoice)return null;return h('label',{className:'racial-cantrip'},'高等精灵种族戏法',h('select',{value:s.racialSpellChoice.key,onChange:async e=>{const r=await call('sheet.racialCantrip',{id:s.id,key:e.target.value});if(r.ok)onReload?.();else setError(r.error)}},h('option',{value:''},'选择一个法师戏法'),s.racialSpellChoice.options.map(sp=>h('option',{key:sp.key,value:sp.key},sp.name))),error&&h('small',null,error))};
})();
