const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=async(window,runtime,home,file)=>{
 const wc=window.webContents;wc.setBackgroundThrottling(false);
 const run=code=>wc.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async code=>{for(let i=0;i<150;i++){if(await run(code))return;await delay(100)}throw Error('PDF UI timeout: '+code)};
 const click=async text=>{await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing '+${JSON.stringify(text)});b.click()})()`);await delay(100)};
 const api=async(op,args={})=>(await(await fetch(runtime.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json()).value;
 await click('PDF 原图地图');await until(`!!document.querySelector('.pdf-map-dialog')`);
 const encoded=(await fs.readFile(file)).toString('base64');
 await run(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0))],'Moonstone.pdf',{type:'application/pdf'}));const el=document.querySelector('[aria-label="上传地图 PDF"]');el.files=transfer.files;el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 await until(`document.querySelector('.pdf-map-dialog [role=status]').textContent.includes('PDF 已就绪')`);
 await click('预览原页');await until(`document.querySelector('.pdf-page-frame img')?.naturalWidth>0`);
 // Real pointer events exercise selection and pointer capture, not a mocked handler.
 const box=await run(`(()=>{const r=document.querySelector('.pdf-page-frame').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);
 const x=box.x+box.w*.1,y=box.y+box.h*.1;
 wc.sendInputEvent({type:'mouseDown',x:Math.round(x),y:Math.round(y),button:'left',clickCount:1});
 wc.sendInputEvent({type:'mouseMove',x:Math.round(box.x+box.w*.9),y:Math.round(box.y+box.h*.9),movementX:Math.round(box.w*.8),movementY:Math.round(box.h*.8)});
 wc.sendInputEvent({type:'mouseUp',x:Math.round(box.x+box.w*.9),y:Math.round(box.y+box.h*.9),button:'left',clickCount:1});
 await until(`parseFloat(document.querySelector('.pdf-crop').style.width)<90`);
 await run(`document.getAnimations().forEach(a=>{try{a.finish()}catch{}})`);await delay(250);
 await wc.capturePage();await delay(300);
 await fs.writeFile(path.join(home,'pdf-crop.png'),(await wc.capturePage()).toPNG());
 await click('建立原图地图');await until(`!document.querySelector('.pdf-map-dialog') && document.querySelector('.map-original')?.naturalWidth>0`);
 const map=await api('map.get');assert.equal(map.tokens.length,0);assert.ok(map.background.crop.w<.9);assert.equal(map.background.terrainReady,false);
 await click('标注地形');
 await run(`document.querySelectorAll('.pdf-cell')[26].click()`);
 // API assertion verifies the UI click, falling back to no hidden mutation.
 await until(`document.querySelectorAll('.pdf-cell.annotated').length>0`);
 await click('确认地形标注完成');assert.equal((await api('map.get')).background.terrainReady,true);
 await until(`document.querySelector('.pdf-background img')?.getBoundingClientRect().height>10`);
 await wc.capturePage();await delay(350);await fs.writeFile(path.join(home,'pdf-map.png'),(await wc.capturePage()).toPNG());
 await wc.reload();await until(`document.querySelector('.map-original')?.naturalWidth>0`);assert.equal((await api('map.get')).background.id,map.background.id);
 await fs.writeFile(path.join(home,'pdf-map-smoke.json'),JSON.stringify({crop:map.background.crop,grid:[map.w,map.h],original:true,terrainEdit:true,persistence:true},null,2));
};
