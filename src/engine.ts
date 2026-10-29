import type { Maze, Snapshot } from './types.ts';
import { neighbors, distance, direction, random, bits } from './maze.ts';

interface Entry { node:number; score:number; g:number }
class Heap {
  data:Entry[]=[];
  push(e:Entry){const a=this.data;let i=a.length;a.push(e);while(i>0){const p=(i-1)>>1;if(a[p].score<=e.score)break;a[i]=a[p];i=p;}a[i]=e;}
  pop(){const a=this.data,first=a[0],last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].score<a[c].score)c++;if(a[c].score>=last.score)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
  top(){const out:Entry[]=[],pending=[0],a=this.data;while(pending.length&&out.length<6&&a.length){pending.sort((x,y)=>a[x].score-a[y].score);const i=pending.shift()!;out.push(a[i]);if(i*2+1<a.length)pending.push(i*2+1);if(i*2+2<a.length)pending.push(i*2+2);}return out;}
}
interface Tick { line:number; event:string }
export class Engine {
  maze:Maze;id:string;states:Uint8Array;parent:Int32Array;g:Float64Array;order:Uint32Array;
  counts:Uint32Array;steps=0;visited=0;frontier=0;peak=0;current=-1;status='running';
  path:number[]=[];cost=0;computeMs=0;line=0;event='等待展开';changes:number[]=[];
  iteration:Generator<Tick,void,unknown>;heap=new Heap();queue:number[]=[];head=0;
  walkCost=0;walkPath:number[]=[];limit:number;topOverride:{node:number;score:number}[]=[];
  forwardDepth:Int32Array|null=null;reverseDepth:Int32Array|null=null;reverseParent:Int32Array|null=null;
  rng:()=>number;
  constructor(maze:Maze,id:string,limit?:number){
    this.maze=maze;this.id=id;const n=maze.cells.length;this.states=new Uint8Array(n);this.parent=new Int32Array(n).fill(-1);this.g=new Float64Array(n).fill(Infinity);this.order=new Uint32Array(n);this.counts=new Uint32Array(n);
    this.limit=limit??Math.max(250000,Math.min(n*40,10000000));this.rng=random(`${maze.seed}|${id}|v1|${maze.start}|${maze.goal}`);
    this.iteration=['left','right','random','tremaux','straight','curious','roulette'].includes(id)?this.walk():id==='bibfs'?this.bidirectional():['iddfs','ida'].includes(id)?this.iterative():id==='beam'?this.beam():this.search();
  }
  mark(u:number,state:number){if(this.states[u]!==state){this.states[u]=state;this.changes.push(u*8+state);}}
  visit(u:number,reverse=false){this.current=u;this.counts[u]++;if(!this.order[u])this.order[u]=++this.visited;this.mark(u,reverse?4:2);}
  discover(u:number,p:number,cost:number){this.parent[u]=p;this.g[u]=cost;this.mark(u,1);}
  finish(path?:number[]){
    this.path=path??this.trace(this.maze.goal);this.cost=0;
    for(let i=1;i<this.path.length;i++)this.cost+=this.maze.weights[this.path[i]];
    this.status='solved';this.event='到达出口 · 路线已连接';this.line=1;
  }
  trace(u:number){const out:number[]=[];for(let i=0;u>=0&&i<=this.parent.length;i++){out.push(u);u=this.parent[u];}return out.reverse();}
  *search():Generator<Tick,void,unknown>{
    const m=this.maze,id=this.id;this.discover(m.start,-1,0);
    const priority=(u:number,g:number)=>id==='dijkstra'?g:id==='greedy'?distance(m,u):g+distance(m,u)*(id==='wastar'?2.5:1);
    const basic=id==='bfs'||id==='dfs';if(basic)this.queue.push(m.start);else this.heap.push({node:m.start,score:priority(m.start,0),g:0});
    while(basic?this.queue.length>this.head:this.heap.data.length>0){
      let u:number;
      if(basic)u=id==='dfs'?this.queue.pop()!:this.queue[this.head++];
      else {const e=this.heap.pop();u=e.node;if(e.g!==this.g[u]||this.states[u]===2)continue;}
      this.visit(u);this.frontier=basic?this.queue.length-this.head:this.heap.data.length;
      if(u===m.goal){this.finish();yield {line:1,event:this.event};return;}
      for(const v of neighbors(m,u)){
        const ng=this.g[u]+m.weights[v];
        if(basic?this.g[v]===Infinity:ng<this.g[v]){
          this.discover(v,u,ng);if(basic)this.queue.push(v);else this.heap.push({node:v,score:priority(v,ng),g:ng});
        }
      }
      this.frontier=basic?this.queue.length-this.head:this.heap.data.length;
      yield {line:3,event:`展开 (${u%m.width}, ${Math.floor(u/m.width)}) · 更新候选前沿`};
    }
    this.status='unreachable';this.event='候选耗尽 · 没有可达路线';
  }
  *bidirectional():Generator<Tick,void,unknown>{
    const m=this.maze,n=m.cells.length,pb=new Int32Array(n).fill(-1),da=new Int32Array(n).fill(-1),db=new Int32Array(n).fill(-1);
    this.forwardDepth=da;this.reverseDepth=db;this.reverseParent=pb;
    let qa=[m.start],qb=[m.goal],side=0;da[m.start]=0;db[m.goal]=0;this.g[m.start]=0;this.g[m.goal]=0;this.mark(m.start,1);this.mark(m.goal,1);
    while(qa.length&&qb.length){const q=side?qb:qa,own=side?db:da,other=side?da:db,next:number[]=[];let meet=-1,best=Infinity;
      for(let qi=0;qi<q.length;qi++){
        const u=q[qi];this.visit(u,!!side);if(other[u]>=0&&own[u]+other[u]<best){best=own[u]+other[u];meet=u;}
        for(const v of neighbors(m,u)){
          if(own[v]<0){own[v]=own[u]+1;if(side)pb[v]=u;else this.parent[v]=u;this.g[v]=own[v];next.push(v);this.mark(v,1);}
          if(other[v]>=0&&own[v]+other[v]<best){best=own[v]+other[v];meet=v;}
        }
        this.frontier=q.length-qi-1+next.length+(side?qa.length:qb.length);this.topOverride=next.slice(0,6).map(node=>({node,score:own[node]}));
        yield {line:2,event:`${side?'终点侧':'起点侧'}扩展 · 当前层 ${own[u]}`};
      }
      if(meet>=0){const path=this.trace(meet);let u=pb[meet];while(u>=0){path.push(u);u=pb[u];}this.finish(path);return;}
      if(side)qb=next;else qa=next;side=1-side;
    }
    this.status='unreachable';this.event='两侧前沿耗尽';
  }
  *beam():Generator<Tick,void,unknown>{
    const m=this.maze;let layer=[m.start];this.discover(m.start,-1,0);
    while(layer.length){const next:number[]=[];for(let i=0;i<layer.length;i++){
      const u=layer[i];this.visit(u);if(u===m.goal){this.finish();yield {line:1,event:this.event};return;}
      for(const v of neighbors(m,u))if(this.g[v]===Infinity){this.discover(v,u,this.g[u]+m.weights[v]);next.push(v);}
      this.frontier=layer.length-i-1+next.length;this.topOverride=next.slice(0,6).map(node=>({node,score:distance(m,node)}));yield {line:2,event:'收集本层邻居 · 束宽 32'};
    }
    next.sort((a,b)=>distance(m,a)-distance(m,b));for(const u of next.slice(32))this.mark(u,3);layer=next.slice(0,32);this.frontier=layer.length;}
    this.status='pruned';this.event='束已耗尽 · 被裁剪的分支可能包含出口';
  }
  *iterative():Generator<Tick,void,unknown>{
    const m=this.maze,ida=this.id==='ida',inPath=new Uint8Array(m.cells.length);let bound=ida?distance(m,m.start):0;
    type Frame={u:number;g:number;ns:number[];i:number;entered:boolean};
    while(true){let nextBound=Infinity,cutoff=false;const stack:Frame[]=[{u:m.start,g:0,ns:[],i:0,entered:false}];inPath[m.start]=1;this.parent[m.start]=-1;
      while(stack.length){const f=stack[stack.length-1];this.frontier=stack.length;this.topOverride=stack.slice(-6).reverse().map((v,i)=>({node:v.u,score:ida?v.g+distance(m,v.u):stack.length-1-i}));
        if(!f.entered){f.entered=true;this.g[f.u]=f.g;this.visit(f.u);const value=ida?f.g+distance(m,f.u):stack.length-1;
          if(value>bound){nextBound=Math.min(nextBound,value);cutoff=true;inPath[f.u]=0;stack.pop();this.mark(f.u,3);yield {line:2,event:`超过阈值 ${bound} · 回溯`};continue;}
          if(f.u===m.goal){this.finish(stack.map(v=>v.u));yield {line:1,event:this.event};return;}
          f.ns=neighbors(m,f.u);yield {line:1,event:`${ida?'f 阈值':'深度上限'} ${bound} · 路径深度 ${stack.length-1}`};
        }else if(f.i<f.ns.length){const v=f.ns[f.i++];if(!inPath[v]){inPath[v]=1;this.parent[v]=f.u;stack.push({u:v,g:f.g+m.weights[v],ns:[],i:0,entered:false});}}
        else {inPath[f.u]=0;this.mark(f.u,3);stack.pop();yield {line:3,event:'当前分支完成 · 沿栈回溯'};}
      }
      if(!cutoff){this.status='unreachable';this.event='已遍历全部简单路径 · 无出口';return;}bound=ida?nextBound:bound+1;
    }
  }
  *walk():Generator<Tick,void,unknown>{
    const m=this.maze,id=this.id,seenDirection=new Uint8Array(m.cells.length),stack=[m.start];let u=m.start,heading=1;
    const backtracking=['tremaux','straight','roulette'].includes(id);this.g[u]=0;this.walkPath=[u];this.visit(u);yield {line:0,event:'进入迷宫 · 初始朝向东'};
    while(true){
      if(u===m.goal){this.finish([...this.walkPath]);return;}
      if(id==='left'||id==='right'){
        if(seenDirection[u]&bits[heading]){this.status='loop';this.event='位置与朝向重复 · 确认陷入循环';return;}seenDirection[u]|=bits[heading];
      }
      let ns=neighbors(m,u),v=-1,back=false;
      if(backtracking){ns=ns.filter(v=>this.counts[v]===0);
        if(ns.length){if(id==='roulette')v=ns[Math.floor(this.rng()*ns.length)];else if(id==='straight')v=ns.find(v=>direction(m,u,v)===heading)??ns[0];else v=ns[0];stack.push(v);}
        else if(stack.length>1){stack.pop();v=stack[stack.length-1];back=true;this.mark(u,3);}else{this.status='unreachable';this.event='全部通道已经标记 · 无出口';return;}
      }else if(id==='left'||id==='right'){
        const prefs=id==='left'?[(heading+3)%4,heading,(heading+1)%4,(heading+2)%4]:[(heading+1)%4,heading,(heading+3)%4,(heading+2)%4];
        for(const d of prefs){const candidate=ns.find(v=>direction(m,u,v)===d);if(candidate!==undefined){v=candidate;break;}}
      }else if(id==='curious'){
        const min=Math.min(...ns.map(v=>this.counts[v]));ns=ns.filter(v=>this.counts[v]===min);v=ns[Math.floor(this.rng()*ns.length)];
      }else v=ns[Math.floor(this.rng()*ns.length)];
      if(v===undefined||v<0){this.status='unreachable';this.event='当前位置没有通道';return;}
      heading=direction(m,u,v);this.parent[v]=u;this.walkCost+=m.weights[v];this.g[v]=this.walkCost;u=v;this.walkPath.push(u);this.visit(u);this.frontier=backtracking?stack.length:ns.length;
      this.topOverride=neighbors(m,u).map(node=>({node,score:this.counts[node]}));yield {line:back?2:3,event:back?'死路 · 沿标记通道返回':`朝${['北','东','南','西'][heading]}移动 · 累计 ${this.walkPath.length-1} 步`};
    }
  }
  advance(budget:number,maxMs=12){const t=performance.now();let count=0;
    if(this.status==='running')while(count<budget){
      if(this.steps>=this.limit){this.status='budget';this.event=`达到 ${this.limit.toLocaleString()} 步安全预算 · 可换算法或地图`;break;}
      const r=this.iteration.next();if(r.done){if(this.status==='running')this.status='unreachable';break;}
      this.steps++;count++;this.line=r.value.line;this.event=r.value.event;this.peak=Math.max(this.peak,this.frontier);
      if(this.status!=='running'||(count%128===0&&performance.now()-t>=maxMs))break;
    }
    this.computeMs+=performance.now()-t;return count;
  }
  snapshot():Snapshot {
    const m=this.maze,u=this.current,h=u>=0?distance(m,u):0,g=u>=0?this.g[u]:0;
    let top=this.topOverride;
    if(['astar','wastar','greedy','dijkstra'].includes(this.id))top=this.heap.top().map(e=>({node:e.node,score:e.score}));
    else if(this.id==='bfs')top=this.queue.slice(this.head,this.head+6).map(node=>({node,score:this.g[node]}));
    else if(this.id==='dfs')top=this.queue.slice(-6).reverse().map(node=>({node,score:this.g[node]}));
    const changes=new Uint32Array(this.changes);this.changes=[];
    return {id:this.id,steps:this.steps,visited:this.visited,frontier:this.frontier,peak:this.peak,current:u,g,h,f:this.id==='greedy'?h:this.id==='dijkstra'?g:g+h*(this.id==='wastar'?2.5:1),parent:u<0?-1:this.parent[u],computeMs:this.computeMs,status:this.status,path:this.path,cost:this.cost,line:this.line,event:this.event,top,changes};
  }
  inspect(u:number){const reverse=!!(this.reverseDepth&&this.reverseDepth[u]>=0&&(this.states[u]===4||this.forwardDepth![u]<0));const value=this.id==='bibfs'&&this.forwardDepth?(reverse?this.reverseDepth![u]:this.forwardDepth[u]):this.g[u];return {node:u,g:Number.isFinite(value)&&value>=0?value:null,h:distance(this.maze,u),parent:reverse?this.reverseParent![u]:this.parent[u],order:this.order[u],count:this.counts[u],weight:this.maze.weights[u],metric:this.id==='bibfs'?1:0,side:reverse?1:0};}
}
