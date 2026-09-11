import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {pdfFixture} from './pdf-fixture.mjs';
import {createModuleStore} from '../src/modules.mjs';
import {createPdfMapStore} from '../src/pdf-maps.mjs';
import {startServer} from '../server.mjs';
import {initializeData} from '../desktop/storage.mjs';

test('PDF originals survive reimport; image-only PDFs are supported and crops preserve pixels',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'solo-pdf-'));
 try{
  let modules=createModuleStore(tmp);const bytes=pdfFixture(),record=await modules.import('map.pdf',bytes);
  assert.deepEqual((await modules.pdf(record.id)).data,bytes);assert.equal(record.pageCount,1);
  const file=path.join(tmp,'data/modules',record.id+'.json'),old=JSON.parse(await fs.readFile(file));delete old.hasPdf;await fs.writeFile(file,JSON.stringify(old));await fs.unlink(path.join(tmp,'data/modules',record.id+'.pdf'));
  modules=createModuleStore(tmp);assert.equal((await modules.import('map.pdf',bytes)).restoredOriginal,true);assert.equal((await modules.list()).length,1);
  const blank=await modules.import('scan.pdf',pdfFixture(''));assert.equal(blank.imageOnly,true);assert.equal(blank.hasPdf,true);
  const maps=createPdfMapStore(tmp,modules),full=await maps.render({moduleId:record.id,page:1});
  const part=await maps.render({moduleId:record.id,page:1,crop:{x:.1,y:.1,w:.6,h:.6}});
  assert.equal(part.width,Math.round(full.width*.6));assert.equal(part.height,Math.round(full.height*.6));
  const {createCanvas,loadImage}=await import('@napi-rs/canvas');const pixels=async(id)=>{const image=await loadImage(await maps.imageBytes(id)),c=createCanvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);return c.getContext('2d')};
  const fullCtx=await pixels(full.id),partCtx=await pixels(part.id);
  assert.deepEqual(partCtx.getImageData(0,0,part.width,part.height).data,fullCtx.getImageData(Math.floor(full.width*.1),Math.floor(full.height*.1),part.width,part.height).data);
  assert.equal((await maps.render({moduleId:record.id,page:1})).id,full.id);
  await assert.rejects(maps.render({moduleId:record.id,page:0}),/页码/);
  await assert.rejects(maps.render({moduleId:record.id,page:2}),/页|page/i);
  await assert.rejects(maps.render({moduleId:record.id,page:1,crop:{x:.8,w:.5}}),/裁剪/);
  await assert.rejects(maps.render({moduleId:'../x',page:1}),/标识/);
  assert.ok((await maps.render({moduleId:blank.id,page:1})).width>0);
 }finally{await fs.rm(tmp,{recursive:true,force:true})}
});

test('PDF maps persist, serve original pixels, require terrain confirmation, and export embedded images',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'solo-pdf-api-'));let app;const requests=[];
 const provider=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;requests.push(JSON.parse(body));res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'已研究页面文字，保留用户地图。'}}]}))});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 try{
  const root=await initializeData(tmp,'0.6.0'),library=path.join(tmp,'library');
  app=await startServer({dataRoot:root,libraryRoot:library,port:0});
  const api=async(op,args={})=>{const response=await(await fetch(app.url+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json();assert.equal(response.ok,true,response.error);return response.value};
  const upload=await(await fetch(app.url+'/api/modules?filename=Map.pdf',{method:'POST',body:pdfFixture()})).json();assert.equal(upload.ok,true,upload.error);
  const map=await api('map.fromPdf',{moduleId:upload.id,page:1,w:24,h:4});assert.equal(map.ok,true,map.error);assert.equal(map.tokens.length,0);assert.ok(map.background);
  await api('settings.set',{baseUrl:'http://127.0.0.1:'+provider.address().port,model:'test'});
  await api('campaign.select',{moduleId:upload.id});
  const prepared=await api('campaign.prepare',{keepMap:true});assert.equal(prepared.ok,true,prepared.error);assert.equal((await api('map.get')).background.id,map.background.id);assert.equal((await api('map.get')).tokens.length,0);assert.ok(!requests[0].tools.some(t=>t.function.name==='map_compose'));assert.match(requests[0].messages[0].content,/PDF 页码 1/);
  const image=await fetch(app.url+map.background.url);assert.equal(image.status,200);assert.ok(Buffer.from(await image.arrayBuffer()).subarray(1,4).equals(Buffer.from('PNG')));
  assert.equal((await api('map.los',{from:{x:0,y:1},to:{x:4,y:1}})).ok,false);
  assert.equal((await api('map.terrain.set',{cells:[{x:2,y:1,t:'#'}]})).ok,true);
  assert.equal((await api('map.background.confirm',{confirmed:true})).ok,true);
  assert.equal((await api('map.get')).background.terrainReady,true);
  assert.equal((await api('map.los',{from:{x:0,y:1},to:{x:4,y:1}})).ok,true);
  const exported=await api('ext.image.map');assert.equal(exported.ok,true,exported.error);assert.match(exported.svg,/data:image\/png;base64,/);
  await app.close();app=await startServer({dataRoot:root,libraryRoot:library,port:0});
  assert.equal((await api('map.get')).background.id,map.background.id);
  assert.deepEqual(await fs.readFile(path.join(library,'data/modules',upload.id+'.pdf')),pdfFixture());
  await assert.rejects(fs.access(path.join(root,'data/modules',upload.id+'.pdf')));
 }finally{await app?.close();await new Promise(r=>provider.close(r));await fs.rm(tmp,{recursive:true,force:true})}
});
