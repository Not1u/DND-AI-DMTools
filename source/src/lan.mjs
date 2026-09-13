import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';

// A separate, opt-in listener: never exposes the desktop API or file server.
export function createLan({call,appRoot,notify=()=>{},bind='0.0.0.0'}) {
  let server=null,port=0,published=null,queue=Promise.resolve();
  const seats=new Map(),requests=new Map(),messages=[];
  const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
  const check=r=>{if(r?.ok===false)throw Error(r.error||'操作失败');return r};
  const invoke=async(op,args={})=>check(await call(op,args));
  const say=(speaker,text)=>{messages.push({id:randomUUID(),speaker,text:String(text).slice(0,2000),time:Date.now()});if(messages.length>100)messages.shift();notify()};
  const ips=()=>['127.0.0.1',...Object.values(os.networkInterfaces()).flat().filter(n=>n?.family==='IPv4'&&!n.internal).map(n=>n.address)];
  const status=()=>({ok:true,active:!!server,port,addresses:ips().map(ip=>'http://'+ip+':'+port),published:published?.name||null,seats:[...seats.values()].map(s=>({id:s.id,actorId:s.actorId,name:s.name,expires:s.expires,lastSeen:s.lastSeen,fragment:s.token})),requests:[...requests.values()].slice(-100),messages});
  const ownIds=(scene,seat)=>{const e=scene.combat?.order?.find(e=>e.pcId===seat.actorId||e.tokenId===seat.actorId||e.id===seat.actorId);return new Set([seat.actorId,e?.id,e?.tokenId].filter(Boolean))};
  const current=scene=>scene.combat?.order?.[scene.combat.turnIndex];
  const isTurn=(scene,seat)=>{const e=current(scene),ids=ownIds(scene,seat);return !!e&&[e.id,e.pcId,e.tokenId].some(id=>ids.has(id))};
  function view(scene,seat) {
    const pc=scene.characters.find(c=>c.id===seat.actorId);if(!pc)throw Error('分配的角色已不存在，请联系 DM');
    const map=published&&scene.map.id===published.id?{...published,tokens:scene.map.tokens.filter(t=>published.ids.includes(t.id)&&!t.hidden).map(t=>({id:t.id,name:t.name,kind:t.kind,x:t.x,y:t.y}))}:null;
    if(map)delete map.ids;
    const head=scene.pendingDice?.[0],ids=ownIds(scene,seat),mine=head&&ids.has(head.actorId)&&!head.secret&&!head.hidden;
    const character={id:pc.id,name:pc.name,hp:{cur:pc.hp.cur,max:pc.hp.max,temp:pc.hp.temp||0},ac:pc.ac,slots:pc.slots,spells:pc.spells.map(s=>({key:s.key,name:s.name,level:s.level}))};
    const state={character,map,combat:{active:!!scene.combat.active,round:scene.combat.round,myTurn:isTurn(scene,seat),current:scene.combat.active?(isTurn(scene,seat)?pc.name:'其他单位 / DM'):null},dice:mine?{id:head.id,expr:head.expr,label:head.label}:null};
    return {ok:true,...state,revision:createHash('sha256').update(JSON.stringify(state)).digest('hex'),requests:[...requests.values()].filter(r=>r.seatId===seat.id).slice(-30).map(({version,seatId,...r})=>r),messages};
  }
  const playerScene=async seat=>{const battle=await invoke('battle.get',{playerId:seat.actorId});const scene=await invoke('scene.get');const pc=scene.characters.find(c=>c.id===seat.actorId);if(pc)pc.slots=(battle.player?.slots||[]).map(({lv,max,remaining})=>({lv,max,remaining}));scene.battleVersion=battle.version;return scene};
  const validateTurn=(scene,seat)=>{if(scene.combat.active&&!isTurn(scene,seat))throw Error('还没轮到你的角色');};
  async function execute(r,seat) {
    const scene=await invoke('scene.get');
    if((await invoke('controls.get')).aidm)throw Error('联机测试需要关闭 AI 自动主持');
    if(!['action','roll'].includes(r.type))validateTurn(scene,seat);
    let result;
    if(r.type==='move') {
      if(!published||scene.map.id!==published.id)throw Error('地图已切换，请等待 DM 公开新地图');
      const ids=ownIds(scene,seat),token=scene.map.tokens.find(t=>ids.has(t.id));if(!token)throw Error('角色尚未放置在地图');
      result=await invoke('dm.move',{id:token.id,x:r.x,y:r.y});
      r.summary='移动已生效：'+r.x+', '+r.y;say(seat.name,r.summary);
    } else if(r.type==='endTurn') {
      if(!scene.combat.active)throw Error('当前不是回合制');
      result=await invoke('battle.endTurn',{turnKey:scene.combat.round+':'+current(scene)?.id});r.summary='回合已结束';say(seat.name,r.summary);
    } else if(r.type==='roll') {
      const d=scene.pendingDice?.[0];if(!d||d.id!==r.diceId||!ownIds(scene,seat).has(d.actorId)||d.secret||d.hidden)throw Error('投骰请求已变化或不属于你');
      result=await invoke('dice.answer',{id:d.id});r.summary=(d.label||'投骰')+'：'+result.detail;say(seat.name,r.summary);
    } else {
      result=await invoke('dm.player',{message:seat.name+'：'+r.text});r.summary='DM 已接收行动意图；命中、伤害和资源由 DM 继续裁定';say(seat.name,r.text);
    }
    r.status='done';return result;
  }
  async function submit(seat,a) {
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(a.requestId||''))throw Error('无效请求编号');
    const key=seat.id+':'+a.requestId;if(requests.has(key))return {ok:true,request:requests.get(key),duplicate:true};
    if(!['move','action','roll','endTurn'].includes(a.type))throw Error('不支持的玩家操作');
    if([...requests.values()].filter(r=>r.seatId===seat.id&&r.status==='pending').length>=5)throw Error('请等待 DM 处理已有请求');
    if(requests.size>=500)throw Error('本测试房间已达请求上限，请由 DM 重开房间');
    const scene=await playerScene(seat),projection=view(scene,seat);
    if(a.revision!==projection.revision)throw Error('场景已更新，请刷新后重新提交');
    if(a.type!=='action'&&a.type!=='roll')validateTurn(scene,seat);
    const r={id:randomUUID(),seatId:seat.id,name:seat.name,type:a.type,status:'pending',time:Date.now(),version:scene.battleVersion};
    if(a.type==='move'){if(!projection.map||![a.x,a.y].every(Number.isInteger)||a.x<0||a.y<0||a.x>=projection.map.w||a.y>=projection.map.h)throw Error('请选择公开地图内的格子');r.x=a.x;r.y=a.y}
    if(a.type==='action'){r.text=String(a.text||'').trim().slice(0,2000);if(!r.text)throw Error('请描述行动')}
    if(a.type==='roll'){if(!projection.dice||a.diceId!==projection.dice.id)throw Error('没有属于你的队首投骰');r.diceId=a.diceId}
    requests.set(key,r);
    // DM-created dice requests are already authorized; free exploration moves immediately.
    if(a.type==='roll'||a.type==='move'&&!scene.combat.active){try{await execute(r,seat)}catch(e){r.status='failed';r.summary=e.message}}
    notify();return {ok:true,request:r};
  }
  const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value))};
  async function route(req,res) {
    try {
      const allowed=new Set(ips().map(ip=>ip+':'+port));if(!allowed.has(req.headers.host))return json(res,403,{ok:false,error:'无效主机地址'});
      if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)return json(res,403,{ok:false,error:'禁止跨站请求'});
      const p=new URL(req.url,'http://'+req.headers.host).pathname;
      const files={'/':'mobile.html','/mobile.js':'mobile.js','/mobile.css':'mobile.css'};
      if(req.method==='GET'&&files[p]){res.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",'referrer-policy':'no-referrer','x-content-type-options':'nosniff'});return res.end(await fs.readFile(path.join(appRoot,files[p])))}
      if(!['/state','/intent'].includes(p))return json(res,404,{ok:false,error:'不存在此玩家接口'});
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const seat=[...seats.values()].find(s=>s.token===token&&s.expires>Date.now());if(!seat)return json(res,401,{ok:false,error:'邀请已失效，请向 DM 获取新链接'});
      const now=Date.now();if(now-seat.window>10000){seat.window=now;seat.hits=0}if(++seat.hits>35)return json(res,429,{ok:false,error:'请求过快，请稍候'});seat.lastSeen=now;
      if(req.method==='GET'&&p==='/state')return json(res,200,await serial(async()=>{if(!seats.has(seat.id))throw Error('邀请已撤销');const scene=await playerScene(seat);return view(scene,seat)}));
      if(req.method!=='POST'||p!=='/intent')return json(res,405,{ok:false,error:'方法不支持'});
      let raw='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return json(res,413,{ok:false,error:'请求过大'});raw+=chunk}
      const a=JSON.parse(raw);return json(res,200,await serial(async()=>{if(!seats.has(seat.id)||seat.expires<Date.now())throw Error('邀请已撤销');return submit(seat,a)}));
    }catch(e){json(res,400,{ok:false,error:e.message})}
  }
  async function stop(){const old=server;server=null;port=0;seats.clear();requests.clear();messages.length=0;published=null;if(old){old.closeAllConnections();await new Promise(r=>old.close(r))}notify();return status()}
  return {active:()=>!!server,close:()=>serial(stop),control:(op,a={})=>serial(async()=>{
    if(op==='lan.status')return status();
    if(op==='lan.stop')return stop();
    if(op==='lan.start') {
      if(server)return status();if((await invoke('controls.get')).aidm)throw Error('请先关闭 AI DM 自动主持');
      const next=http.createServer(route);next.requestTimeout=10000;next.headersTimeout=10000;
      await new Promise((resolve,reject)=>{next.once('error',reject);next.listen(0,bind,resolve)});server=next;port=server.address().port;notify();return status();
    }
    if(!server)throw Error('请先开启局域网房间');
    if(op==='lan.invite') {
      const pc=(await invoke('scene.get')).characters.find(p=>p.id===a.actorId);if(!pc)throw Error('请选择已有角色');
      if(seats.size>=5)throw Error('首版最多五位玩家');
      if([...seats.values()].some(s=>s.actorId===pc.id))throw Error('角色已分配，请先撤销旧邀请');
      const id=randomUUID();seats.set(id,{id,actorId:pc.id,name:pc.name,token:randomBytes(24).toString('hex'),expires:Date.now()+86400000,lastSeen:0,window:0,hits:0});
    } else if(op==='lan.revoke') {seats.delete(a.id);for(const r of requests.values())if(r.seatId===a.id&&r.status==='pending'){r.status='rejected';r.summary='邀请已撤销'}}
    else if(op==='lan.publish') {
      const {map}=await invoke('scene.get');if(!map?.w||!map?.h)throw Error('请先建立地图');
      published={id:map.id,name:map.name,w:map.w,h:map.h,terrain:map.terrain.map(row=>typeof row==='string'?row:row.join('')),ids:map.tokens.filter(t=>!t.hidden).map(t=>t.id)};say('DM','已公开示意图：'+map.name);
    } else if(op==='lan.unpublish')published=null;
    else if(op==='lan.say'){if(!String(a.text||'').trim())throw Error('请输入发言');await invoke('narration.say',{speaker:'DM',text:String(a.text).slice(0,2000)});say('DM',a.text)}
    else if(op==='lan.decide') {
      const r=[...requests.values()].find(r=>r.id===a.id);if(!r)throw Error('请求不存在');if(r.status!=='pending')return {ok:true,duplicate:true};
      if(a.approve!==true){r.status='rejected';r.summary=String(a.reason||'DM 未批准').slice(0,500)}
      else {r.status='processing';try{const seat=seats.get(r.seatId);if(!seat)throw Error('邀请已撤销');if(r.type!=='action'&&(await invoke('battle.get',{playerId:seat.actorId})).version!==r.version)throw Error('场景已变化，请玩家重新提交');await execute(r,seat)}catch(e){r.status='failed';r.summary=e.message}}
    } else throw Error('未知房间操作');
    notify();return status();
  })};
}
