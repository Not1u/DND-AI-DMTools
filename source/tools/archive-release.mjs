import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const folder=path.join(root,'dist','SoloTRPG-'+pkg.version+'-Windows-x64'),zip=folder+'.zip';
// Only archive the staging folder built from tracked resources, never the user's live library.
try{const modules=await fs.readdir(path.join(folder,'library','data','modules'));if(modules.length)throw new Error('发布目录含用户模组；请换用干净暂存目录。')}catch(e){if(e.code!=='ENOENT')throw e}
const q=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync('powershell.exe',['-NoProfile','-Command','Compress-Archive -LiteralPath '+q(path.join(folder,'SoloTRPG.exe'))+','+q(path.join(folder,'runtime'))+','+q(path.join(folder,'library'))+' -DestinationPath '+q(zip)+' -Force'],{stdio:'inherit'});
const hash=createHash('sha256').update(await fs.readFile(zip)).digest('hex');await fs.writeFile(zip+'.sha256',hash+'  '+path.basename(zip)+'\n');console.log(zip);
