import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startServer} from '../server.mjs';
import {initializeData} from '../desktop/storage.mjs';
async function fixture(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'solo-lan-')),root=await initializeData(home,'0.13.0');
 const pc={schema:'dnd5e.character.v1',id:'phone-hero',name:'手机测试角色',level:1,race:'human',classes:[{class:'fighter',level:1}],abilities:{str:15,dex:12,con:14,int:10,wis:10,cha:10},hp:{current:12,max:12,temp:0},inventory:[],equipment:{},conditions:[]};
 await fs.writeFile(path.join(root,'characters',pc.id+'.json'),JSON.stringify(pc));
 const app=await startServer({dataRoot:root,port:0,lanBind:'127.0.0.1'});
 const api=async(op,args={})=>{const r=await(await fetch(app.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json();if(!r.ok)throw Error(r.error);if(r.value?.ok===false)throw Error(r.value.error);return r.value};
 await api('controls.set',{aidm:false});await api('map.create',{name:'公开庭院',w:10,h:10,terrain:Array(10).fill('.'.repeat(10)),tokens:[{id:pc.id,name:pc.name,kind:'pc',x:2,y:2,hp:12,max:12,ac:11,speed:30},{id:'secret',name:'秘密伏兵',kind:'enemy',hidden:true,x:8,y:8,hp:7,max:7,ac:15}]});
 const room=await api('lan.start');const invited=await api('lan.invite',{actorId:pc.id});const seat=invited.seats[0],url='http://127.0.0.1:'+room.port;
 const remote=async(p,body,token=seat.fragment)=>{const response=await fetch(url+p,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}};
 let seq=0;const intent=async(type,args={})=>remote('/intent',{requestId:'request-'+(++seq),revision:(await remote('/state')).revision,type,...args});
 return {api,remote,intent,seat,url,pc,close:async()=>{await api('lan.stop');await app.close();await fs.rm(home,{recursive:true,force:true})}};
}
test('LAN has an isolated authenticated player surface and explicit map publishing',async()=>{const f=await fixture();try{
 assert.equal((await f.remote('/state',null,'wrong')).status,401);
 for(const p of ['/api','/health','/files/data/ai.json','/app/ui-client.js','/api/modules'])assert.equal((await f.remote(p)).status,404);
 assert.equal((await f.remote('/state')).map,null);await f.api('lan.publish');const s=await f.remote('/state');assert.equal(s.map.tokens.length,1);assert.ok(!JSON.stringify(s).includes('秘密伏兵'));assert.ok(!JSON.stringify(s).includes('apiKey'));
 assert.equal((await f.remote('/intent',{requestId:'request-abc',revision:s.revision,type:'combat.damage',amount:-1000})).ok,false);
 await assert.rejects(()=>f.api('profiles.select',{id:'legacy'}),/关闭局域网/);await assert.rejects(()=>f.api('controls.set',{aidm:true}),/关闭联机/);
 await f.api('lan.revoke',{id:f.seat.id});assert.equal((await f.remote('/state')).status,401);
 }finally{await f.close()}});
test('phone movement, DM approval, stale turn rejection and idempotent dice share desktop state',async()=>{const f=await fixture();try{
 await f.api('lan.publish');let r=await f.intent('move',{x:3,y:2,actorId:'secret'});assert.equal(r.request.status,'done',r.request.summary);assert.equal((await f.api('map.get')).tokens.find(t=>t.id===f.pc.id).x,3);assert.equal((await f.api('map.get')).tokens.find(t=>t.id==='secret').x,8);
 await f.api('combat.start',{entries:[{id:'p',pcId:f.pc.id,tokenId:f.pc.id,kind:'pc',name:f.pc.name,init:20},{id:'e',tokenId:'secret',kind:'enemy',name:'秘密伏兵',init:10}]});
 r=await f.intent('move',{x:4,y:2});assert.equal(r.request.status,'pending');assert.equal((await f.api('map.get')).tokens.find(t=>t.id===f.pc.id).x,3);await f.api('lan.decide',{id:r.request.id,approve:true});assert.equal((await f.api('map.get')).tokens.find(t=>t.id===f.pc.id).x,4);await f.api('lan.decide',{id:r.request.id,approve:true});assert.equal((await f.api('combat.get')).order[0].econ.move,5);
 await f.api('dice.request',{expr:'1d20+2',label:'手机检定',actorId:f.pc.id});const s=await f.remote('/state'),body={requestId:'same-dice-1234',type:'roll',diceId:s.dice.id,revision:s.revision};const [a,b]=await Promise.all([f.remote('/intent',body),f.remote('/intent',body)]);assert.equal(a.request.summary,b.request.summary);assert.ok(a.duplicate||b.duplicate);assert.equal((await f.api('dice.pending')).pending.length,0);
 r=await f.intent('endTurn');assert.equal(r.request.status,'pending');await f.api('lan.decide',{id:r.request.id,approve:true});assert.equal((await f.remote('/state')).combat.myTurn,false);assert.equal((await f.intent('move',{x:5,y:2})).ok,false);
 // DM can request a roll even outside the player's turn (e.g. initiative/reaction).
 await f.api('dice.request',{expr:'1d20',label:'回合外检定',actorId:f.pc.id});r=await f.intent('roll',{diceId:(await f.remote('/state')).dice.id});assert.equal(r.request.status,'done',r.request.summary);
 }finally{await f.close()}});
test('action intent and public DM reply are distinct from private desktop history',async()=>{const f=await fixture();try{
 await f.api('narration.say',{speaker:'秘密',text:'未公开的模组结局'});assert.ok(!JSON.stringify(await f.remote('/state')).includes('模组结局'));
 const r=await f.intent('action',{text:'我向守卫问路'});assert.equal(r.request.status,'pending');await f.api('lan.decide',{id:r.request.id,approve:true});assert.ok((await f.api('ai.history')).messages.some(m=>m.content.includes('问路')));
 await f.api('lan.say',{text:'守卫指向广场'});assert.ok((await f.remote('/state')).messages.some(m=>m.text==='守卫指向广场'));
 await f.api('lan.publish');await f.api('combat.start',{entries:[{id:'p',pcId:f.pc.id,tokenId:f.pc.id,kind:'pc',name:f.pc.name,init:20},{id:'e',tokenId:'secret',kind:'enemy',name:'秘密伏兵',init:10}]});const pending=await f.intent('move',{x:3,y:2});await f.api('combat.next');await f.api('lan.decide',{id:pending.request.id,approve:true});assert.equal((await f.remote('/state')).requests.find(r=>r.id===pending.request.id).status,'failed');
 }finally{await f.close()}});
