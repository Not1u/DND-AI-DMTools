import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {extractActions,missedRoll,townPlan} from '../src/campaign.mjs';
test('DM Markdown produces tables, emphasis, lists and quotes without interpreting HTML or unsafe links',async()=>{
 const sandbox={window:{},React:{createElement:(type,props,...children)=>({type,props,children})}};vm.runInNewContext(await fs.readFile(new URL('../app/markdown.js',import.meta.url),'utf8'),sandbox);
 const tree=sandbox.window.SoloMarkdown({text:'**HP 1/5**\n\n| 方案 | 说明 |\n| --- | --- |\n| 谈判 | **说服** |\n\n- 舞光术\n\n> 守卫开口\n\n<img src=x onerror=evil()> [unsafe](javascript:evil)'});const types=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){types.push(n.type);walk(n.children)}}walk(tree);for(const type of ['table','th','td','strong','ul','blockquote'])assert.ok(types.includes(type),type);assert.ok(!types.includes('img'));assert.ok(!JSON.stringify(tree).includes('"href":"javascript:'));
});
test('action extraction is explicit; conditional advice and enemy stat dice never trigger a roll',()=>{
 assert.equal(missedRoll('请进行一次察觉检定。'),true);assert.equal(missedRoll('如果确定动手，伤害1d6+2。你怎么选？'),false);assert.equal(missedRoll('地精伤害1d6+2'),false);assert.equal(extractActions('```dm-action\n{"action":"roll","expr":"1d20"}\n```').actions.length,1);assert.equal(extractActions('```dm-action\n{"action":"delete"}\n```').errors.length,1);const plan=townPlan({places:Array.from({length:12},(_,i)=>({name:'地点'+i})),npcs:Array.from({length:30},(_,i)=>({name:'NPC'+i}))});assert.ok(plan.tokens.every(t=>t.x>=0&&t.y>=0&&t.x<plan.w&&t.y<plan.h));assert.ok(plan.terrain.every(r=>r.length===plan.w));
});
