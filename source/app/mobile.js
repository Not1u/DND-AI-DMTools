/* Phone only uses the restricted player gateway. */
const $=id=>document.getElementById(id);
const incoming=location.hash.slice(1);if(incoming){sessionStorage.setItem('solo-invite',incoming);history.replaceState(null,'',location.pathname)}
const token=sessionStorage.getItem('solo-invite')||'';
let state=null,selected=null,target=null,busy=false,online=false,spellKey='',lastMessages='',lastRequests='',spellSignature='',pendingSubmission=null;
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
async function api(p,body){const r=await fetch(p,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'连接失败');return result}
const text=(id,value)=>{$(id).textContent=value};
function items(id,rows,render){$(id).replaceChildren(...rows.map(r=>{const el=document.createElement('article');el.textContent=render(r);return el}))}
function buttons(){const available=online&&!busy&&state;$('move').disabled=!available||!selected||state?.combat.active&&!state.combat.myTurn;$('endTurn').disabled=!available||!state?.combat.active||!state.combat.myTurn;$('roll').disabled=!available||!state?.dice;$('action').disabled=!available}
function paint(){
 const m=state.map,c=$('map'),ctx=c.getContext('2d');text('mapTitle',m?.name||'等待 DM 公开地图');c.hidden=!m;if(!m)return;
 const cell=Math.max(16,Math.min(32,Math.floor(1600/Math.max(m.w,m.h))));c.width=m.w*cell;c.height=m.h*cell;c.dataset.cell=cell;
 for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){const t=m.terrain[y]?.[x];ctx.fillStyle=t==='#'?'#353633':['~','w'].includes(t)?'#7aadb9':'#e4d8bd';ctx.fillRect(x*cell,y*cell,cell,cell);ctx.strokeStyle='#766b4e30';ctx.strokeRect(x*cell,y*cell,cell,cell)}
 for(const t of m.tokens){ctx.fillStyle=t.kind==='pc'?'#326492':'#994b45';ctx.beginPath();ctx.arc((t.x+.5)*cell,(t.y+.5)*cell,cell*.39,0,Math.PI*2);ctx.fill();ctx.fillStyle='white';ctx.font=Math.max(10,cell*.4)+'px sans-serif';ctx.textAlign='center';ctx.fillText(t.name.slice(0,2),(t.x+.5)*cell,(t.y+.65)*cell)}
 if(selected){ctx.strokeStyle='#26a789';ctx.lineWidth=3;ctx.strokeRect(selected.x*cell+2,selected.y*cell+2,cell-4,cell-4)}
}
function render(next){
 if(state?.map?.id!==next.map?.id){selected=null;target=null;text('selection','尚未选择位置')}
 state=next;const p=state.character;text('name',p.name);$('stats').replaceChildren(...['HP '+(p.hp.cur??p.hp.current??0)+' / '+p.hp.max,'临时 HP '+(p.hp.temp||0),'AC '+p.ac].map(v=>{const e=document.createElement('strong');e.textContent=v;return e}));
 text('turn',state.combat.active?'第 '+state.combat.round+' 轮 · '+(state.combat.myTurn?'你的回合':'等待其他单位 / DM'):'自由探索 · 移动直接同步，行动交给 DM');
 const slots=p.slots||{};text('slots','法术位：'+(Array.isArray(slots)?slots.map(s=>(s.lv||s.level)+'环 '+(s.remaining??'待确认')+'/'+s.max).join(' · '):Object.entries(slots).map(([k,v])=>k+'环 '+(typeof v==='object'?(v.remaining??v.current??v.max)+'/'+v.max:v)).join(' · ')));
 const sig=JSON.stringify(p.spells);if(sig!==spellSignature){spellSignature=sig;$('spell').replaceChildren(...[{key:'',name:'自定义行动'},...p.spells].map(s=>{const o=document.createElement('option');o.value=s.key;o.textContent=s.name;return o}));$('spell').value=spellKey}
 $('diceBox').hidden=!state.dice;text('diceLabel',state.dice?(state.dice.label+' · '+state.dice.expr):'');
 const msgs=JSON.stringify(state.messages);if(msgs!==lastMessages){items('messages',state.messages,m=>m.speaker+'：'+m.text);lastMessages=msgs}
 const reqs=JSON.stringify(state.requests);if(reqs!==lastRequests){items('requests',[...state.requests].reverse(),r=>({pending:'等待 DM',done:'已处理',failed:'未执行',rejected:'已驳回',processing:'处理中'}[r.status])+' · '+(r.summary||r.text||({move:'移动至 '+r.x+','+r.y,endTurn:'结束回合',roll:'投骰'}[r.type])));lastRequests=reqs}
 paint();buttons();
}
async function refresh(){try{const next=await api('/state');online=true;render(next);if(!busy)text('connection','已连接 · 电脑 DM 为权威状态')}catch(e){online=false;text('connection',e.message+'；保持此页面可自动重连');buttons()}}
async function send(type,extra={}){if(busy||!online)return;busy=true;buttons();
 // Reuse an uncertain request ID so network retries never roll twice.
 const signature=JSON.stringify({type,...extra});if(!pendingSubmission||pendingSubmission.signature!==signature)pendingSubmission={signature,body:{requestId:uid(),revision:state.revision,type,...extra}};
 try{const r=await api('/intent',pendingSubmission.body);pendingSubmission=null;text('connection',r.request.summary||'请求已提交，等待 DM');await refresh()}catch(e){text('connection',e.message+'；可重试同一操作');if(!/fetch|network|timeout|abort|连接/i.test(e.message))pendingSubmission=null}finally{busy=false;buttons()}}
$('map').addEventListener('click',e=>{if(!state?.map)return;const c=$('map'),r=c.getBoundingClientRect(),cell=Number(c.dataset.cell),x=Math.floor((e.clientX-r.left)*c.width/r.width/cell),y=Math.floor((e.clientY-r.top)*c.height/r.height/cell);selected={x,y};target=state.map.tokens.find(t=>t.x===x&&t.y===y)||null;text('selection','已选 '+x+', '+y+(target?' · '+target.name:''));paint();buttons()});
$('spell').onchange=e=>{spellKey=e.target.value};
$('move').onclick=()=>send('move',selected);$('endTurn').onclick=()=>send('endTurn');$('roll').onclick=()=>send('roll',{diceId:state.dice.id});
$('action').onclick=()=>{const spell=state.character.spells.find(s=>s.key===spellKey),description=[spell?'使用 '+spell.name:'',target?'目标 '+target.name+'（'+target.x+','+target.y+'）':'',$('intent').value.trim()].filter(Boolean).join('；');if(!description)return text('connection','请选择法术或输入你想做的事情');send('action',{text:description})};
async function poll(){await refresh();setTimeout(poll,2000)}poll();
