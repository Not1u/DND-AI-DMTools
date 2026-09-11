import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {startServer} from '../server.mjs';
import {initializeData} from '../desktop/storage.mjs';

async function fixture(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'solo-gameplay-')),root=await initializeData(home,'0.7.0');
 const pc=JSON.parse(await fs.readFile(new URL('../characters/pc-turiel-mistveil.json',import.meta.url),'utf8'));Object.assign(pc,{id:'test-hero',name:'测试术士',race:'elf/drow',level:3,choices:{},spellcasting:{ability:'cha',cantrips:['mageHand'],spells:['fogCloud','falseLife']},hp:{current:100,max:100,temp:0},savingThrowProfs:[]});pc.abilities.con=8;await fs.writeFile(path.join(root,'characters/test-hero.json'),JSON.stringify(pc));
 let app=await startServer({dataRoot:root,port:0});
 const api=async(op,args={})=>{const r=await(await fetch(app.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json();assert.equal(r.ok,true,r.error);return r.value};
 const ok=async(op,args={})=>{const r=await api(op,args);assert.equal(r.ok,true,op+': '+r.error);return r};
 const map=async()=>ok('map.create',{name:'交互测试',w:12,h:12,terrain:Array(12).fill('.'.repeat(12)),tokens:[{id:'test-hero',name:'测试术士',kind:'pc',x:2,y:2,hp:100,max:100,ac:13,speed:30},{id:'g1',name:'地精',kind:'enemy',x:5,y:2,hp:12,max:12,ac:15},{id:'g2',name:'地精',kind:'enemy',x:7,y:2,hp:12,max:12,ac:15}]});
 const combat=async()=>ok('combat.start',{entries:[{id:'p',pcId:'test-hero',tokenId:'test-hero',name:'测试术士',kind:'pc',init:20,hp:100,max:100},{id:'g',tokenId:'g1',name:'地精',kind:'enemy',init:5,hp:12,max:12}]});
 return {root,home,api,ok,map,combat,restart:async()=>{await app.close();app=await startServer({dataRoot:root,port:0})},close:async()=>{await app.close();await fs.rm(home,{recursive:true,force:true})}};
}

test('server dice queue is FIFO, exactly-once under repeated clicks, cancellable individually and persistent',async()=>{
 const f=await fixture();try{
 const req=await Promise.all([f.ok('dice.request',{expr:'1d20+2',label:'攻击',actorId:'test-hero'}),f.ok('dice.request',{expr:'1d6',label:'伤害',actorId:'test-hero'})]);assert.notEqual(req[0].id,req[1].id);
 assert.equal((await f.api('dice.answer',{id:req[1].id})).ok,false);
 const [a,b]=await Promise.all([f.ok('dice.answer',{id:req[0].id,total:9999}),f.ok('dice.answer',{id:req[0].id,total:9999})]);assert.equal(a.total,b.total);assert.ok(a.total<=22);assert.equal(a.dice.length,1);
 assert.equal((await f.ok('dice.pending')).pending.length,1);
 await f.restart();assert.equal((await f.ok('dice.pending')).pending[0].id,req[1].id);
 await f.ok('dice.cancel',{id:req[1].id});assert.equal((await f.ok('dice.pending')).pending.length,0);assert.equal((await f.ok('dice.results')).items.length,2);
 }finally{await f.close()}
});

test('combat requires current-turn requests; selections retain unique targets and movement budget',async()=>{
 const f=await fixture();try{await f.map();await f.ok('map.token.move',{id:'test-hero',x:3,y:2});await f.combat();
 assert.equal((await f.api('map.token.move',{id:'test-hero',x:4,y:2})).ok,false);
 const q=await f.ok('interaction.request',{kind:'move',actorId:'test-hero',label:'移动角色'});
 assert.equal((await f.api('combat.next')).ok,false);
 assert.equal((await f.api('interaction.answer',{id:q.request.id,x:11,y:11})).ok,false);
 await f.ok('interaction.answer',{id:q.request.id,x:4,y:2});assert.equal((await f.ok('map.get')).tokens.find(t=>t.id==='test-hero').x,4);assert.equal((await f.ok('combat.get')).order[0].econ.move,5);
 const target=await f.ok('interaction.request',{kind:'target',actorId:'test-hero',label:'选择地精',range:60,targetKind:'enemy'});const answer=await f.ok('interaction.answer',{id:target.request.id,targetIds:['g2']});assert.equal(answer.result.targets[0].id,'g2');
 const area=await f.ok('interaction.request',{kind:'area',actorId:'test-hero',label:'云雾术原点',shape:'sphere',size:20,range:120});const preview=await f.ok('interaction.preview',{id:area.request.id,x:6,y:5});assert.ok(preview.cells.length>5);await f.ok('interaction.answer',{id:area.request.id,x:6,y:5});
 const effect=await f.ok('effect.add',{name:'云雾术',actorId:'test-hero',requestId:area.request.id,concentration:true,rounds:1});assert.ok(effect.effect.area.cells.length);
 await f.ok('combat.next');assert.equal((await f.api('interaction.request',{kind:'move',actorId:'test-hero',label:'非法移动'})).ok,false);await f.ok('combat.next');assert.equal((await f.ok('session.pending')).effects.length,0);
 const spells=await f.ok('party.spells',{id:'test-hero'});assert.ok(spells.spells.some(s=>s.key==='fogCloud'));assert.ok(spells.spells.some(s=>s.key==='dancingLights'&&s.source==='种族施法'));
 }finally{await f.close()}
});

test('temporary HP absorbs damage; concentration is triggered by damage, not every turn; completed battle archives before clearing',async()=>{
 const f=await fixture();try{await f.map();await f.combat();
 await f.ok('effect.add',{name:'虚假生命',actorId:'test-hero',temp:5,durationSeconds:3600});
 await f.ok('effect.add',{name:'云雾术',actorId:'test-hero',concentration:true,durationSeconds:3600});
 const hit=await f.ok('combat.damage',{id:'p',amount:-3});assert.equal(hit.hp,100);assert.equal(hit.temp,2);let req=(await f.ok('dice.pending')).pending[0];assert.equal(req.dc,10);await f.ok('dice.answer',{id:req.id});
 await f.ok('effect.add',{name:'云雾术',actorId:'test-hero',concentration:true,durationSeconds:3600});await f.ok('combat.next');assert.equal((await f.ok('dice.pending')).count,0);await f.ok('combat.next');
 await f.ok('combat.damage',{id:'p',amount:-50});req=(await f.ok('dice.pending')).pending[0];assert.equal(req.dc,25);const rolled=await f.ok('dice.answer',{id:req.id});assert.equal(rolled.success,false);assert.equal((await f.ok('session.pending')).effects.length,0);
 const sheet=(await f.ok('party.sheet',{id:'test-hero'})).sheet;assert.equal(sheet.hp.cur,52);assert.equal(sheet.hp.temp,0);assert.equal((await f.ok('map.get')).tokens.find(t=>t.id==='test-hero').hp,52);
 const ended=await f.ok('combat.end');assert.ok(ended.archiveId);assert.equal((await f.ok('log.list')).total,0);assert.equal((await f.ok('archive.list')).items.length,1);assert.ok((await f.ok('archive.read',{id:ended.archiveId})).archive.log.entries.length>0);
 await f.ok('effect.add',{name:'虚假生命',actorId:'test-hero',temp:7,durationSeconds:60});await f.ok('session.advance',{seconds:60});assert.equal((await f.ok('party.sheet',{id:'test-hero'})).sheet.hp.temp,0);
 }finally{await f.close()}
});

test('AI stops at queued player requests and resumes from authoritative scene; preparation never leaks into public chat',async()=>{
 const f=await fixture(),requests=[];let mode='dice';const provider=http.createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;const body=JSON.parse(text);requests.push(body);const call=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});let message;
 if(mode==='dice')message={role:'assistant',content:'请依次投骰。',tool_calls:[call('r1','dice_request',{expr:'1d20',label:'察觉',actorId:'test-hero'}),call('r2','dice_request',{expr:'1d20',label:'隐匿',actorId:'test-hero'})]};
 else if(mode==='prepare')message=body.messages.some(m=>m.role==='tool')?{role:'assistant',content:'幕后剧透：密室埋伏。'}:{role:'assistant',tool_calls:[call('m','map_compose',{name:'入口',biome:'cave'})]};
 else message={role:'assistant',content:'冒险继续。'};
 res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message}]}))});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 try{await f.map();await f.ok('settings.set',{baseUrl:'http://127.0.0.1:'+provider.address().port,model:'test'});await f.ok('ai.chat',{message:'试一试'});assert.equal(requests.length,1);assert.equal((await f.ok('dice.pending')).count,2);
 for(const req of (await f.ok('dice.pending')).pending)await f.ok('dice.answer',{id:req.id});mode='resume';await f.ok('session.resume');assert.equal(requests.length,2);assert.ok(requests[1].messages[0].content.includes('fogCloud'));assert.equal((await f.ok('session.pending')).ready,false);
 await f.ok('narration.say',{speaker:'守卫',text:'欢迎来到镇上。'});assert.ok((await f.ok('ai.history')).messages.some(m=>m.speaker==='守卫'));
 const appUrl='http://127.0.0.1'; // Imported module via filesystem is intentionally isolated to the fixture.
 const {createModuleStore}=await import('../src/modules.mjs');const record=await createModuleStore(f.root).import('test.txt',Buffer.from('开场在洞穴入口。'));await f.restart();await f.ok('campaign.select',{moduleId:record.id});mode='prepare';await f.ok('campaign.prepare');assert.ok(!(await f.ok('ai.history')).messages.some(m=>m.content.includes('幕后剧透')));mode='start';await f.ok('campaign.start');assert.equal((await f.ok('campaign.get')).phase,'playing');
 const local=JSON.parse(await fs.readFile(path.join(f.root,'data/ai.json')));assert.deepEqual(local.messages,[]);assert.ok((JSON.parse(await fs.readFile(path.join(f.root,'saves/chat.json')))).messages.length>0);
 }finally{await f.close();await new Promise(r=>provider.close(r))}
});


