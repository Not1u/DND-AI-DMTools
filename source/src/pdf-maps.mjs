import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
export function cropOf(c={}) {
  const r={x:Number(c.x??0),y:Number(c.y??0),w:Number(c.w??1),h:Number(c.h??1)};
  if(!Object.values(r).every(Number.isFinite)||r.x<0||r.y<0||r.w<.01||r.h<.01||r.x+r.w>1.000001||r.y+r.h>1.000001)throw new Error('裁剪范围应在页面内，宽高至少 1%。');
  return r;
}
export function createPdfMapStore(root,modules) {
  const dir=path.join(root,'data','map-images');let rendering=false;
  const imagePath=id=>{if(!/^[a-f0-9]{64}$/.test(String(id)))throw new Error('图片标识无效');return path.join(dir,id+'.png')};
  return {
    imagePath,
    async imageBytes(id){return fs.readFile(imagePath(id))},
    async render(a={}){
      const page=Number(a.page);if(!Number.isInteger(page)||page<1)throw new Error('请输入从 1 开始的 PDF 页码。');
      const crop=cropOf(a.crop),source=await modules.pdf(a.moduleId);
      const id=createHash('sha256').update(JSON.stringify([a.moduleId,page,crop,2])).digest('hex');
      const file=imagePath(id),metaFile=path.join(dir,id+'.json');
      try{const meta=JSON.parse(await fs.readFile(metaFile,'utf8'));await fs.access(file);return meta}catch{}
      if(rendering)throw new Error('正在处理另一张 PDF 地图，请稍候重试。');rendering=true;
      let parser;try{
        const {PDFParse}=await import('pdf-parse');
        const pdfRoot=path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
        parser=new PDFParse({data:new Uint8Array(source.data),isEvalSupported:false,cMapUrl:path.join(pdfRoot,'cmaps').replaceAll('\\','/')+'/',cMapPacked:true,standardFontDataUrl:path.join(pdfRoot,'standard_fonts').replaceAll('\\','/')+'/'});
        const info=await parser.getInfo({partial:[page],parsePageInfo:true});
        if(page>info.total)throw new Error('页码超出范围：共 '+info.total+' 页。');
        const size=info.pages.find(p=>p.pageNumber===page);if(!size||!size.width||!size.height)throw new Error('无法读取页面尺寸');
        const desiredWidth=Math.max(1,Math.min(2400,Math.floor(Math.sqrt(8000000*size.width/size.height))));
        const shot=(await parser.getScreenshot({partial:[page],desiredWidth,imageDataUrl:false,imageBuffer:true})).pages[0];
        const {createCanvas,loadImage}=await import('@napi-rs/canvas');
        const x=Math.floor(crop.x*shot.width),y=Math.floor(crop.y*shot.height),width=Math.max(1,Math.min(shot.width-x,Math.round(crop.w*shot.width))),height=Math.max(1,Math.min(shot.height-y,Math.round(crop.h*shot.height)));
        const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(await loadImage(Buffer.from(shot.data)),x,y,width,height,0,0,width,height);
        const meta={id,url:'/map-images/'+id+'.png',moduleId:a.moduleId,page,pageCount:info.total,crop,width,height,source:source.record.name+' · PDF 第 '+page+' 页',terrainReady:false};
        await fs.mkdir(dir,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
        try{await fs.writeFile(tmp,canvas.toBuffer('image/png'));await fs.rename(tmp,file)}finally{await fs.unlink(tmp).catch(()=>{})}
        await fs.writeFile(metaFile,JSON.stringify(meta));return meta;
      }finally{try{await parser?.destroy()}finally{rendering=false}}
    }
  };
}
