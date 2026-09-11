#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url))),root=path.dirname(source);
const pkg=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
const publishRoot=root; const stage=path.join(source,'dist','SoloTRPG-'+pkg.version+'-Windows-x64');
const unpacked=path.join(source,'dist','win-unpacked');
await fs.access(path.join(unpacked,'SoloTRPG.exe'));
await fs.mkdir(path.join(stage,'runtime'),{recursive:true});
await fs.cp(unpacked,path.join(stage,'runtime'),{recursive:true,force:true});
await fs.mkdir(path.join(stage,'library','data'),{recursive:true});
await fs.cp(path.join(source,'rules'),path.join(stage,'library','rules'),{recursive:true,force:true});
await fs.cp(path.join(source,'data','rules-index'),path.join(stage,'library','data','rules-index'),{recursive:true,force:true});
const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
execFileSync(csc,['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/win32icon:'+path.join(source,'app','icon.ico'),'/out:'+path.join(stage,'SoloTRPG.exe'),path.join(source,'tools','launcher.cs')],{stdio:'inherit'});
await fs.writeFile(path.join(stage,'runtime','release.json'),JSON.stringify({version:pkg.version,layout:2},null,2));
if(!process.argv.includes('--stage')) {
 await fs.copyFile(path.join(stage,'SoloTRPG.exe'),path.join(publishRoot,'SoloTRPG.exe'));
 await fs.cp(path.join(stage,'runtime'),path.join(publishRoot,'runtime'),{recursive:true,force:true});
 await fs.cp(path.join(stage,'library','rules'),path.join(publishRoot,'library','rules'),{recursive:true,force:true});
 await fs.cp(path.join(stage,'library','data','rules-index'),path.join(publishRoot,'library','data','rules-index'),{recursive:true,force:true});
}
console.log('Published '+pkg.version+': SoloTRPG.exe + runtime/ + library/. Imported modules are preserved.');
