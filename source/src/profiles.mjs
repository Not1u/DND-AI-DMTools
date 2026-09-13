import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readJson,saveJson} from './gameplay.mjs';
export async function createProfiles(dataRoot,sessionRoot){
 const indexFile=path.join(dataRoot,'profiles-index.json');
 let index=await readJson(indexFile,{active:'legacy',items:[{id:'legacy',name:'原有战役',createdAt:new Date().toISOString()}]});
 const roots=id=>{if(id!=='legacy'&&!/^[a-f0-9-]{36}$/.test(id))throw Error('存档 ID 无效');return id==='legacy'?{dataRoot,sessionRoot}:{dataRoot:path.join(dataRoot,'profiles',id),sessionRoot:path.join(sessionRoot,'slots',id)}};
 const save=()=>saveJson(indexFile,index);
 await save();
 return {current:()=>({...roots(index.active),id:index.active}),list:()=>({ok:true,active:index.active,items:index.items}),
 async select(id){if(!index.items.some(x=>x.id===id))throw Error('存档不存在');index.active=id;await save();return this.current()},
 async create({name,moduleId,aidm}){if(!String(name||'').trim()||!moduleId)throw Error('请输入战役名称并选择模组');const id=randomUUID(),r=roots(id);await fs.mkdir(path.join(r.dataRoot,'characters'),{recursive:true});await fs.mkdir(path.join(r.dataRoot,'data'),{recursive:true});const settings=await readJson(path.join(dataRoot,'data/ai.json'),null);if(settings)await saveJson(path.join(r.dataRoot,'data/ai.json'),{config:settings.config,messages:[]});await saveJson(path.join(r.sessionRoot,'adventure.json'),{moduleId,name:String(name).trim(),phase:'selected'});await saveJson(path.join(r.sessionRoot,'controls.json'),{aidm:aidm===true,economy:'economy'});index.items.push({id,name:String(name).trim().slice(0,80),moduleId,createdAt:new Date().toISOString()});index.active=id;await save();return this.current()}
 };
}
