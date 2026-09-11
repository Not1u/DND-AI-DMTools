import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('settings save button completes and releases busy state', async () => {
 const src=fs.readFileSync(new URL('../engine/ui-client.latest.txt',import.meta.url),'utf8');
 const panel=src.slice(src.indexOf('function SettingsPanel'),src.indexOf('function SettingsPanel')+src.slice(src.indexOf('function SettingsPanel')).indexOf('\nfunction ',10));
 let index=0; const values=[{config:{},presets:{},path:'test'}, {}, '', '', false];
 const React={useState(initial){const i=index++; if(values[i]===undefined)values[i]=initial;return [values[i],v=>values[i]=v]},useEffect(){}};
 const calls=[]; const call=async(op,args)=>{calls.push(op);return op==='settings.get'?{ok:true,config:{}}:{ok:true,saved:true,summary:'saved'};};
 const h=(type,props,...children)=>({type,props,children});
 const factory=new Function('React','call','h','normThemeLocal','DEFAULT_THEME','THEME_LIST','ACCENT_SWATCH',panel+';return SettingsPanel');
 const component=factory(React,call,h,x=>x,{accent:'#000000'},[],[]);
 const tree=component({}); const buttons=[];
 function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){if(n.type==='button')buttons.push(n);visit(n.children)}} visit(tree);
 const save=buttons.find(n=>n.children.includes('保存'));assert.ok(save);
 await save.props.onClick(); assert.ok(calls.includes('settings.set'));assert.equal(values[4],false);assert.equal(values[3],'saved');
});

