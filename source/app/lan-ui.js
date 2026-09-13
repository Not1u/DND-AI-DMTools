(function(){
 const h=React.createElement,call=(op,args={})=>window.SoloHost.call(op,args);
 window.SoloLan=function(){
  const [room,R]=React.useState({active:false,seats:[],requests:[]}),[pcs,P]=React.useState([]),[actor,A]=React.useState(''),[address,B]=React.useState(''),[message,M]=React.useState(''),[error,E]=React.useState(''),[busy,S]=React.useState(false);
  const load=async()=>{const [r,p]=await Promise.all([call('lan.status'),call('party.list')]);R(r);P(p.items||[])};
  React.useEffect(()=>{load().catch(e=>E(e.message));const t=setInterval(()=>load().catch(()=>{}),2000);return()=>clearInterval(t)},[]);
  const run=async(op,args)=>{if(busy)return;S(true);E('');try{const r=await call(op,args);if(r.ok===false)throw Error(r.error);await load()}catch(e){E(e.message)}finally{S(false)}};
  const button=(text,op,args)=>h('button',{type:'button',className:'dndp-btn',disabled:busy,onClick:()=>run(op,args)},text);
  const base=address||room.addresses?.find(a=>!a.includes('127.0.0.1'))||room.addresses?.[0]||'';
  return h('section',{className:'lan-console'},h('h2',null,'手机 / 局域网联机 · 测试版'),h('p',null,'电脑担任 DM 主机，手机连接同一 Wi-Fi。邀请绑定一个角色，有效期 24 小时。'),error?h('p',{role:'alert'},error):null,
   button(room.active?'关闭房间并撤销邀请':'开启局域网房间',room.active?'lan.stop':'lan.start'),room.active?h(React.Fragment,null,
    h('label',null,'连接地址（多网卡时选择 Wi-Fi / 以太网地址）',h('select',{value:base,onChange:e=>B(e.target.value)},room.addresses.map(a=>h('option',{key:a,value:a},a)))),
    h('label',null,'分配玩家角色',h('select',{value:actor,onChange:e=>A(e.target.value)},h('option',{value:''},'选择角色'),pcs.map(p=>h('option',{key:p.id,value:p.id},p.name)))),button('生成玩家邀请','lan.invite',{actorId:actor}),
    h('div',{className:'lan-seats'},room.seats.map(s=>h('article',{key:s.id},h('b',null,s.name),h('small',null,s.lastSeen&&Date.now()-s.lastSeen<15000?' · 在线':' · 未连接 / 离线'),h('input',{readOnly:true,value:base+'/#'+s.fragment,onFocus:e=>e.target.select(),'aria-label':s.name+' 邀请链接'}),h('p',null,'复制完整链接到手机浏览器打开；同机测试可改用 127.0.0.1 地址。'),button('撤销邀请','lan.revoke',{id:s.id})))),
    h('p',null,'公开地图会展示当前整张地形和未隐藏棋子，不包含笔记和 PDF 原图。请先确认没有需要保密的地形；新地图和新棋子需要重新公开。'),button('公开当前整张示意图','lan.publish'),button('收回公开地图','lan.unpublish'),h('small',null,'当前公开：'+(room.published||'无')),
    h('h3',null,'玩家行动请求'),h('p',null,'探索移动和 DM 已要求的投骰直接执行；战斗移动与结束回合需批准。法术 / 自定义行动仅提交意图，由你继续裁定和结算。'),room.requests.slice(-20).reverse().map(r=>h('article',{key:r.id,className:'lan-request'},h('b',null,r.name+' · '+({move:'移动至 '+r.x+','+r.y,roll:'投骰',action:'行动',endTurn:'结束回合'}[r.type])),h('p',null,r.text||r.summary||'等待处理'),r.status==='pending'?h('div',null,button(r.type==='action'?'接收意图（继续裁定）':'批准并执行','lan.decide',{id:r.id,approve:true}),button('驳回','lan.decide',{id:r.id,approve:false})):h('small',null,{done:'已处理',failed:'未执行',rejected:'已驳回',processing:'处理中'}[r.status]))),
    h('label',null,'发给所有手机玩家',h('textarea',{value:message,onChange:e=>M(e.target.value),placeholder:'DM 描述、裁定结果或下一步提示'})),button('发送公开发言','lan.say',{text:message}),
    h('details',null,h('summary',null,'公开对话记录'),room.messages.slice(-20).map(m=>h('p',{key:m.id},h('b',null,m.speaker+'：'),m.text)))
   ):null);
 };
})();
