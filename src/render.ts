import type { Lane, Maze } from './types.ts';
import { byId } from './catalog.ts';
export class Renderer {
  maze:Maze;cell:number;base:HTMLCanvasElement;zoom=1;panX=0;panY=0;reduced=false;
  constructor(maze:Maze){this.maze=maze;this.cell=Math.max(1,Math.min(18,Math.floor(1800/Math.max(maze.width,maze.height))));this.base=this.surface();this.drawBase();}
  surface(){const c=document.createElement('canvas');c.width=this.maze.width*this.cell;c.height=this.maze.height*this.cell;return c;}
  drawBase(){
    const {maze:m,cell:s}=this,c=this.base.getContext('2d')!;c.fillStyle='#15221e';c.fillRect(0,0,this.base.width,this.base.height);
    if(m.weighted)for(let u=0;u<m.cells.length;u++)if(m.weights[u]>1){c.fillStyle=`rgba(216,164,73,${.05+m.weights[u]*.023})`;c.fillRect((u%m.width)*s,Math.floor(u/m.width)*s,s,s);}
    if(s>=3){c.strokeStyle='#3a4d40';c.lineWidth=.8;c.beginPath();for(let u=0;u<m.cells.length;u++){const x=u%m.width*s,y=Math.floor(u/m.width)*s;if(!(m.cells[u]&1)){c.moveTo(x,y);c.lineTo(x+s,y);}if(!(m.cells[u]&8)){c.moveTo(x,y);c.lineTo(x,y+s);}}c.rect(0,0,this.base.width,this.base.height);c.stroke();}
  }
  apply(lane:Lane,changes:Uint32Array){const c=lane.layer.getContext('2d')!,s=this.cell,color=byId(lane.id).color,at=performance.now();for(const packed of changes){const u=Math.floor(packed/8),state=packed%8;lane.states[u]=state;const x=u%this.maze.width*s,y=Math.floor(u/this.maze.width)*s;c.clearRect(x,y,s,s);c.globalAlpha=state===1?.85:state===3?.1:state===4?.42:.32;c.fillStyle=state===4?'#53e5d3':color;c.fillRect(x,y,s,s);if(!this.reduced&&this.maze.cells.length<=65536&&(state===2||state===4))lane.sparks.push({node:u,at});}if(lane.sparks.length>65)lane.sparks=lane.sparks.slice(-65);c.globalAlpha=1;}
  paintPath(lane:Lane){const path=lane.snapshot?.path;if(!path?.length)return;const s=this.cell,c=lane.pathLayer.getContext('2d')!;
    const end=this.reduced?path.length:Math.min(path.length,lane.pathAt+Math.max(2,Math.min(10000,Math.ceil(path.length/70))));
    c.strokeStyle=byId(lane.id).color;c.lineWidth=Math.max(.65,s*.19);c.lineCap='round';c.lineJoin='round';c.beginPath();
    for(let i=Math.max(0,lane.pathAt-1);i<end;i++){const x=(path[i]%this.maze.width+.5)*s,y=(Math.floor(path[i]/this.maze.width)+.5)*s;if(i===Math.max(0,lane.pathAt-1))c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();lane.pathAt=end;
  }
  transform(canvas:HTMLCanvasElement){const w=canvas.clientWidth,h=canvas.clientHeight,fit=Math.min((w-64)/this.base.width,(h-86)/this.base.height),scale=Math.max(.001,fit)*this.zoom;return {w,h,scale,x:(w-this.base.width*scale)/2+this.panX*scale,y:(h-this.base.height*scale)/2+this.panY*scale};}
  hit(canvas:HTMLCanvasElement,x:number,y:number){const t=this.transform(canvas),xx=Math.floor(((x-t.x)/t.scale)/this.cell),yy=Math.floor(((y-t.y)/t.scale)/this.cell);return xx>=0&&xx<this.maze.width&&yy>=0&&yy<this.maze.height?yy*this.maze.width+xx:-1;}
  draw(canvas:HTMLCanvasElement,lanes:Lane[],focus:string,time:number){
    const t=this.transform(canvas),dpr=Math.min(devicePixelRatio||1,2),width=Math.round(t.w*dpr),height=Math.round(t.h*dpr);if(!width||!height)return;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const c=canvas.getContext('2d')!;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,t.w,t.h);c.save();c.translate(t.x,t.y);c.scale(t.scale,t.scale);c.imageSmoothingEnabled=false;c.drawImage(this.base,0,0);
    for(const lane of lanes){c.globalAlpha=lanes.length===1?1:lane.id===focus?.95:.55;c.drawImage(lane.layer,0,0);}
    c.globalAlpha=1;
    if(this.cell*t.scale>=5)this.detailWalls(c,t);
    for(const lane of lanes){c.globalAlpha=lane.id===focus||lanes.length===1?1:.8;if(this.maze.cells.length<=65536&&!this.reduced){c.shadowColor=byId(lane.id).color;c.shadowBlur=5/t.scale;}c.drawImage(lane.pathLayer,0,0);c.shadowBlur=0;}
    c.globalAlpha=1;
    if(!this.reduced)for(const lane of lanes){c.fillStyle=byId(lane.id).color;lane.sparks=lane.sparks.filter(p=>time-p.at<500);for(const p of lane.sparks){const age=(time-p.at)/500,x=(p.node%this.maze.width+.5)*this.cell,y=(Math.floor(p.node/this.maze.width)+.5)*this.cell;c.globalAlpha=(1-age)*.65;c.beginPath();c.arc(x+Math.sin(p.node*13)*age*8/t.scale,y-age*9/t.scale,Math.max(.2,(1-age)*1.6/t.scale),0,Math.PI*2);c.fill();}const age=(time-lane.doneAt)/1300;if(lane.doneAt&&lane.snapshot?.status==='solved'&&age>=0&&age<1){const u=this.maze.goal;c.strokeStyle=byId(lane.id).color;c.lineWidth=1.5/t.scale;c.globalAlpha=(1-age)*.65;c.beginPath();c.arc((u%this.maze.width+.5)*this.cell,(Math.floor(u/this.maze.width)+.5)*this.cell,(10+age*95)/t.scale,0,Math.PI*2);c.stroke();}}c.globalAlpha=1;
    for(const lane of lanes){const u=lane.snapshot?.current??-1;if(u<0)continue;const x=(u%this.maze.width+.5)*this.cell,y=(Math.floor(u/this.maze.width)+.5)*this.cell;c.fillStyle=byId(lane.id).color;c.shadowColor=byId(lane.id).color;c.shadowBlur=this.reduced?0:12/t.scale;c.beginPath();c.arc(x,y,Math.max(2.7/t.scale,this.cell*.26),0,Math.PI*2);c.fill();c.shadowBlur=0;}
    this.marker(c,this.maze.start,'S','#baf46a',t.scale,time);this.marker(c,this.maze.goal,'E','#f8c77e',t.scale,time);
    c.restore();
    if(this.zoom>1.3||this.maze.width>=256)this.minimap(c,t,lanes.find(l=>l.id===focus));
  }
  detailWalls(c:CanvasRenderingContext2D,t:ReturnType<Renderer['transform']>){const m=this.maze,s=this.cell,x0=Math.max(0,Math.floor(-t.x/t.scale/s)),y0=Math.max(0,Math.floor(-t.y/t.scale/s)),x1=Math.min(m.width,Math.ceil((t.w-t.x)/t.scale/s)),y1=Math.min(m.height,Math.ceil((t.h-t.y)/t.scale/s));c.strokeStyle='#415548';c.lineWidth=.85/t.scale;c.beginPath();for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const u=y*m.width+x,xx=x*s,yy=y*s;if(!(m.cells[u]&1)){c.moveTo(xx,yy);c.lineTo(xx+s,yy);}if(!(m.cells[u]&8)){c.moveTo(xx,yy);c.lineTo(xx,yy+s);}}c.rect(0,0,m.width*s,m.height*s);c.stroke();}
  marker(c:CanvasRenderingContext2D,u:number,label:string,color:string,scale:number,time:number){const s=this.cell,x=(u%this.maze.width+.5)*s,y=(Math.floor(u/this.maze.width)+.5)*s,r=Math.max(s*.38,7/scale);c.fillStyle='#102019';c.strokeStyle=color;c.lineWidth=1.3/scale;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=color;c.font=`700 ${Math.max(s*.45,8/scale)}px monospace`;c.textAlign='center';c.textBaseline='middle';c.fillText(label,x,y+.2/scale);if(!this.reduced){c.globalAlpha=.15+.1*Math.sin(time/700);c.beginPath();c.arc(x,y,r+4/scale,0,Math.PI*2);c.stroke();c.globalAlpha=1;}}
  minimap(c:CanvasRenderingContext2D,t:ReturnType<Renderer['transform']>,lane?:Lane){const w=100,h=Math.min(85,w*this.base.height/this.base.width),x=t.w-w-16,y=t.h-h-16;c.fillStyle='#0c1412dd';c.fillRect(x-5,y-5,w+10,h+10);c.drawImage(this.base,x,y,w,h);if(lane)c.drawImage(lane.layer,x,y,w,h);c.strokeStyle='#baf46a';c.lineWidth=.8;const rx=x+Math.max(0,-t.x/t.scale)/this.base.width*w,ry=y+Math.max(0,-t.y/t.scale)/this.base.height*h;c.strokeRect(rx,ry,Math.min(w,t.w/t.scale/this.base.width*w),Math.min(h,t.h/t.scale/this.base.height*h));}
}
