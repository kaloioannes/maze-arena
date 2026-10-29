import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, neighbors } from '../src/maze.ts';
import { Engine } from '../src/engine.ts';
import { algorithms, generators } from '../src/catalog.ts';
import type { Maze } from '../src/types.ts';

const map=(seed='test',weighted=false,loops=0,generator='backtracker',width=8,height=6)=>generate({seed,weighted,loops,generator,width,height,rooms:false});
function solve(m:Maze,id:string,limit=1000000){const e=new Engine(m,id,limit);while(e.status==='running'){e.advance(8192,Infinity);e.changes=[];}return e;}
function verifyPath(m:Maze,e:Engine){assert.equal(e.path[0],m.start);assert.equal(e.path.at(-1),m.goal);let cost=0;for(let i=1;i<e.path.length;i++){assert.ok(neighbors(m,e.path[i-1]).includes(e.path[i]),`illegal move ${e.id}`);cost+=m.weights[e.path[i]];}assert.equal(e.cost,cost);}
// Independent O(V²) shortest path oracle, intentionally unrelated to the production heap.
function oracle(m:Maze,weighted=true){const d=Array(m.cells.length).fill(Infinity),used=new Set<number>();d[m.start]=0;while(used.size<d.length){let u=-1;for(let i=0;i<d.length;i++)if(!used.has(i)&&(u<0||d[i]<d[u]))u=i;if(u<0||!Number.isFinite(d[u]))break;if(u===m.goal)return d[u];used.add(u);for(const v of neighbors(m,u))d[v]=Math.min(d[v],d[u]+(weighted?m.weights[v]:1));}return Infinity;}
for(const gen of generators)test(`${gen.name}: deterministic, connected, reciprocal, tree without post-processing`,()=>{
  const m=map('repro',false,0,gen.id,13,9),again=map('repro',false,0,gen.id,13,9);assert.deepEqual(m.cells,again.cells);assert.deepEqual(m.weights,again.weights);
  const seen=new Set([0]),queue=[0];let edgeCount=0;
  for(let u=0;u<m.cells.length;u++){for(const v of neighbors(m,u)){assert.ok(v>=0&&v<m.cells.length);assert.ok(neighbors(m,v).includes(u));assert.ok(Math.abs(u%m.width-v%m.width)+Math.abs(Math.floor(u/m.width)-Math.floor(v/m.width))===1);edgeCount++;}}
  for(let i=0;i<queue.length;i++)for(const v of neighbors(m,queue[i]))if(!seen.has(v)){seen.add(v);queue.push(v);}
  assert.equal(seen.size,m.cells.length);assert.equal(edgeCount/2,m.cells.length-1);
});
test('post-processing, costs and generation are seed-reproducible',()=>{const o={seed:'rooms',weighted:true,loops:30,generator:'prim',width:32,height:25,rooms:true},a=generate(o),b=generate(o);assert.deepEqual(a,b);assert.ok(a.weights.some(x=>x>1));assert.ok(a.cells.some(c=>c===15));assert.notDeepEqual(a.cells,generate({...o,seed:'other'}).cells);});
test('all 17 strategies execute real legal routes or explicit bounded outcomes',()=>{
  const m=map('all',false,0,'backtracker',4,4);
  for(const a of algorithms){const e=solve(m,a.id,100000);assert.notEqual(e.status,'running');if(e.status==='solved')verifyPath(m,e);if(['astar','bfs','dfs','dijkstra','wastar','greedy','bibfs','iddfs','ida','tremaux','straight','roulette'].includes(a.id))assert.equal(e.status,'solved',a.id);}
});
test('Dijkstra, A* and IDA* match independent weighted shortest-path oracle',()=>{
  for(let s=0;s<12;s++){const m=map(`weighted-${s}`,true,35,'prim',5,4);m.start=s%4;m.goal=m.cells.length-1-s%3;const expected=oracle(m);for(const id of ['dijkstra','astar','ida']){const e=solve(m,id);assert.equal(e.status,'solved',`${id} seed ${s}`);verifyPath(m,e);assert.equal(e.cost,expected,`${id} optimum`);}}
});
test('BFS and bidirectional BFS find minimum hops across loops and arbitrary endpoints',()=>{
  for(let s=0;s<60;s++){const m=map(`bidirectional-${s}`,true,40,generators[s%generators.length].id,9,7);m.start=(s*7)%m.cells.length;m.goal=(s*13+17)%m.cells.length;if(m.start===m.goal)m.goal=(m.goal+1)%m.cells.length;const expected=oracle(m,false);for(const id of ['bfs','bibfs']){const e=solve(m,id);assert.equal(e.status,'solved');verifyPath(m,e);assert.equal(e.path.length-1,expected,`${id} seed ${s}`);}}
});
test('random strategies reproduce their exact route',()=>{const m=map('randoms',true,25,'prim',7,5);for(const id of ['random','curious','roulette']){const a=solve(m,id,10000),b=solve(m,id,10000);assert.equal(a.steps,b.steps);assert.equal(a.status,b.status);assert.deepEqual(a.path,b.path);}});
test('unreachable goal terminates search honestly and budgets stop pathological walkers',()=>{
  const m=map();m.cells.fill(0);for(const id of ['bfs','dfs','dijkstra','astar','greedy','wastar','bibfs','beam','iddfs','ida','left','right','tremaux','random','straight','curious','roulette']){const e=solve(m,id,500);assert.notEqual(e.status,'solved');assert.notEqual(e.status,'running');}
  const e=solve(map('budget',false,35,'prim',12,8),'random',3);assert.equal(e.status,'budget');assert.equal(e.steps,3);
});
test('single-step, batched execution and telemetry agree',()=>{
  const m=map('batch',true,30),single=new Engine(m,'astar'),batch=solve(m,'astar');while(single.status==='running'){const before=single.steps;single.advance(1);assert.ok(single.steps-before<=1);single.changes=[];}assert.deepEqual(single.path,batch.path);assert.equal(single.steps,batch.steps);assert.equal(single.visited,batch.visited);const probe=single.inspect(m.goal);assert.equal(probe.g,batch.cost);assert.ok(probe.order>0);assert.ok(single.computeMs>=0);
});
test('invalid dimensions and generator identifiers are rejected',()=>{assert.throws(()=>map('bad',false,0,'prim',1025,4));assert.throws(()=>map('bad',false,0,'prim',4.5,4));assert.throws(()=>map('bad',false,0,'not-a-generator'));});
test('bidirectional probe works before start and records reverse-side depth and parent',()=>{
  const m=map('probe',true,20),e=new Engine(m,'bibfs');assert.equal(e.inspect(m.goal).g,null);
  for(let i=0;i<3&&e.status==='running';i++)e.advance(1);
  while(!e.reverseDepth&&e.status==='running')e.advance(1);
  assert.ok(e.reverseDepth);const p=e.inspect(m.goal);assert.equal(p.metric,1);assert.equal(p.g,0);assert.equal(p.side,1);assert.equal(p.parent,-1);
  const done=solve(m,'bibfs');assert.ok(done.reverseDepth!.some(d=>d>0));
  for(let u=0;u<m.cells.length;u++)if(done.inspect(u).side===1&&done.inspect(u).parent>=0){const q=done.inspect(u);assert.ok(neighbors(m,u).includes(q.parent));assert.equal(done.reverseDepth![q.parent]+1,q.g);}
});