test('free/turn modes gate movement requests and town maps retain player identity',async()=>{
 const f=await fixture();try{await f.map();assert.equal((await f.api('dm.action',{action:'move',actorId:'test-hero',label:'非法请求'})).ok,false);await f.combat();await f.ok('combat.mode',{mode:'free'});await f.ok('map.token.move',{id:'test-hero',x:3,y:2});await f.ok('combat.mode',{mode:'turn'});assert.equal((await f.ok('combat.get')).order[0].init,20);assert.equal((await f.api('dm.action',{action:'town'})).ok,false);await f.ok('combat.mode',{mode:'free'});await f.ok('combat.end');await f.ok('dm.action',{action:'town',name:'示意城镇',places:[{name:'客栈'},{name:'市集'}],npcs:[{name:'商人',place:'市集'}]});const state=await f.ok('scene.get');assert.equal(state.mode,'free');assert.equal(state.town.locations.length,2);assert.equal(state.map.tokens.filter(t=>t.kind==='pc').length,1);assert.ok((await f.ok('scene.visit',{id:'place-1'})).message.includes('市集'));await f.ok('map.create',{name:'别处'});assert.equal((await f.ok('scene.get')).town,null);
 }finally{await f.close()}
});

test('module rewards work without combat, require evidence and survive duplicate retries; XP UI uses module thresholds',async()=>{
 const f=await fixture();try{const {createModuleStore}=await import('../src/modules.mjs');const quote='无论战斗还是谈判解决守卫问题，每人获得 200 经验。升级累计经验：1级0，2级200，3级800，4级2000。';const record=await createModuleStore(f.root).import('reward.txt',Buffer.from(quote));await f.restart();await f.ok('campaign.select',{moduleId:record.id});const sourceId='upload:'+record.id+':0';await f.ok('campaign.progression.set',{sourceId,quote,thresholds:[0,200,800,2000]});assert.equal((await f.ok('party.sheet',{id:'test-hero'})).sheet.xpNext,2000);assert.equal((await f.ok('levelset.info',{id:'test-hero'})).ok,true);assert.equal((await f.ok('party.xp')).ok,true);const before=(await f.ok('party.sheet',{id:'test-hero'})).sheet.xp;const args={objectiveId:'chapter1-guards',title:'说服守卫',method:'negotiation',amount:200,per:'each',sourceId,quote};assert.equal((await f.api('campaign.resolve',{...args,amount:999})).ok,false);await f.ok('campaign.resolve',args);await f.ok('campaign.resolve',{...args,method:'combat'});await f.restart();assert.equal((await f.ok('campaign.resolve',args)).duplicate,true);assert.equal((await f.ok('party.sheet',{id:'test-hero'})).sheet.xp,before+200);assert.equal((await f.ok('campaign.progression.get')).rewards.length,1);
 }finally{await f.close()}
});

