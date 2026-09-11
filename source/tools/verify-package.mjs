import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const asar=createRequire(import.meta.url)('@electron/asar');
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const archive=path.join(source,'dist/win-unpacked/resources/app.asar');
let count=0;
for(const entry of asar.listPackage(archive)){
 const file=entry.replace(/^[\\/]+/,'');
 const item=asar.statFile(archive,file);
 if(item.files||item.link)continue;
 const data=asar.extractFile(archive,file);
 if(item.integrity&&createHash('sha256').update(data).digest('hex')!==item.integrity.hash)throw Error('打包完整性失败：'+file+'。打包期间不能修改源码，请重新构建。');
 count++;
}
const packaged=JSON.parse(asar.extractFile(archive,'package.json').toString());
const expected=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
if(packaged.version!==expected.version)throw Error('发布版本不匹配。');
console.log('ASAR verified: '+count+' files, version '+packaged.version);
