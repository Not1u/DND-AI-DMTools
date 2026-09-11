// Connected tactical terrain: AI supplies rooms and landmarks from the adventure.
export function composeMap(a = {}) {
  const clamp = (n,lo,hi,f) => Number.isFinite(Number(n)) ? Math.max(lo,Math.min(hi,Math.floor(Number(n)))) : f;
  const w=clamp(a.w,16,64,32), h=clamp(a.h,12,48,24), forest=a.biome==='forest', cave=a.biome==='cave';
  const grid=Array.from({length:h},()=>Array(w).fill(forest?'T':'#'));
  const defaults=[{x:2,y:2,w:8,h:7},{x:14,y:3,w:10,h:8},{x:7,y:14,w:12,h:7}];
  const rooms=(Array.isArray(a.rooms)&&a.rooms.length?a.rooms:defaults).slice(0,16).map((r,i)=>{
    const x=clamp(r.x,1,w-5,2),y=clamp(r.y,1,h-5,2),rw=clamp(r.w,4,w-x-1,4),rh=clamp(r.h,4,h-y-1,4);
    for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++) {
      const rounded=cave && ((xx===x||xx===x+rw-1)&&(yy===y||yy===y+rh-1));
      if(!rounded)grid[yy][xx]=forest?'g':'.';
    }
    return {name:String(r.name||'区域 '+(i+1)),x,y,w:rw,h:rh,cx:x+Math.floor(rw/2),cy:y+Math.floor(rh/2)};
  });
  const carve=(x,y)=>{for(let d=0;d<2;d++){if(y+d<h-1&&x>0&&x<w-1)grid[y+d][x]=forest?'g':'.';}};
  const connect=()=>{for(let i=1;i<rooms.length;i++){let {cx:x,cy:y}=rooms[i-1];const b=rooms[i];while(x!==b.cx){carve(x,y);x+=Math.sign(b.cx-x);}while(y!==b.cy){carve(x,y);y+=Math.sign(b.cy-y);}carve(x,y);}};
  connect();
  for(const f of (Array.isArray(a.features)?a.features:[]).slice(0,80)){
    const x=clamp(f.x,1,w-2,1),y=clamp(f.y,1,h-2,1);
    if('.~o+T=^x,gvswfpc!'.includes(f.t)&&grid[y][x]!=='#')grid[y][x]=f.t;
  }
  connect(); // Main routes remain walkable even when furnishings overlap them.
  return {name:String(a.name||'探索地图'),campaign:String(a.campaign||''),w,h,terrain:grid.map(r=>r.join('')),tokens:[],rooms,entry:{x:rooms[0].cx,y:rooms[0].cy}};
}
