import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../server.mjs';
test('custom appearance colors survive persistence and invalid colors fall back safely', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-theme-'));
  let runtime;
  try {
    runtime = await startServer({ dataRoot: root, port: 0, bind: '127.0.0.1' });
    const call = async (op, args={}) => (await (await fetch(runtime.url+'/api', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,args})})).json()).value;
    const theme = {name:'violet',mode:'dark',accent:'#8170f5',background:'#1c2136',surface:'#292d46',text:'#f0e6ff',muted:'#afb7d4',onAccent:'#ffffff',motion:'reduced'};
    assert.equal((await call('theme.set',{theme})).saved,true);
    const stored=JSON.parse(await fs.readFile(path.join(root,'data/theme.json'),'utf8'));
    for (const [key,value] of Object.entries(theme)) assert.equal(stored[key],value,key);
    const read=await call('theme.get'); assert.equal(read.theme.text,theme.text); assert.equal(read.theme.motion,'reduced');
    const invalid=await call('theme.set',{theme:{background:'url(x)',text:'red',onAccent:'#gggggg',motion:'unknown'}});
    assert.equal(invalid.theme.background,null); assert.equal(invalid.theme.text,null); assert.equal(invalid.theme.onAccent,null); assert.equal(invalid.theme.motion,'full');
  } finally { await runtime?.close(); await fs.rm(root,{recursive:true,force:true}); }
});
