/* Safe Markdown rendering: no raw HTML, scripts, images or dangerous URLs. */
(function(){
 const h=React.createElement;
 function inline(text){
  const out=[],pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;let pos=0,m;
  text=String(text).replace(/\*{4,}/g,'**');
  while((m=pattern.exec(text))){if(m.index>pos)out.push(text.slice(pos,m.index));const t=m[0];if(t[0]==='`')out.push(h('code',{key:m.index},t.slice(1,-1)));else if(t.startsWith('**')||t.startsWith('__'))out.push(h('strong',{key:m.index},t.slice(2,-2)));else if(t[0]==='*')out.push(h('em',{key:m.index},t.slice(1,-1)));else{const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);out.push(/^https?:\/\//i.test(link[2])?h('a',{key:m.index,href:link[2],target:'_blank',rel:'noopener noreferrer'},link[1]):link[1])}pos=pattern.lastIndex}if(pos<text.length)out.push(text.slice(pos));return out;
 }
 const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(c=>c.trim().replace(/\\\|/g,'|'));
 function blocks(text){const lines=String(text||'').replace(/\r/g,'').split('\n'),out=[];let i=0;
  while(i<lines.length){const l=lines[i];if(!l.trim()){i++;continue}const key=i;
   if(/^\s*```/.test(l)){const code=[];i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);i++;out.push(h('pre',{key},h('code',null,code.join('\n'))));continue}
   if(i+1<lines.length&&l.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){const headers=cells(l),rows=[];i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(cells(lines[i++]));out.push(h('div',{key,className:'dm-table-scroll',tabIndex:0},h('table',null,h('thead',null,h('tr',null,headers.map((c,k)=>h('th',{key:k},inline(c))))),h('tbody',null,rows.map((row,k)=>h('tr',{key:k},headers.map((_,j)=>h('td',{key:j},inline(row[j]||'')))))))));continue}
   const heading=/^\s*(#{1,6})\s+(.+)$/.exec(l);if(heading){out.push(h('h'+Math.min(6,heading[1].length+2),{key},inline(heading[2])));i++;continue}
   if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(l)){out.push(h('hr',{key}));i++;continue}
   if(/^\s*>/.test(l)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,''));out.push(h('blockquote',{key},blocks(quote.join('\n'))));continue}
   if(/^\s*(?:[-+*]|\d+[.)])\s+/.test(l)){const ordered=/^\s*\d/.test(l),items=[];while(i<lines.length&&/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*(?:[-+*]|\d+[.)])\s+/,''));out.push(h(ordered?'ol':'ul',{key},items.map((t,k)=>h('li',{key:k},inline(t)))));continue}
   const paragraph=[l];i++;while(i<lines.length&&lines[i].trim()&&!/^\s*(#{1,6}\s|>|```|[-+*]\s|\d+[.)]\s)/.test(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&/---/.test(lines[i+1])))paragraph.push(lines[i++]);out.push(h('p',{key},paragraph.flatMap((p,k)=>k?[h('br',{key:'b'+k}),...inline(p)]:inline(p))));
  }return out;
 }
 window.SoloMarkdown=function({text}){return h('div',{className:'dm-markdown'},blocks(text))};
})();

(function(){const h=React.createElement;
window.SoloRollRequest=function({call,onClose}){
 const [party,setParty]=React.useState([]),[actorId,setActor]=React.useState(''),[expr,setExpr]=React.useState('1d20'),[label,setLabel]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 React.useEffect(()=>{call('party.list',{}).then(r=>{setParty(r.items||[]);setActor(r.items?.[0]?.id||'')}).catch(e=>setError(e.message))},[]);
 return h('div',{className:'roll-request-modal',role:'dialog','aria-label':'补建骰子请求'},h('div',{className:'roll-request-card'},h('h3',null,'补建骰子请求'),h('p',null,'用于 DM 已明确要求投骰、但请求未出现时。请照 DM 给出的公式填写，包含角色加值。'),h('label',null,'角色',h('select',{value:actorId,onChange:e=>setActor(e.target.value)},party.map(p=>h('option',{key:p.id,value:p.id},p.name)))),h('label',null,'骰子公式',h('input',{value:expr,onChange:e=>setExpr(e.target.value),placeholder:'1d20+2'})),h('label',null,'判定用途',h('input',{value:label,onChange:e=>setLabel(e.target.value),placeholder:'例如：说服守卫'})),error?h('p',{role:'alert'},error):null,h('button',{className:'dndp-btn',disabled:busy,onClick:onClose},'取消'),h('button',{className:'dndp-btn primary',disabled:busy||!actorId||!label.trim(),onClick:async()=>{setBusy(true);try{const r=await call('dm.action',{action:'roll',actorId,expr,label});if(!r.ok)throw Error(r.error);onClose()}catch(e){setError(e.message)}finally{setBusy(false)}}},'加入投骰队列')))
};})();

// Explicit choices stay presentation-only; clicking sends ordinary player text.
window.SoloDMChoices=function(content){
 let text=String(content||''),options=[];
 text=text.replace(/```choices\s*\n([\s\S]*?)```/gi,(block,body)=>{try{const list=JSON.parse(body);if(!Array.isArray(list)||!list.length||list.length>8||list.some(x=>typeof x!=='string'||!x.trim()||x.length>240))return block;options.push(...list.map(x=>x.trim()));return ''}catch{return block}});
 if(!options.length&&/(?:你怎么选|你选择|请选择|你要如何|你想怎么|你打算|选择一个|可选行动|可选方案)/.test(text)){
  for(const line of text.replace(/```[\s\S]*?```/g,'').split('\n')){
   const clean=line.trim().replace(/\*\*/g,'');
   const row=clean.startsWith('|')?clean.split('|').slice(1,-1).map(x=>x.trim()).filter(Boolean).join('：'):clean;
   const m=row.match(/^(?:[-*]\s*)?(?:[A-HＡ-Ｈ][、.．:：)）]|[1-8][、.．)）])\s*(.{1,240})$/);
   if(m&&!/^(?:其他|自定义|自由输入)/.test(m[1]))options.push(m[1]);
  }
 }
 options=[...new Set(options)].slice(0,8);return {text:text.trim(),options:options.length>=2?options:[]};
};
