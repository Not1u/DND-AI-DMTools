import fs from 'node:fs/promises';
import path from 'node:path';
// Stable location independent of the executable version or portable extraction folder.
// Only initialize missing directories; never replace a player's existing files.
export async function initializeData(home, version) {
  const root = path.join(home, 'campaign');
  await fs.mkdir(path.join(root, 'characters'), { recursive: true });
  await fs.mkdir(path.join(root, 'data', 'maps'), { recursive: true });
  await fs.mkdir(path.join(root, 'data', 'images'), { recursive: true });
  const marker = path.join(root, 'desktop.json');
  let previous;
  try { previous = JSON.parse(await fs.readFile(marker, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && previous.schemaVersion !== 1) throw new Error('存档格式比当前程序新，请使用新版程序。');
  await fs.writeFile(marker, JSON.stringify({ schemaVersion: 1, appVersion: version }, null, 2));
  return root;
}

// Large imported texts live beside the application, with verified cross-volume migration.
export async function initializeLibrary(library, campaign) {
  await fs.mkdir(path.join(library,'data','modules'),{recursive:true});
  const old=path.join(campaign,'data','modules'), target=path.join(library,'data','modules');
  if(path.resolve(old)===path.resolve(target))return library;
  let names=[];try{names=await fs.readdir(old)}catch(e){if(e.code!=='ENOENT')throw e}
  for(const name of names.filter(n=>/^[a-f0-9]{64}\.json$/.test(n))){
    const original=path.join(old,name),dest=path.join(target,name),bytes=await fs.readFile(original);
    try{await fs.writeFile(dest,bytes,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}
    const copied=await fs.readFile(dest);
    if(!bytes.equals(copied))throw new Error('模组迁移冲突，已保留原件：'+name);
    await fs.unlink(original);
  }
  return library;
}
