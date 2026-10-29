import { generate } from './maze.ts';
import { Engine } from './engine.ts';
import type { BenchmarkRow, Maze } from './types.ts';
let engine:Engine|null=null;
const send=(value:unknown,transfers:Transferable[]=[])=>self.postMessage(value,{transfer:transfers});
self.onmessage=(e:MessageEvent)=>{
  const msg=e.data;
  try {
    if(msg.type==='generate'){
      const t=performance.now(),maze=generate(msg.options,p=>send({type:'progress',p}));
      send({type:'map',maze,ms:performance.now()-t},[maze.cells.buffer,maze.weights.buffer]);
    }else if(msg.type==='init'){
      engine=new Engine(msg.maze,msg.id);send({type:'ready',snapshot:engine.snapshot()});
    }else if(msg.type==='tick'&&engine){
      const count=engine.advance(msg.count),snapshot=engine.snapshot();send({type:'tick',count,snapshot},[snapshot.changes.buffer]);
    }else if(msg.type==='inspect'&&engine)send({type:'inspect',result:engine.inspect(msg.node)});
    else if(msg.type==='benchmark')benchmark(msg.maze,msg.ids);
  }catch(err){send({type:'error',message:err instanceof Error?err.message:String(err)});}
};
function benchmark(maze:Maze,ids:string[]){
  const rows:BenchmarkRow[]=[];
  let index=0,trial=0,samples:number[]=[],last:Engine|null=null,start=0;
  const next=()=>{
    if(index>=ids.length){send({type:'benchmarkDone',rows});return;}
    const id=ids[index];
    if(!last){last=new Engine(maze,id,Math.max(250000,Math.min(maze.cells.length*40,2000000)));start=performance.now();}
    last.advance(8192,10);last.changes=[];
    if(last.status==='running'&&performance.now()-start<1800){setTimeout(next,0);return;}
    if(last.status==='running'){last.status='timeout';last.event='单次试验超过 1.8 秒预算';}
    if(trial>0)samples.push(last.computeMs);trial++;
    send({type:'benchmarkProgress',id,index,trial,total:ids.length});
    if(trial===4||last.status==='timeout'||last.status==='budget'){
      const ordered=[...samples].sort((a,b)=>a-b),median=ordered.length?ordered[Math.floor(ordered.length/2)]:NaN;
      rows.push({id,samples:[...samples],median,steps:last.steps,visited:last.visited,cost:last.cost,length:last.path.length?last.path.length-1:0,status:last.status});
      index++;trial=0;samples=[];
    }
    last=null;setTimeout(next,0);
  };next();
}
