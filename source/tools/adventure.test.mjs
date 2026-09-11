import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {startServer} from '../server.mjs';
import {initializeData,initializeLibrary} from '../desktop/storage.mjs';
import {composeMap} from '../src/cartography.mjs';
const src=await fs.readFile(new URL('../engine/ui-client.latest.txt',import.meta.url),'utf8');
for(const [component,label,operation,values,sheet] of [
 ['Bag','取出','sheet.pack.take',['','gear','','','','',false,'','pack'],{id:'pc-test',inventory:[{key:'pack',name:'套装',container:true,contents:[{key:'torch',name:'火把',qty:1}]}]}],
 ['EquipPanel','卸下','sheet.equip',[false,''],{id:'pc-test',equipment:{armor:{key:'leather',name:'皮甲'},worn:[]}}],
 ['StatusPanel','清空全部','sheet.condition.set',[true,'','','',false,''],{id:'pc-test',conditions:[],conditionCatalog:[]}]
])test(component+' button dispatches once and releases busy state',async()=>{
 let idx=0;const calls=[];const React={Component:class {},useState(v){const i=idx++;if(values[i]===undefined)values[i]=v;return[values[i],v=>values[i]=v]},useEffect(){}};
 const h=(type,props,...children)=>({type,props,children});const begin=src.indexOf('function '+component+'('),end=src.indexOf('\nfunction ',begin+10);
 const call=async(op,args)=>{calls.push({op,args});return{ok:true,saved:true,summary:'done'}};
 const factory=new Function('React','h','call','KINDN','Card','ABF',src.slice(begin,end)+';return '+component);
 const tree=factory(React,h,call,{gear:'杂物'},()=>{},{} )({s:sheet});const buttons=[];
 const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){if(n.type==='button')buttons.push(n);walk(n.children)}};walk(tree);
 const b=buttons.find(b=>b.children.includes(label));assert.ok(b);await b.props.onClick();assert.equal(calls.length,1);assert.equal(calls[0].op,operation);assert.equal(JSON.parse(calls[0].args.json).id,'pc-test');assert.equal(values[component==='Bag'?6:component==='StatusPanel'?4:0],false);
});
test('generated rooms are connected and preview has no characters',()=>{
 for(const biome of ['cave','forest','ruins']){const m=composeMap({biome});assert.equal(m.tokens.length,0);const seen=new Set(),todo=[[m.entry.x,m.entry.y]];while(todo.length){const[x,y]=todo.pop(),key=x+','+y;if(seen.has(key)||x<0||y<0||x>=m.w||y>=m.h||['#','b','c',' '].includes(m.terrain[y][x]))continue;seen.add(key);todo.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}for(const r of m.rooms)assert.ok(seen.has(r.cx+','+r.cy));}
});
test('module migration preserves bytes and refuses conflicting destination',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'solo-migration-'));try{const root=await initializeData(tmp,'0.5.0'),old=path.join(root,'data/modules');await fs.mkdir(old);const name='a'.repeat(64)+'.json';await fs.writeFile(path.join(old,name),'original');const lib=path.join(tmp,'library');await initializeLibrary(lib,root);assert.equal(await fs.readFile(path.join(lib,'data/modules',name),'utf8'),'original');await assert.rejects(fs.access(path.join(old,name)));await fs.writeFile(path.join(old,name),'conflict');await assert.rejects(initializeLibrary(lib,root));assert.equal(await fs.readFile(path.join(old,name),'utf8'),'conflict')}finally{await fs.rm(tmp,{recursive:true,force:true})}
});
test('selected adventure drives AI map tools; combat hydrates enemy and never invents PCs',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'solo-campaign-'));let app;const requests=[];
 const provider=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const b=JSON.parse(body);requests.push(b);const done=b.messages.some(m=>m.role==='tool');res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:done?{role:'assistant',content:'首场景已准备。'}:{role:'assistant',content:null,tool_calls:[{id:'map1',type:'function',function:{name:'map_compose',arguments:JSON.stringify({name:'银石入口',biome:'cave',rooms:[{x:2,y:2,w:8,h:8},{x:14,y:8,w:8,h:8}]})}}]}}]}))});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));try{
 const root=await initializeData(tmp,'0.5.0');app=await startServer({dataRoot:root,port:0});
 const api=async(op,args={})=>{const r=await(await fetch(app.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json();assert.equal(r.ok,true,r.error);return r.value};
 await api('settings.set',{baseUrl:'http://127.0.0.1:'+provider.address().port,model:'test-model'});
 const uploaded=await(await fetch(app.url+'/api/modules?filename=test.json',{method:'POST',body:JSON.stringify([{title:'银石开场',text:'银石入口，山洞第一遭遇。'},{title:'测试守卫',text:'测试守卫\n中型类人生物\n护甲等级 15|生命值 12|速度 30 尺|力量 12 敏捷 14 体质 12 智力 10 感知 10 魅力 8|豁免：敏捷 +4|动作 攻击。'}])})).json();assert.equal(uploaded.ok,true);
 const state=await api('campaign.get');assert.equal(state.modules.length,1);assert.equal((await api('campaign.select',{moduleId:state.modules[0].id})).ok,true);
 const prepared=await api('campaign.prepare');assert.equal(prepared.ok,true,prepared.error);assert.ok(requests[0].messages[0].content.includes('银石入口'));assert.ok(!requests[0].tools.some(t=>t.function.name==='combat_start'));
 const map=await api('map.get');assert.equal(map.tokens.length,0);assert.equal((await api('campaign.get')).phase,'prepared');
 const sb=await api('mod.statblock',{query:'测试守卫'});assert.equal(sb.ok,true);assert.equal(sb.ac,15);
 await api('map.token.add',{token:{id:'enemy1',name:'测试守卫',kind:'enemy',x:4,y:4,statblockId:sb.id}});
 const battle=await api('combat.start',{auto:true});assert.equal(battle.ok,true,battle.error);assert.equal(battle.order.length,1);assert.equal(battle.order[0].init,battle.order[0].roll+battle.order[0].dex);
 const enemy=(await api('map.get')).tokens[0];assert.equal(enemy.ac,15);assert.equal(enemy.hp,12);assert.ok(enemy.source.includes('测试守卫'));
 }finally{await app?.close();await new Promise(r=>provider.close(r));await fs.rm(tmp,{recursive:true,force:true})}
});
