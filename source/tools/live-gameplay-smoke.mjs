import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {startServer} from '../server.mjs';import {initializeData} from '../desktop/storage.mjs';
if(!process.argv.includes('--live'))throw Error('此测试会使用本机配置调用 AI；显式传入 --live 才运行。');
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url))),home=path.join(source,'build','live-gameplay-'+Date.now()),root=await initializeData(home,'0.7.0');
const existing=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'SoloTRPG/campaign/data/ai.json'),'utf8')).config;
const pc=JSON.parse(await fs.readFile(path.join(source,'characters/pc-turiel-mistveil.json'),'utf8'));Object.assign(pc,{id:'live-test-hero',name:'隔离测试术士',race:'elf/drow',spellcasting:{ability:'cha',cantrips:['mageHand'],spells:['fogCloud','falseLife']}});await fs.writeFile(path.join(root,'characters',pc.id+'.json'),JSON.stringify(pc));
const app=await startServer({dataRoot:root,sessionRoot:path.join(home,'saves'),libraryRoot:source,port:0});
const api=async(op,args={})=>(await(await fetch(app.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json()).value;
try{
 await api('settings.set',{baseUrl:existing.baseUrl,model:existing.model,apiKey:existing.apiKey,maxSteps:4});
 await api('map.create',{name:'隔离测试地图',w:12,h:12,terrain:Array(12).fill('.'.repeat(12)),tokens:[{id:pc.id,name:pc.name,kind:'pc',x:2,y:2,ac:13,hp:10,max:10,speed:30},{id:'g1',name:'地精',kind:'enemy',x:5,y:2,ac:15,hp:7,max:7},{id:'g2',name:'地精',kind:'enemy',x:8,y:2,ac:15,hp:7,max:7}]});
 const first=await api('ai.chat',{message:'这是隔离工具测试。请使用两次 dice.request 为 live-test-hero 发起两条有用途的玩家检定，分别 1d20+2 察觉和 1d20+3 隐匿，然后等待玩家。不要直接替玩家投骰。'});
 const pending=await api('dice.pending');if(!first.ok||pending.count!==2)throw Error('两条玩家骰子未建立：'+(first.error||pending.count));for(const r of pending.pending)await api('dice.answer',{id:r.id});
 const resumed=await api('session.resume');if(!resumed.ok)throw Error('续接失败：'+resumed.error);
 // Drain any new user request before the independent targeting probe.
 for(const r of (await api('dice.pending')).pending)await api('dice.cancel',{id:r.id});
 const targeted=await api('ai.chat',{message:'继续隔离测试：角色卡明确有 fogCloud 云雾术。不要施放、不要扣法术位、不要开战，只用 interaction.request(kind=area,actorId=live-test-hero,spell=fogCloud,shape=sphere,size=20,range=120,label=云雾术范围) 请求我在地图选择原点，然后停止等待。'});
 const state=await api('session.pending');if(!targeted.ok||state.request?.kind!=='area')throw Error('范围选择请求未建立：'+(targeted.error||targeted.reply));
 const result={ok:true,model:existing.model,diceCount:pending.count,firstTools:first.steps?.map(s=>s.name),resumeTools:resumed.steps?.map(s=>s.name),rangeTools:targeted.steps?.map(s=>s.name),requestKind:state.request.kind};await fs.writeFile(path.join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await app.close();await fs.writeFile(path.join(root,'data/ai.json'),JSON.stringify({config:{},messages:[]}));}
