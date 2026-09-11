const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
module.exports=async(window,runtime,home,fixture)=>{
 const wc=window.webContents;wc.setBackgroundThrottling(false);
 const run=code=>wc.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async code=>{for(let i=0;i<180;i++){if(await run(code))return;await delay(100)}throw Error('Gameplay UI timeout: '+code)};
 const click=async text=>{await run(`(()=>{const el=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button '+${JSON.stringify(text)});el.click()})()`);await delay(120)};
 const api=async(op,args={})=>{const r=(await(await fetch(runtime.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json()).value;assert.equal(r.ok,true,op+': '+r.error);return r};
 const capture=async name=>{await wc.capturePage();await delay(300);await fs.writeFile(path.join(home,name+'.png'),(await wc.capturePage()).toPNG())};
 const provider=http.createServer(async(req,res)=>{for await(const p of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'DM 已根据最新场景读取玩家选择与骰子结果。'}}]}))});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 try{
  const pc=JSON.parse(await fs.readFile(fixture,'utf8'));Object.assign(pc,{id:'ui-hero',name:'测试术士',race:'elf/drow',level:3,spellcasting:{ability:'cha',cantrips:['mageHand'],spells:['fogCloud','falseLife']},hp:{current:30,max:30,temp:0}});await fs.writeFile(path.join(home,'campaign/characters/ui-hero.json'),JSON.stringify(pc));
  await api('settings.set',{baseUrl:'http://127.0.0.1:'+provider.address().port,model:'test-ui'});
  await fs.writeFile(path.join(home,'saves/chat.json'),JSON.stringify({messages:Array.from({length:60},(_,i)=>({role:i%2?'assistant':'user',content:'历史消息 '+i+'：沿着旧路调查营地，查看周围环境。'.repeat(5),t:new Date().toISOString()}))}));
  await api('map.create',{name:'战斗交互验收',w:12,h:12,terrain:Array(12).fill('.'.repeat(12)),tokens:[{id:'ui-hero',name:'测试术士',kind:'pc',x:2,y:2,hp:30,max:30,ac:13,speed:30},{id:'g1',name:'地精',kind:'enemy',x:5,y:2,hp:12,max:12,ac:15},{id:'g2',name:'地精',kind:'enemy',x:8,y:4,hp:12,max:12,ac:15}]});
  await api('combat.start',{entries:[{id:'player',pcId:'ui-hero',tokenId:'ui-hero',name:'测试术士',kind:'pc',init:20,hp:30,max:30},{id:'enemy',tokenId:'g1',name:'地精',kind:'enemy',init:5,hp:12,max:12}]});
  await wc.reload();await until(`document.querySelectorAll('.dndp-tok').length===3 && document.querySelectorAll('.dndp-msg').length>=60`);
  await run(`(()=>{const e=document.querySelector('.dndp-aibody');e.scrollTop=(e.scrollHeight-e.clientHeight)/2;e.dispatchEvent(new Event('scroll'));})()`);
  const scroll=await run(`document.querySelector('.dndp-aibody').scrollTop`);await delay(2300);assert.ok(Math.abs(await run(`document.querySelector('.dndp-aibody').scrollTop`)-scroll)<2);
  const target=await api('interaction.request',{kind:'target',actorId:'ui-hero',label:'选择被攻击的地精',range:60});await until(`!!document.querySelector('.map-request')`);
  await run(`document.querySelector('[aria-label*=" · g2 · "]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}))`);await click('确认提交');
  let pending=await api('session.pending');assert.equal(pending.completed.at(-1).result.targets[0].id,'g2');
  const area=await api('interaction.request',{kind:'area',actorId:'ui-hero',label:'云雾术范围',shape:'sphere',size:20,range:120});await until(`document.querySelector('.map-request')?.textContent.includes('云雾术范围')`);await run(`document.querySelectorAll('.dndp-cell')[66].click()`);await until(`!document.querySelector('.map-request button').disabled`);await capture('gameplay-area-preview');await click('确认提交');
  await api('effect.add',{name:'云雾术',actorId:'ui-hero',spell:'fogCloud',requestId:area.request.id});await until(`document.querySelectorAll('.effect-cell').length>0`);
  const move=await api('interaction.request',{kind:'move',actorId:'ui-hero',label:'移动当前角色'});await until(`document.querySelector('.map-request')?.textContent.includes('移动当前角色')`);await run(`document.querySelectorAll('.dndp-cell')[27].click()`);await until(`!document.querySelector('.map-request button').disabled`);await click('确认提交');assert.equal((await api('map.get')).tokens.find(t=>t.id==='ui-hero').x,3);
  await api('effect.add',{name:'虚假生命',actorId:'ui-hero',temp:8,durationSeconds:3600});
  await api('narration.say',{speaker:'守卫',text:'小心，那边有三只地精！'});await click('刷新');
  const first=await api('dice.request',{expr:'1d20+3',label:'第一条攻击',actorId:'ui-hero'}),second=await api('dice.request',{expr:'1d6',label:'第二条伤害',actorId:'ui-hero'});
  await until(`document.querySelector('.dndp-req')?.textContent.includes('第一条攻击')`);await run(`document.querySelector('.dndp-req .dndp-dicego').click()`);await until(`document.querySelector('.dndp-req')?.textContent.includes('第二条伤害')`);await until(`!document.querySelector('.dndp-req .dndp-dicego').disabled`);await run(`document.querySelector('.dndp-req .dndp-dicego').click()`);await until(`!document.querySelector('.dndp-req')`);
  const dice=await api('dice.results');assert.equal(dice.items.length,2);assert.ok(dice.items.every(r=>typeof r.total==='number'));
  await run(`document.querySelector('[aria-label*=" · g2 · "]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:640,clientY:300}))`);await until(`document.querySelector('#solo-detail-tip')?.textContent.includes('护甲等级 AC：15')`);await capture('gameplay-ac-tooltip');
  await api('combat.end');await until(`!!document.querySelector('.battle-archives')`);await run(`document.querySelector('.battle-archives').open=true`);await until(`!!document.querySelector('.archive-cards button')`);await capture('gameplay-archive');
  await click('回到最新消息');await until(`document.querySelector('.dndp-aibody').scrollHeight-document.querySelector('.dndp-aibody').scrollTop-document.querySelector('.dndp-aibody').clientHeight<5`);
  await fs.writeFile(path.join(home,'gameplay-smoke.json'),JSON.stringify({scrollStable:true,targetId:'g2',areaPreview:true,movement:true,fifo:true,ac:true,archive:true},null,2));
 }finally{await new Promise(r=>provider.close(r))}
};
