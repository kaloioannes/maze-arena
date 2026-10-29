import type { Maze, MapOptions } from './types.ts';
export const bits = [1,2,4,8]; // north east south west
export const opposite = [4,8,1,2];
export function random(seed:string) {
  let h=2166136261;
  for (let i=0;i<seed.length;i++) h=Math.imul(h^seed.charCodeAt(i),16777619);
  return () => { h+=0x6d2b79f5; let t=h; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
export function neighbors(m:Maze, u:number): number[] {
  const c=m.cells[u], w=m.width, out:number[]=[];
  if(c&1) out.push(u-w); if(c&2) out.push(u+1); if(c&4) out.push(u+w); if(c&8) out.push(u-1);
  return out;
}
export function direction(m:Maze,u:number,v:number) { return v===u-m.width?0:v===u+1?1:v===u+m.width?2:3; }
export function distance(m:Maze,u:number,v=m.goal) { return Math.abs(u%m.width-v%m.width)+Math.abs(Math.floor(u/m.width)-Math.floor(v/m.width)); }
export function generate(opts:MapOptions, progress: (p:number)=>void=()=>{}):Maze {
  const w=opts.width,h=opts.height,n=w*h;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<4||h<4||w>1024||h>1024) throw new Error('尺寸范围为 4–1024 的整数');
  if(!['backtracker','prim','kruskal','wilson','division','sidewinder','binary'].includes(opts.generator)) throw new Error('未知生成算法');
  const m:Maze={...opts,cells:new Uint8Array(n),weights:new Uint8Array(n).fill(1),start:0,goal:n-1,version:1};
  const rng=random(`maze-arena-v1|${opts.seed}|${w}|${h}|${opts.generator}`), pick=(v:number)=>Math.floor(rng()*v);
  const offsets=[-w,1,w,-1];
  const adj=(u:number) => { const a:number[]=[]; if(u>=w)a.push(0); if(u%w<w-1)a.push(1); if(u<n-w)a.push(2); if(u%w>0)a.push(3); return a; };
  const link=(u:number,d:number) => { const v=u+offsets[d]; m.cells[u]|=bits[d]; m.cells[v]|=opposite[d]; };
  const unlink=(u:number,d:number) => { const v=u+offsets[d]; m.cells[u]&=~bits[d]; m.cells[v]&=~opposite[d]; };
  let last=0; const report=(x:number)=>{ const now=performance.now(); if(now-last>90){progress(Math.min(.94,x));last=now;} };
  if(opts.generator==='backtracker') {
    const seen=new Uint8Array(n),stack=new Int32Array(n); let len=1,count=1; seen[0]=1;
    while(len){ const u=stack[len-1],ds=adj(u).filter(d=>!seen[u+offsets[d]]); if(ds.length){const d=ds[pick(ds.length)],v=u+offsets[d];link(u,d);seen[v]=1;stack[len++]=v;count++;}else len--; if((count&4095)===0)report(count/n); }
  } else if(opts.generator==='prim') {
    const seen=new Uint8Array(n),edges:number[]=[];
    const add=(u:number)=>{seen[u]=1;for(const d of adj(u))if(!seen[u+offsets[d]])edges.push(u*4+d);};
    add(0);let count=1;
    while(edges.length){const i=pick(edges.length),e=edges[i];edges[i]=edges[edges.length-1];edges.pop();const u=Math.floor(e/4),d=e%4,v=u+offsets[d];if(!seen[v]){link(u,d);add(v);count++;}if((count&4095)===0)report(count/n);}
  } else if(opts.generator==='kruskal') {
    const parent=new Int32Array(n),rank=new Uint8Array(n),edges=new Uint32Array(2*n-w-h);let k=0;
    for(let u=0;u<n;u++){parent[u]=u;if(u%w<w-1)edges[k++]=u*4+1;if(u<n-w)edges[k++]=u*4+2;}
    const root=(u:number)=>{while(parent[u]!==u){parent[u]=parent[parent[u]];u=parent[u];}return u;};
    for(let i=edges.length-1;i>0;i--){const j=pick(i+1),t=edges[i];edges[i]=edges[j];edges[j]=t;}
    for(let i=0;i<edges.length;i++){const e=edges[i],u=Math.floor(e/4),d=e%4;let a=root(u),b=root(u+offsets[d]);if(a!==b){if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;link(u,d);}if((i&8191)===0)report(i/edges.length);}
  } else if(opts.generator==='wilson') {
    const tree=new Uint8Array(n),next=new Int8Array(n);tree[n-1]=1;let count=1,ticks=0;
    for(let s=0;s<n;s++)if(!tree[s]){
      let u=s;
      while(!tree[u]){const ds=adj(u),d=ds[pick(ds.length)];next[u]=d;u+=offsets[d];if((++ticks&16383)===0)report(count/n);}
      u=s;while(!tree[u]){const d=next[u];tree[u]=1;count++;link(u,d);u+=offsets[d];}
      report(count/n);
    }
  } else if(opts.generator==='division') {
    for(let u=0;u<n;u++){if(u%w<w-1)link(u,1);if(u<n-w)link(u,2);}
    const regions=[0,0,w,h];let count=0;
    while(regions.length){const rh=regions.pop()!,rw=regions.pop()!,y=regions.pop()!,x=regions.pop()!;if(rw<2||rh<2)continue;
      if(rw>rh||(rw===rh&&rng()<.5)){const cut=x+1+pick(rw-1),gap=y+pick(rh);for(let yy=y;yy<y+rh;yy++)if(yy!==gap)unlink(yy*w+cut-1,1);regions.push(x,y,cut-x,rh,cut,y,x+rw-cut,rh);}
      else {const cut=y+1+pick(rh-1),gap=x+pick(rw);for(let xx=x;xx<x+rw;xx++)if(xx!==gap)unlink((cut-1)*w+xx,2);regions.push(x,y,rw,cut-y,x,cut,rw,y+rh-cut);}
      if((++count&4095)===0)report(count/n);
    }
  } else if(opts.generator==='binary') {
    for(let u=0;u<n;u++){const ds:number[]=[];if(u>=w)ds.push(0);if(u%w<w-1)ds.push(1);if(ds.length)link(u,ds[pick(ds.length)]);if((u&8191)===0)report(u/n);}
  } else {
    for(let y=0;y<h;y++){let run=0;for(let x=0;x<w;x++){const u=y*w+x;if(x<w-1&&(y===0||rng()<.5))link(u,1);else{if(y>0)link(y*w+run+pick(x-run+1),0);run=x+1;}}report(y/h);}
  }
  // Independent post-processing keeps the generation seed reproducible across all controls.
  if(opts.rooms)for(let r=0;r<Math.max(1,Math.floor(n/650));r++){
    const rw=Math.min(w,3+pick(7)),rh=Math.min(h,3+pick(7)),x=pick(w-rw+1),y=pick(h-rh+1);
    for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++){const u=yy*w+xx;if(xx<x+rw-1)link(u,1);if(yy<y+rh-1)link(u,2);}
  }
  for(let u=0;u<n;u++){
    if(opts.loops>0){if(u%w<w-1&&!(m.cells[u]&2)&&rng()<opts.loops/100)link(u,1);if(u<n-w&&!(m.cells[u]&4)&&rng()<opts.loops/100)link(u,2);}
    if(opts.weighted&&rng()<.24)m.weights[u]=2+pick(8);
  }
  m.weights[m.start]=1;m.weights[m.goal]=1;progress(1);return m;
}
