(function(){
 const h=React.createElement;
 window.SoloPdfMap=function PdfMap({call,onClose,onCreated}){
  const [list,setList]=React.useState([]),[moduleId,setModule]=React.useState(''),[page,setPage]=React.useState(1),[preview,setPreview]=React.useState(null),[crop,setCrop]=React.useState({x:0,y:0,w:1,h:1});
  const [cols,setCols]=React.useState(24),[rows,setRows]=React.useState(16),[name,setName]=React.useState(''),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
  const frame=React.useRef(null),drag=React.useRef(null);
  const selected=list.find(m=>m.id===moduleId);
  const reload=async()=>{const r=await(await fetch('/api/modules')).json();if(!r.ok)throw Error(r.error);const pdfs=r.items.filter(m=>/\.pdf$/i.test(m.filename));setList(pdfs);return pdfs};
  React.useEffect(()=>{reload().then(pdfs=>{const m=pdfs.find(m=>m.hasPdf);if(m)setModule(m.id)}).catch(e=>setMessage(e.message))},[]);
  React.useEffect(()=>{const close=e=>{if(e.key==='Escape'&&!busy)onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[busy]);
  React.useEffect(()=>{if(preview)setRows(Math.max(4,Math.min(60,Math.round(cols*preview.height*crop.h/(preview.width*crop.w)))))},[cols,preview,crop]);
  const upload=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>50*1024*1024){setMessage('PDF 不能超过 50 MB。');return}setBusy(true);try{const r=await(await fetch('/api/modules?filename='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})).json();if(!r.ok)throw Error(r.error);await reload();setModule(r.id);setPage(1);setPreview(null);setCrop({x:0,y:0,w:1,h:1});setMessage(r.imageOnly?'原件已保存，可直接制作地图；AI 研究文字需先 OCR。':'PDF 已就绪，请选择页码并预览。')}catch(e){setMessage(e.message)}finally{setBusy(false)}};
  const show=async()=>{setBusy(true);setMessage('正在渲染 PDF 原页…');setPreview(null);try{const r=await call('pdf.page',{moduleId,page:Number(page)});if(!r.ok)throw Error(r.error);setPreview(r);setCrop({x:0,y:0,w:1,h:1});setMessage('在原页上拖出地图范围，或输入裁剪百分比。')}catch(e){setMessage(e.message)}finally{setBusy(false)}};
  const point=e=>{const r=frame.current.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};
  const move=e=>{if(!drag.current||busy)return;const q=point(e),p=drag.current,x=Math.min(p.x,q.x),y=Math.min(p.y,q.y),w=Math.abs(p.x-q.x),hh=Math.abs(p.y-q.y);if(w>=.01&&hh>=.01)setCrop({x,y,w,h:hh})};
  const make=async research=>{setBusy(true);setMessage('正在建立原图地图…');try{
   const r=await call('map.fromPdf',{moduleId,page:Number(page),crop,w:Number(cols),h:Number(rows),name:name.trim()||undefined});if(!r.ok)throw Error(r.error);
   const picked=await call('campaign.select',{moduleId});if(!picked.ok)throw Error(picked.error);
   if(research){setMessage('地图已建立，AI 正在研究对应场景…');const prep=await call('campaign.prepare',{keepMap:true});if(!prep.ok){onCreated(r);setMessage('地图已建立；AI 研究失败：'+prep.error);return}}
   onCreated(r);onClose();
  }catch(e){setMessage(e.message)}finally{setBusy(false)}};
  const valid=preview&&preview.moduleId===moduleId&&preview.page===Number(page);
  const field=(label,value,change,min,max)=>h('label',{className:'pdf-number'},label,h('input',{type:'number',value,min,max,disabled:busy,onChange:e=>change(Number(e.target.value))}));
  const dialog=h('div',{className:'pdf-map-overlay'},h('section',{className:'pdf-map-dialog',role:'dialog','aria-modal':true,'aria-label':'PDF 原图地图'},
   h('header',null,h('div',null,h('h2',null,'把原书地图，放上桌面。'),h('p',null,'选页 → 裁剪 → 对齐网格。文字生成的地图仍可独立保留。')),h('button',{disabled:busy,onClick:onClose,'aria-label':'关闭 PDF 地图'},'关闭')),
   h('div',{className:'pdf-map-controls'},h('select',{'aria-label':'PDF 模组',value:moduleId,disabled:busy,onChange:e=>{setModule(e.target.value);setPage(1);setPreview(null)}},h('option',{value:''},'选择 PDF 模组'),list.map(m=>h('option',{key:m.id,value:m.id,disabled:!m.hasPdf},m.name+(m.hasPdf?' · '+m.pageCount+' 页':' · 需重新上传原件')))),
    h('label',{className:'pdf-upload'},'上传 / 补传 PDF',h('input',{type:'file',accept:'.pdf',disabled:busy,onChange:upload,'aria-label':'上传地图 PDF'})),field('PDF 页码',page,v=>{setPage(v);setPreview(null)},1,selected?.pageCount||9999),h('button',{disabled:busy||!selected?.hasPdf,onClick:show},'预览原页')),
   h('div',{className:'pdf-map-main'},h('div',{className:'pdf-page-scroll'},preview?h('div',{ref:frame,className:'pdf-page-frame',onPointerDown:e=>{if(busy)return;drag.current=point(e);e.currentTarget.setPointerCapture(e.pointerId)},onPointerMove:move,onPointerUp:e=>{move(e);drag.current=null},onPointerCancel:()=>{drag.current=null}},h('img',{src:preview.url,alt:'PDF 第 '+page+' 页',draggable:false}),h('div',{className:'pdf-crop',style:{left:crop.x*100+'%',top:crop.y*100+'%',width:crop.w*100+'%',height:crop.h*100+'%','--crop-cols':cols,'--crop-rows':rows}})):h('p',{className:'pdf-empty'},'先选择 PDF 和页码，再预览地图。')),
    h('aside',null,h('h3',null,'裁剪区域 · %'),h('p',null,'沿原图最外侧网格线裁剪，去掉页边与图注。'),h('div',{className:'pdf-fields'},['x','y','w','h'].map((key,i)=>field(['左侧','顶部','宽度','高度'][i],Math.round(crop[key]*10000)/100,v=>setCrop(c=>({...c,[key]:v/100})),0,100))),
     h('button',{disabled:busy,onClick:()=>setCrop({x:0,y:0,w:1,h:1})},'恢复整页'),h('h3',null,'对齐网格'),h('div',{className:'pdf-fields'},field('列数',cols,setCols,4,80),field('行数',rows,setRows,4,60)),h('p',null,'每格 5 尺；行数按原图比例估算，请与原图格数核对。'),h('label',null,'地图名称',h('input',{value:name,onChange:e=>setName(e.target.value),placeholder:'默认使用模组名和页码',disabled:busy})),h('p',null,'原图不会自动识别墙壁和暗门。建图后用“标注地形”校对；未确认前不计算掩体。'))),
   h('footer',null,h('p',{role:'status'},message),h('button',{disabled:busy||!valid,onClick:()=>make(false)},'建立原图地图'),h('button',{disabled:busy||!valid,onClick:()=>make(true)},'建立并让 AI 研究'))));
  return ReactDOM.createPortal(dialog,document.body);
 };
})();