test('AI structured action compatibility and missed-roll repair create real FIFO requests, not advisory stat dice',async()=>{
 const f=await fixture();let mode='compat',calls=0,forced=false;const provider=http.createServer(async(req,res)=>{let text='';for await(const p of req)text+=p;const body=JSON.parse(text);calls++;if(mode==='unsupported'&&body.tools){res.statusCode=400;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:{message:'tools parameter unsupported'}}));return}forced=body.tool_choice?.function?.name==='dm_action';let message={role:'assistant',content:'如果确定动手，地精伤害1d6+2。你怎么选？'};if(mode==='compat'||mode==='unsupported')message.content='请投骰。\n```dm-action\n'+JSON.stringify([{action:'roll',actorId:'test-hero',expr:'1d20+2',label:'察觉'},{action:'roll',actorId:'test-hero',expr:'1d20',label:'隐匿'}])+'\n```';if(mode==='repair')message=forced?{role:'assistant',tool_calls:[{id:'repair',type:'function',function:{name:'dm_action',arguments:JSON.stringify({action:'roll',expr:'1d20+2',label:'察觉',actorId:'test-hero'})}}]}:{role:'assistant',content:'请进行一次察觉检定。'};res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message}]}))});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 try{await f.ok('settings.set',{baseUrl:'http://127.0.0.1:'+provider.address().port,model:'test'});await f.ok('ai.chat',{message:'检定'});assert.equal((await f.ok('dice.pending')).count,2);assert.ok(!(await f.ok('ai.history')).messages.at(-1).content.includes('dm-action'));for(const r of (await f.ok('dice.pending')).pending)await f.ok('dice.cancel',{id:r.id});mode='repair';calls=0;await f.ok('ai.chat',{message:'检定'});assert.equal(calls,2);assert.equal(forced,true);assert.equal((await f.ok('dice.pending')).count,1);await f.ok('dice.cancel',{id:(await f.ok('dice.pending')).pending[0].id});mode='advice';calls=0;await f.ok('ai.chat',{message:'给建议'});assert.equal(calls,1);assert.equal((await f.ok('dice.pending')).count,0);mode='unsupported';calls=0;await f.ok('ai.chat',{message:'创建请求'});assert.equal(calls,2);assert.equal((await f.ok('dice.pending')).count,2);
 }finally{await f.close();await new Promise(r=>provider.close(r))}
});
