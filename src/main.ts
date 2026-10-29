import './style.css';
import { algorithms, byId, generators } from './catalog.ts';
import { shell, icon, escape, number, statusText } from './ui.ts';
import { Renderer } from './render.ts';
import type { Lane, Maze, MapOptions, Snapshot, BenchmarkRow } from './types.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=shell();
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
const modal=$<HTMLDialogElement>('modal');
let maze:Maze|null=null,renderer:Renderer|null=null,lanes:Lane[]=[],selected=['astar','bfs','dfs'],focus='astar';
let mode='race',tech='flow',running=false,generating=false,ready=false,benchmarking=false;
let genWorker:Worker|null=null,benchWorker:Worker|null=null,placement='',inspected:Record<string,number|null>|null=null;
let speed=480,lastFrame=performance.now(),lastUI=0,accumulator=0,countdownToken=0,finishNotified=false;
let sound=false,audio:AudioContext|null=null,toastTimer=0,elapsed=0,benchmarkRows:BenchmarkRow[]=[],benchmarkConfig='';
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let pendingEndpoints:{start:number;goal:number}|null=null;
let initial=true;
const worker=()=>new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});

function toast(message:string){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.add('hidden'),4000);}
function beep(win=false){if(!sound)return;try{audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(win?660:330,audio.currentTime);o.frequency.exponentialRampToValueAtTime(win?990:440,audio.currentTime+.13);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.22);}catch{sound=false;}}
function settings():MapOptions{
  const width=Number(input('width').value),height=Number(input('height').value);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<4||width>1024||height>1024)throw new Error('宽和高都需要是 4–1024 之间的整数。');
  return {width,height,seed:input('seed').value.trim()||'MAZE',generator:$<HTMLSelectElement>('generator').value,loops:Number(input('loops').value),rooms:input('rooms').checked,weighted:input('weighted').checked};
}
function setOptions(o:Partial<MapOptions>){for(const key of ['width','height','seed','loops'] as const)if(o[key]!==undefined)input(key).value=String(o[key]);if(o.generator)$<HTMLSelectElement>('generator').value=o.generator;for(const key of ['rooms','weighted'] as const)if(o[key]!==undefined)input(key).checked=!!o[key];$('loops-value').textContent=input('loops').value+'%';updatePreset();generatorNote();}
function generatorNote(){const notes:Record<string,string>={backtracker:'蜿蜒长廊，每次转弯都有新发现。',prim:'从一个点向外生长，岔路密集而细碎。',kruskal:'随机连接森林，让孤岛成为同一个世界。',wilson:'擦除随机游走中的环，得到均匀生成树。大图可能较慢。',division:'先有开放空间，再用墙切出几何秩序。',sidewinder:'向东延伸，再选择一条通道向北连接。',binary:'每一格选择向北或向东，形成方向鲜明的肌理。'};$('generator-note').textContent=notes[$<HTMLSelectElement>('generator').value]??'';}
function updatePreset(){document.querySelectorAll<HTMLElement>('[data-size]').forEach(el=>el.classList.toggle('selected',el.dataset.size===`${input('width').value},${input('height').value}`));}
function stopCountdown(){countdownToken++;$('countdown').classList.add('hidden');}
function clearLanes(){for(const lane of lanes)lane.worker.terminate();lanes=[];ready=false;}
function setRunning(value:boolean){running=value;if(!value)accumulator=0;updatePlayback();}
function updatePlayback(){const disabled=!ready||generating||benchmarking;
  $<HTMLButtonElement>('run').disabled=disabled;$<HTMLButtonElement>('step').disabled=disabled;
  $('run').innerHTML=icon(running?'pause':'play')+`<span>${running?'暂停探索':lanes.length&&lanes.every(l=>l.snapshot&&l.snapshot.status!=='running')?'再次出发':mode==='race'?'开始竞速':'开始探索'}</span>`;
  const tag=$('live-tag');tag.classList.toggle('running',running);tag.innerHTML=`<i></i> ${generating?'BUILDING WORLD':benchmarking?'BENCHMARKING':running?'EXPLORATION LIVE':lanes.some(l=>l.snapshot?.steps)?'EXPERIMENT PAUSED':'READY TO EXPLORE'}`;
}
function initializeLanes(){
  if(!maze||!renderer)return;stopCountdown();setRunning(false);clearLanes();elapsed=0;finishNotified=false;inspected=null;$('result-banner').classList.add('hidden');
  const map=maze,r=renderer;
  lanes=selected.map(id=>{
    const w=worker();const lane:Lane={id,worker:w,snapshot:null,pending:false,states:new Uint8Array(map.cells.length),layer:r.surface(),pathLayer:r.surface(),history:[],pathAt:0,doneAt:0,initialized:false,sparks:[]};
    w.onmessage=(e:MessageEvent)=>{
      if(e.data.type==='error'){lane.pending=false;setRunning(false);toast(`${byId(id).name}：${e.data.message}`);return;}
      if(e.data.type==='inspect'){if(focus===id){inspected=e.data.result;tech='cell';updateTechTabs();updateTech();}return;}
      if(e.data.type==='ready'||e.data.type==='tick'){
        const snap=e.data.snapshot as Snapshot;lane.snapshot=snap;lane.pending=false;lane.initialized=true;r.apply(lane,snap.changes);lane.history.push(snap.frontier);if(lane.history.length>90)lane.history.shift();
        if(snap.status!=='running'&&!lane.doneAt){lane.doneAt=performance.now();if(snap.status==='solved')beep(true);}
        ready=lanes.every(l=>l.initialized);if(ready)updatePlayback();
        checkFinished();
      }
    };
    w.onerror=()=>{lane.pending=false;setRunning(false);toast('算法线程出现错误，请重置后重试。');};
    w.postMessage({type:'init',maze:map,id});return lane;
  });
  if(!selected.includes(focus))focus=selected[0];buildCanvases();buildRoster();updateTech();updateStats();updatePlayback();
}
function generateMap(){
  let options:MapOptions;try{options=settings();}catch(e){toast((e as Error).message);return;}
  if(benchmarking)cancelBenchmark();genWorker?.terminate();stopCountdown();setRunning(false);clearLanes();generating=true;benchmarkRows=[];
  $('stage-loading').classList.remove('hidden');$('generation-progress').textContent='连接通道 · 0%';$('cancel-generate').classList.remove('hidden');$('generation-note').textContent='正在生成 · 可随时取消';updatePlayback();
  const w=worker();genWorker=w;
  w.onmessage=(e:MessageEvent)=>{
    if(w!==genWorker)return;
    if(e.data.type==='progress')$('generation-progress').textContent=`连接通道 · ${Math.round(e.data.p*100)}%`;
    else if(e.data.type==='error'){endGeneration();toast(e.data.message);if(maze)initializeLanes();}
    else if(e.data.type==='map'){
      maze=e.data.maze;const m=maze!;
      if(pendingEndpoints){if(pendingEndpoints.start<m.cells.length&&pendingEndpoints.goal<m.cells.length&&pendingEndpoints.start!==pendingEndpoints.goal){m.start=pendingEndpoints.start;m.goal=pendingEndpoints.goal;}pendingEndpoints=null;}
      renderer=new Renderer(m);renderer.reduced=reduced;endGeneration();
      $('generation-note').innerHTML=`<i></i> ${number(m.cells.length)} 格 · ${Number(e.data.ms).toFixed(0)} ms 生成`;
      $('map-label').textContent=`${m.width} × ${m.height} / ${number(m.cells.length)} CELLS`;
      $('stage-seed').textContent='SEED / '+m.seed;$('experiment-no').textContent=(m.seed.match(/\d+/)?.[0]??'001').slice(-3).padStart(3,'0');
      initializeLanes();$('zoom-label').textContent='100%';initial=false;
    }
  };
  w.onerror=()=>{endGeneration();toast('地图生成线程未能完成，请重试或缩小尺寸。');if(maze)initializeLanes();};
  w.postMessage({type:'generate',options});
}
function endGeneration(){genWorker?.terminate();genWorker=null;generating=false;$('stage-loading').classList.add('hidden');$('cancel-generate').classList.add('hidden');updatePlayback();}
function buildCanvases(){
  const host=$('canvases');host.classList.toggle('compare',mode==='compare');host.innerHTML='';
  const show=mode==='compare'?lanes:[lanes.find(l=>l.id===focus)??lanes[0]];
  host.style.gridTemplateRows=show.length>2?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)';
  for(const lane of show){if(!lane)continue;const wrap=document.createElement('div');wrap.className='canvas-wrap';const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${byId(lane.id).name} 的迷宫探索画布`);canvas.dataset.lane=lane.id;wrap.append(canvas);
    if(mode==='compare'){const label=document.createElement('span');label.className='canvas-label';label.style.setProperty('--lane',byId(lane.id).color);label.innerHTML=`${escape(byId(lane.id).name)} <small>${byId(lane.id).en}</small>`;wrap.append(label);}
    host.append(wrap);bindCanvas(canvas);
  }
}
function bindCanvas(canvas:HTMLCanvasElement){
  let dragging=false,moved=false,x=0,y=0,startX=0,startY=0,dragEndpoint='';
  canvas.addEventListener('pointerdown',e=>{if(!renderer||!maze||generating||benchmarking)return;const rect=canvas.getBoundingClientRect();const u=renderer.hit(canvas,e.clientX-rect.left,e.clientY-rect.top);dragEndpoint=u===maze.start?'start':u===maze.goal?'goal':'';dragging=true;moved=false;x=startX=e.clientX;y=startY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging||!renderer)return;if(Math.hypot(e.clientX-startX,e.clientY-startY)>4)moved=true;if(!dragEndpoint&&!placement){const t=renderer.transform(canvas);renderer.panX+=(e.clientX-x)/t.scale;renderer.panY+=(e.clientY-y)/t.scale;}x=e.clientX;y=e.clientY;});
  canvas.addEventListener('pointerup',e=>{if(!dragging||!renderer||!maze)return;dragging=false;const rect=canvas.getBoundingClientRect(),u=renderer.hit(canvas,e.clientX-rect.left,e.clientY-rect.top);
    if(u<0){dragEndpoint='';return;}
    if(placement||dragEndpoint&&moved){setEndpoint(placement||dragEndpoint,u);dragEndpoint='';return;}
    dragEndpoint='';if(!moved){const lane=lanes.find(l=>l.id===(mode==='compare'?canvas.dataset.lane:focus));if(lane){setFocus(lane.id,false);lane.worker.postMessage({type:'inspect',node:u});}}
  });
  canvas.addEventListener('pointercancel',()=>{dragging=false;dragEndpoint='';});
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(!renderer)return;const rect=canvas.getBoundingClientRect(),t=renderer.transform(canvas),old=renderer.zoom,next=Math.min(64,Math.max(.6,old*Math.exp(-e.deltaY*.0015)));const px=e.clientX-rect.left-t.w/2,py=e.clientY-rect.top-t.h/2;renderer.panX+=px/t.scale*(old/next-1);renderer.panY+=py/t.scale*(old/next-1);renderer.zoom=next;updateZoom();},{passive:false});
}
function setEndpoint(which:string,u:number){if(!maze||generating||benchmarking)return;if(u===(which==='start'?maze.goal:maze.start)){toast('起点与终点需要放在不同的格子。');return;}if(which==='start')maze.start=u;else maze.goal=u;placement='';document.querySelectorAll('.marker-tool').forEach(el=>el.classList.remove('active'));$('stage-hint').textContent='拖动平移 · 滚轮缩放 · 点击探查';benchmarkRows=[];initializeLanes();toast(`${which==='start'?'起点':'终点'}已移动，算法已重置。`);}
function buildRoster(){
  $('roster-count').textContent=String(selected.length).padStart(2,'0');
  $('roster').innerHTML=selected.map(id=>{const a=byId(id);return `<button class="roster-card ${id===focus?'focused':''}" data-focus="${id}" style="--lane:${a.color}"><div class="roster-top"><i class="algo-swatch"></i><span class="roster-name">${a.name}</span><span class="roster-tag" data-rank="${id}">${a.group==='search'?'GLOBAL':'LOCAL'}</span></div><div class="roster-desc">${a.tag}</div><div class="roster-bottom"><span data-count="${id}">0 / ${number(maze?.cells.length??0)}</span><em data-status="${id}">准备就绪</em></div><div class="roster-progress"><i data-progress="${id}"></i></div></button>`;}).join('');
  $('roster').querySelectorAll<HTMLElement>('[data-focus]').forEach(el=>el.onclick=()=>setFocus(el.dataset.focus!));
  const groups=new Set(selected.map(id=>byId(id).group==='search'?'global':'local'));
  $('race-note').textContent=groups.size>1?'全图搜索 / 局部行走 · 分组比较，不混排':'同图 · 同起点 · 同逻辑节奏';
}
function setFocus(id:string,rebuild=true){if(mode==='single'){setRunning(false);finishNotified=false;}focus=id;inspected=null;document.querySelectorAll<HTMLElement>('[data-focus]').forEach(el=>el.classList.toggle('focused',el.dataset.focus===id));if(rebuild&&mode==='single')buildCanvases();updateStats();updateTech();checkFinished();}
function updateStats(){
  const lane=lanes.find(l=>l.id===focus),s=lane?.snapshot,n=maze?.cells.length??0;
  $('stat-visited').innerHTML=`${number(s?.visited??0)}<small> / ${number(n)}</small>`;$('stat-steps').textContent=number(s?.steps??0);$('stat-ms').innerHTML=`${(s?.computeMs??0).toFixed(2)}<small> ms</small>`;$('stat-cost').textContent=s?.status==='solved'?number(s.cost):'—';
  const ranked=(group:string)=>lanes.filter(l=>(byId(l.id).group==='search'?'global':'local')===group&&l.snapshot?.status==='solved').sort((a,b)=>a.snapshot!.steps-b.snapshot!.steps);
  for(const lane of lanes){const snap=lane.snapshot;const card=$('roster').querySelector<HTMLElement>(`[data-focus="${lane.id}"]`);if(!card)continue;card.classList.toggle('solved',snap?.status==='solved');card.querySelector<HTMLElement>('[data-count]')!.textContent=`${number(snap?.visited??0)} / ${number(n)}`;card.querySelector<HTMLElement>('[data-status]')!.textContent=snap?.steps?(statusText[snap.status]??snap.status):'准备就绪';card.querySelector<HTMLElement>('[data-progress]')!.style.width=`${(snap?.visited??0)/Math.max(1,n)*100}%`;
    const group=byId(lane.id).group==='search'?'global':'local',rank=ranked(group).findIndex(l=>l.id===lane.id);card.querySelector<HTMLElement>('[data-rank]')!.textContent=rank>=0?`#${rank+1} · ${number(snap!.steps)} STEPS`:group==='global'?'GLOBAL':'LOCAL';
  }
}
function updateTechTabs(){document.querySelectorAll<HTMLElement>('[data-tech]').forEach(el=>el.classList.toggle('active',el.dataset.tech===tech));}
function updateTech(){
  const a=byId(focus),lane=lanes.find(l=>l.id===focus),s=lane?.snapshot,m=maze;if(!a)return;$('cockpit-name').textContent=a.name;
  const coord=(u:number)=>m&&u>=0?`${u%m.width},${Math.floor(u/m.width)}`:'—';
  if(tech==='flow'){
    const vals=a.group==='search'&&['astar','wastar','greedy','dijkstra','ida'].includes(a.id)?[['g',s?.g??0],['h',s?.h??0],['f',s?.f??0]]:[['current',s?.current??-1],['frontier',s?.frontier??0],['peak',s?.peak??0]];
    $('tech-content').innerHTML=`<div class="node-values">${vals.map(([label,v])=>`<div class="node-value"><span>${label}</span><strong>${v===-1?'—':number(Number(v))}</strong></div>`).join('')}</div><div class="code-lines">${a.code.map((line,i)=>`<div class="code-line ${s?.steps&&s.line===i?'active':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${escape(line)}</span></div>`).join('')}</div>`;
  }else if(tech==='queue'){
    $('tech-content').innerHTML=`<div class="queue-header"><span>#</span><span>NODE (X,Y)</span><span>${a.group==='search'?'PRIORITY':'VISITS'}</span></div>${s?.top.length?s.top.map((v,i)=>`<div class="queue-row"><span>${String(i+1).padStart(2,'0')}</span><span>(${coord(v.node)})</span><span>${Number(v.score.toFixed(1))}</span></div>`).join(''):`<p class="queue-empty">${escape(a.structure)}<br/>${s?.steps?'前沿已耗尽或本轮结束。':'开始探索后，这里会显示真实候选。'}</p>`}`;
  }else {
    const p=inspected;$('tech-content').innerHTML=p?`<p class="probe-heading">NODE (${coord(Number(p.node))})${p.metric?` · ${p.side?'终点侧':'起点侧'}`:''}</p><div class="probe-grid"><div>${p.metric?'本侧搜索深度':'累计代价 g'}<strong>${p.g===null?'未发现':number(Number(p.g))}</strong></div><div>曼哈顿距离 h<strong>${p.h}</strong></div><div>父节点 / 最近来路<strong>${coord(Number(p.parent))}</strong></div><div>首次访问序号<strong>${p.order||'未访问'}</strong></div><div>访问次数<strong>${p.count}</strong></div><div>地形代价<strong>${p.weight}</strong></div></div>`:`<p class="probe-empty">点击迷宫中的任意格子。<br/>查看这位选手记录的代价、来路与访问次数。<br/><br/>探针保存点击时的快照。</p>`;
  }
  $('frontier-label').textContent=`${number(s?.frontier??0)} NODES`;
  const history=lane?.history??[],max=Math.max(1,...history),points=history.map((v,i)=>`${i/Math.max(1,history.length-1)*260},${39-v/max*34}`);$('sparkline').innerHTML=`<path d="${points.length?'M'+points.join(' L'):'M0 39H260'}"/>`;
  $('event-log').innerHTML=`<span class="mono">${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}</span><span>${escape(s?.event??'引擎已就绪，等待出发。')}</span>`;
}
function checkFinished(){
  const active=activeLanes();if(!ready||!active.length||!active.every(l=>l.snapshot?.status!=='running')||finishNotified)return;
  if(active.every(l=>!l.snapshot?.steps))return;finishNotified=true;setRunning(false);updateStats();updateTech();
  const solved=active.filter(l=>l.snapshot?.status==='solved'),groups=new Set(active.map(l=>byId(l.id).group==='search'?'global':'local'));
  let text='本轮实验结束',detail='可以更换算法、调整地图，或者进入性能实验室。';
  if(mode==='single'&&solved.length){const l=solved[0];text=`${byId(l.id).name} 找到了出口`;detail=`探索 ${number(l.snapshot!.visited)} 格 · 路线 ${number(l.snapshot!.path.length-1)} 步 · 代价 ${number(l.snapshot!.cost)}`;}
  else if(solved.length&&groups.size===1){solved.sort((a,b)=>a.snapshot!.steps-b.snapshot!.steps);const winner=solved[0],ties=solved.filter(l=>l.snapshot!.steps===winner.snapshot!.steps);text=ties.length>1?`${ties.map(l=>byId(l.id).name).join(' / ')} 并列第一`:`${byId(winner.id).name} 赢得探索赛`;detail=`${number(winner.snapshot!.steps)} 个逻辑步 · ${solved.length}/${active.length} 位选手抵达 · 计算耗时请看性能实验室`;}
  else if(solved.length){text=`${solved.length} 位选手抵达出口`;detail='全图搜索与局部行走使用不同信息条件，成绩按组展示。';}
  else {text='本轮没有选手抵达出口';detail=active.map(l=>`${byId(l.id).name}：${statusText[l.snapshot!.status]}`).join(' · ');}
  $('result-banner').innerHTML=`<span>${solved.length?'↗':'⌁'}</span><div><strong>${escape(text)}</strong><small>${escape(detail)}</small></div>`;$('result-banner').classList.remove('hidden');$('live-tag').innerHTML='<i></i> EXPERIMENT COMPLETE';
}
function activeLanes(){return mode==='single'?lanes.filter(l=>l.id===focus):lanes;}
function tick(count:number){if(!ready||!maze||lanes.some(l=>l.pending))return;for(const lane of activeLanes())if(lane.snapshot?.status==='running'){lane.pending=true;lane.worker.postMessage({type:'tick',count});}}
async function start(){
  if(generating||benchmarking||!ready)return;
  if(running){setRunning(false);stopCountdown();return;}
  if(!$('countdown').classList.contains('hidden')){stopCountdown();return;}
  if(activeLanes().every(l=>l.snapshot?.status!=='running')){initializeLanes();await waitReady();}
  if(!activeLanes().some(l=>l.snapshot?.steps)&&mode==='race'&&!reduced){const token=++countdownToken;$('countdown').classList.remove('hidden');for(const n of ['3','2','1']){$('countdown').textContent=n;beep();await new Promise(r=>setTimeout(r,440));if(token!==countdownToken)return;}$('countdown').classList.add('hidden');}
  lastFrame=performance.now();setRunning(true);
}
async function waitReady(){for(let i=0;i<100&&!ready;i++)await new Promise(r=>setTimeout(r,20));}
function frame(now:number){const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
  if(running){elapsed+=dt;accumulator=Math.min(accumulator+speed*dt,speed*.15+1);if(!lanes.some(l=>l.pending)&&accumulator>=1){const count=Math.min(8192,Math.floor(accumulator));tick(count);accumulator-=count;}}
  if(renderer&&!generating){for(const lane of lanes)renderer.paintPath(lane);document.querySelectorAll<HTMLCanvasElement>('#canvases canvas').forEach(canvas=>{const show=mode==='race'?lanes:lanes.filter(l=>l.id===(mode==='single'?focus:canvas.dataset.lane));renderer!.draw(canvas,show,focus,now);});}
  if(now-lastUI>110){updateStats();updateTech();lastUI=now;}
  requestAnimationFrame(frame);
}
function updateZoom(){$('zoom-label').textContent=Math.round((renderer?.zoom??1)*100)+'%';}
function changeMode(next:string){stopCountdown();setRunning(false);mode=next;finishNotified=false;document.querySelectorAll<HTMLElement>('[data-mode]').forEach(el=>el.classList.toggle('active',el.dataset.mode===mode));buildCanvases();updatePlayback();checkFinished();}

// A share link contains versioned configuration, never generated maze data or personal data.
function shareConfig(){if(!maze)return '';const m=maze;return new URLSearchParams({v:'1',s:m.seed,w:String(m.width),h:String(m.height),g:m.generator,l:String(m.loops),r:m.rooms?'1':'0',t:m.weighted?'1':'0',a:selected.join(','),m:mode,start:String(m.start),end:String(m.goal)}).toString();}
function readShare(){try{const p=new URLSearchParams(location.hash.slice(1));if(!p.has('v'))return;if(p.get('v')!=='1'){toast('分享链接版本不受支持，已打开默认地图。');return;}const w=Number(p.get('w')),h=Number(p.get('h')),g=p.get('g')??'';if(!Number.isInteger(w)||!Number.isInteger(h)||w<4||w>1024||h<4||h>1024||!generators.some(x=>x.id===g))throw Error();const ids=[...new Set((p.get('a')??'astar,bfs,dfs').split(',').filter(id=>algorithms.some(a=>a.id===id)))].slice(0,4);if(ids.length){selected=ids;focus=ids[0];}mode=['single','compare','race'].includes(p.get('m')??'')?p.get('m')!:'race';setOptions({width:w,height:h,seed:(p.get('s')??'MAZE').slice(0,128),generator:g,loops:Math.max(0,Math.min(40,Number(p.get('l'))||0)),rooms:p.get('r')==='1',weighted:p.get('t')==='1'});const start=Number(p.get('start')),goal=Number(p.get('end'));if(Number.isInteger(start)&&Number.isInteger(goal)&&start>=0&&goal>=0)pendingEndpoints={start,goal};}catch{toast('分享链接的配置不完整，已使用默认地图。');}}

function openModal(content:string){$('modal-content').innerHTML=content;if(!modal.open)modal.showModal();$('modal-content').querySelectorAll<HTMLElement>('[data-close]').forEach(el=>el.onclick=()=>modal.close());}
const modalHead=(eyebrow:string,title:string,desc:string)=>`<div class="modal-header"><div><span class="modal-eyebrow">${eyebrow}</span><h2>${title}</h2><p>${desc}</p></div><button class="icon-button" data-close aria-label="关闭弹窗">${icon('close')}</button></div>`;
function openAlgorithms(atlas=false){
  let draft=[...selected],filter='all';
  openModal(modalHead('MEET THE MINDS',atlas?'17 种思路，17 种出路。':'挑选你的探路选手',atlas?'从数据结构到行走习惯，认识每位选手的能力与局限。':'最多选择 4 位。全图搜索与局部行走分组比较。')+`<div class="modal-body"><div class="modal-filters">${[['all','全部 17'],['search','全图搜索 10'],['walker','局部行走 4'],['fun','彩蛋选手 3']].map(([id,label])=>`<button class="filter-button ${id==='all'?'active':''}" data-filter="${id}">${label}</button>`).join('')}</div><div class="algorithm-grid" id="algorithm-grid"></div></div><div class="modal-footer"><span id="selection-count">已选 ${draft.length} / 4 位选手</span><button class="primary-button" id="apply-algorithms">让他们上场 ${icon('chevron')}</button></div>`);
  const paint=()=>{
    $('algorithm-grid').innerHTML=algorithms.filter(a=>filter==='all'||a.group===filter).map(a=>`<label class="algorithm-card" style="--lane:${a.color}"><div class="algorithm-card-top"><i class="algo-swatch"></i><strong>${a.name}</strong><input type="checkbox" value="${a.id}" ${draft.includes(a.id)?'checked':''} aria-label="选择${a.name}"/></div><div class="en">${a.en} / ${a.structure}</div><p>${a.description}</p><div class="algorithm-tags"><span>最优：${a.optimal}</span><span>完备：${a.complete}</span></div></label>`).join('');
    $('algorithm-grid').querySelectorAll<HTMLInputElement>('input').forEach(el=>el.onchange=()=>{if(el.checked&&draft.length>=4){el.checked=false;toast('最多同时比较 4 位选手。');return;}draft=el.checked?[...draft,el.value]:draft.filter(id=>id!==el.value);$('selection-count').textContent=`已选 ${draft.length} / 4 位选手`;});
  };paint();
  document.querySelectorAll<HTMLElement>('[data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter!;document.querySelectorAll<HTMLElement>('[data-filter]').forEach(b=>b.classList.toggle('active',b===el));paint();});
  $('apply-algorithms').onclick=()=>{if(!draft.length){toast('至少选择一位选手。');return;}if(benchmarking)cancelBenchmark();selected=draft;if(!selected.includes(focus))focus=selected[0];benchmarkRows=[];initializeLanes();modal.close();};
}
function openManual(){openModal(modalHead('FIELD NOTES','欢迎来到迷宫实验室','从一次好奇开始，观察不同思路如何穿越同一个世界。')+`<div class="modal-body manual">
<h3>01 / 造一张地图</h3><p>选种子、生成方式和尺寸，再点击「生成新世界」。地图支持 4–1024 的宽与高，最多 1,048,576 格。环路比例是每条剩余内部墙被打通的概率；0% 且关闭房间时为生成树迷宫。</p><p>加权地图的格子代价为 1–9，金色越深越昂贵。移动限于四个方向，进入格子时支付代价，起点不收费。所有生成地图都连通。</p>
<h3>02 / 看一场探索赛</h3><p>独奏只推进聚焦选手；对照与竞速同时推进全部选手。点击右侧选手切换驾驶舱；切换观察模式会暂停，不丢失进度。<kbd>SPACE</kbd> 播放 / 暂停，<kbd>→</kbd> 单步，<kbd>R</kbd> 重置。</p><p>画布可拖动和缩放，S / E 工具可重放起终点，也可直接拖动标记。点击普通格子读取节点探针；探针展示点击时的快照。修改种子、尺寸等设置后，需要点击生成才会应用。</p>
<div class="manual-callout">探索赛按「逻辑步」排名。图搜索通常一步展开一个节点，迭代搜索也计入回溯，行走策略一步实际移动一格；它们并非等量 CPU 操作。全图搜索和局部行走按信息条件分组，不混排。</div>
<h3>03 / 分清三个成绩</h3><p>探索格数是访问过的不同位置；逻辑步数包含算法的重复访问或回溯事件；路线代价是最终路径经过的地形代价之和。行走策略的路线保留全部回头路。</p><p>主界面计算用时只累计 Worker 内推进算法的时间，排除绘图与线程通信，但受分批执行与其他线程影响。严肃比较请使用「性能实验室」。候选前沿可能包含尚未弹出的过期优先队列项。</p>
<h3>04 / 性能实验室怎么测</h3><p>暂停视觉比赛后，在一个独立 Worker 中逐个测试选手。每个算法预热 1 次，再运行 3 次，报告中位数。测量算法推进，包括数据结构更新和探索事件写入，不包括地图生成、引擎初始化、绘图和消息传输。它衡量本项目实现的表现，不是算法理论速度的绝对排名。</p><p>普通探索有 25 万至 1000 万逻辑步的安全预算；性能试验最多 200 万步、每次约 1.8 秒。预算内未完成会明确标记，不计入成功排名。浏览器、设备和后台负载均会影响耗时。</p>
<h3>05 / 巨图与可复现性</h3><p>巨图用紧凑通道数据与按缩放级别绘制。整体视图显示探索热区，放大后显示墙体；绘图分辨率按尺寸调整。Wilson 的随机游走可能较慢，生成时可取消。分享链接保存 v1 生成规则、地图配置、选手、模式和起终点，不保存当前播放进度。</p><p>确定性算法与彩蛋使用固定邻居次序或独立种子；同版本、同配置的路线可复现。实际计算耗时不保证复现。</p>
<h3>06 / 算法与来源</h3><p>所有 17 个选项均真实运行。加权 A* 的权重固定为 2.5，束搜索宽度为 32。Trémaux 使用通道标记与回溯栈的局部 DFS 实现。图鉴标注理论性质；运行预算是实验室的额外限制。</p><p>参考：<a href="https://www.redblobgames.com/pathfinding/a-star/introduction.html" target="_blank" rel="noopener">Red Blob Games · 搜索算法</a>、<a href="https://weblog.jamisbuck.org/2011/2/7/maze-generation-algorithm-recap.html" target="_blank" rel="noopener">Jamis Buck · 迷宫生成</a>。本站无需账号，地图与算法都在浏览器运行。</p>
</div><div class="modal-footer"><span>FOLLOW YOUR CURIOSITY.</span><button class="primary-button" data-close>回到竞技场</button></div>`);}
function openBenchmark(){
  if(!maze||generating)return;stopCountdown();setRunning(false);
  openModal(modalHead('BEYOND THE ANIMATION','性能实验室','关掉动画的干扰，看看算法真正花了多少计算时间。')+`<div class="modal-body"><div id="bench-status" class="bench-status">${benchmarking?'<span class="loader"></span> 正在测量…':'同一地图 · 顺序执行 · 预热 1 次 + 正式 3 次'}</div><div id="bench-results"></div><p class="benchmark-note">测量本实现的算法推进（含事件记录），排除初始化、绘图及通信。每次限约 1.8 秒 / 最多 200 万逻辑步；未完成不参与成功排名。结果只代表当前设备与浏览器。</p></div><div class="modal-footer"><span id="bench-map" class="count-pill">${maze.width} × ${maze.height} · ${escape(maze.seed)}</span><div><button id="export-benchmark" class="secondary-button" ${benchmarkRows.length?'':'disabled'}>导出 JSON</button> <button id="run-benchmark" class="primary-button">${benchmarking?'停止测量':'运行基准测试'}</button></div></div>`);
  paintBenchmark();$('run-benchmark').onclick=()=>benchmarking?cancelBenchmark():runBenchmark();$('export-benchmark').onclick=()=>download(JSON.stringify({schema:1,configuration:benchmarkConfig,measurement:'1 warmup + 3 measured runs; engine advance only, includes event recording; initialization/rendering/IPC excluded; 1.8s and up to 2M events budget',userAgent:navigator.userAgent,rows:benchmarkRows},null,2),'maze-arena-benchmark.json','application/json');
}
function paintBenchmark(){const host=$('bench-results');if(!host)return;
  const groups=[['global','全图搜索 · 已知地图'],['local','局部行走 · 只读相邻通道']];
  host.innerHTML=benchmarkRows.length?`<table class="bench-table"><thead><tr><th>算法</th><th>中位数</th><th>逻辑步数</th><th>路线代价</th><th>结果</th></tr></thead><tbody>${groups.map(([key,title])=>{const rows=benchmarkRows.filter(r=>(byId(r.id).group==='search'?'global':'local')===key).sort((a,b)=>(a.status==='solved'?0:1)-(b.status==='solved'?0:1)||(Number.isFinite(a.median)?a.median:Infinity)-(Number.isFinite(b.median)?b.median:Infinity));return rows.length?`<tr class="group-row"><td colspan="5">${title}</td></tr>`+rows.map(r=>`<tr><td>${byId(r.id).name}<small>${r.samples.length} 次正式测量</small></td><td>${Number.isFinite(r.median)?r.median.toFixed(3)+' ms':'—'}</td><td>${number(r.steps)}</td><td>${r.status==='solved'?number(r.cost):'—'}</td><td class="${r.status==='solved'?'':'bad'}">${statusText[r.status]??r.status}</td></tr>`).join(''):'';}).join('')}</tbody></table>`:'';
}
function runBenchmark(){if(!maze||benchmarking)return;setRunning(false);benchmarkRows=[];benchmarkConfig=shareConfig();benchmarking=true;updatePlayback();$<HTMLButtonElement>('export-benchmark').disabled=true;$('run-benchmark').textContent='停止测量';$('bench-status').innerHTML='<span class="loader"></span> 独立线程启动 · 正在预热…';paintBenchmark();
  const w=worker();benchWorker=w;w.onmessage=e=>{if(w!==benchWorker)return;if(e.data.type==='benchmarkProgress'){if($('bench-status'))$('bench-status').innerHTML=`<span class="loader"></span> ${escape(byId(e.data.id).name)} · ${e.data.trial===1?'预热完成':`正式测量 ${e.data.trial-1}/3`} · 选手 ${e.data.index+1}/${e.data.total}`;}
    else if(e.data.type==='benchmarkDone'){benchmarkRows=e.data.rows;benchmarking=false;w.terminate();benchWorker=null;updatePlayback();if($('bench-results')){paintBenchmark();$('bench-status').textContent='测量完成 · 耗尽预算的选手已单独标记';$('run-benchmark').textContent='重新测量';$<HTMLButtonElement>('export-benchmark').disabled=false;}toast('性能测试完成。');}
    else if(e.data.type==='error'){cancelBenchmark();toast(e.data.message);}};
  w.onerror=()=>{cancelBenchmark();toast('性能线程出现错误，请重试。');};w.postMessage({type:'benchmark',maze,ids:selected});
}
function cancelBenchmark(){benchWorker?.terminate();benchWorker=null;benchmarking=false;updatePlayback();if($('run-benchmark')){$('run-benchmark').textContent='运行基准测试';$('bench-status').textContent='测量已停止。';} }
function download(content:string|Blob,name:string,type:string){const blob=typeof content==='string'?new Blob([content],{type}):content,url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}

$('generator').innerHTML=generators.map(g=>`<option value="${g.id}">${g.name} / ${g.note}</option>`).join('');
readShare();document.querySelectorAll<HTMLElement>('[data-mode]').forEach(el=>{el.classList.toggle('active',el.dataset.mode===mode);el.onclick=()=>changeMode(el.dataset.mode!);});
document.querySelectorAll<HTMLElement>('[data-size]').forEach(el=>el.onclick=()=>{const [width,height]=el.dataset.size!.split(',').map(Number);setOptions({width,height});});
['width','height'].forEach(id=>input(id).addEventListener('input',updatePreset));input('loops').oninput=()=>$('loops-value').textContent=input('loops').value+'%';$('generator').onchange=generatorNote;
$('generate').onclick=generateMap;$('cancel-generate').onclick=()=>{endGeneration();if(maze){initializeLanes();$('generation-note').textContent='已取消 · 保留上一张地图';}else $('generation-note').textContent='已取消 · 点击生成新世界重试';};
$('random-seed').onclick=()=>{const data=new Uint32Array(1);crypto.getRandomValues(data);input('seed').value='MAZE-'+data[0].toString(36).toUpperCase();};
$('run').onclick=()=>void start();$('step').onclick=()=>{stopCountdown();setRunning(false);tick(1);};$('reset').onclick=()=>{if(generating||benchmarking)return;initializeLanes();};
function updateSpeed(){speed=Math.round(10*Math.pow(5000,Number(input('speed').value)/100));$('speed-label').textContent=number(speed)+' 步/s';}
input('speed').oninput=updateSpeed;updateSpeed();
$('choose-algorithms').onclick=()=>openAlgorithms();$('nav-atlas').onclick=()=>openAlgorithms(true);$('nav-help').onclick=openManual;$('nav-arena').onclick=()=>{$('stage').scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});};
document.querySelectorAll<HTMLElement>('[data-tech]').forEach(el=>el.onclick=()=>{tech=el.dataset.tech!;updateTechTabs();updateTech();});
$('zoom-in').onclick=()=>{if(renderer)renderer.zoom=Math.min(64,renderer.zoom*1.4);updateZoom();};$('zoom-out').onclick=()=>{if(renderer)renderer.zoom=Math.max(.6,renderer.zoom/1.4);updateZoom();};$('fit').onclick=()=>{if(renderer){renderer.zoom=1;renderer.panX=renderer.panY=0;}updateZoom();};
for(const [id,which] of [['place-start','start'],['place-goal','goal']])$(id).onclick=()=>{if(generating||benchmarking)return;placement=placement===which?'':which;document.querySelectorAll<HTMLElement>('.marker-tool').forEach(el=>el.classList.toggle('active',el.id===(placement==='start'?'place-start':placement==='goal'?'place-goal':'')));$('stage-hint').textContent=placement?`点击地图放置${placement==='start'?'起点 S':'终点 E'}`:'拖动平移 · 滚轮缩放 · 点击探查';};
$('sound').onclick=()=>{sound=!sound;$('sound').innerHTML=icon(sound?'sound':'muted');$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('sound').title=sound?'关闭音效':'开启音效';if(sound)beep();};
input('reduce-motion').checked=reduced;document.body.classList.toggle('reduced',reduced);input('reduce-motion').onchange=()=>{reduced=input('reduce-motion').checked;document.body.classList.toggle('reduced',reduced);if(renderer)renderer.reduced=reduced;};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{toast('当前浏览器不支持全屏，可使用浏览器的全屏功能。');}};
$('mobile-settings').onclick=()=>$('mobile-settings').closest('.world-panel')!.classList.toggle('expanded');
$('export').onclick=()=>{const canvases=[...document.querySelectorAll<HTMLCanvasElement>('#canvases canvas')];if(!canvases.length||!maze||!renderer)return;const out=document.createElement('canvas'),cols=mode==='compare'?2:1,rows=Math.ceil(canvases.length/cols);out.width=canvases[0].width*cols;out.height=canvases[0].height*rows;const ctx=out.getContext('2d')!;ctx.fillStyle='#0d1612';ctx.fillRect(0,0,out.width,out.height);canvases.forEach((c,i)=>ctx.drawImage(c,i%cols*c.width,Math.floor(i/cols)*c.height));out.toBlob(blob=>{if(blob)download(blob,`maze-arena-${maze!.width}x${maze!.height}.png`,'image/png');});};
$('share').onclick=async()=>{if(!maze||generating)return;const url=new URL(location.href);url.hash=shareConfig();history.replaceState(null,'',url);try{await navigator.clipboard.writeText(url.href);toast('实验链接已复制，打开即可复现地图与选手。');}catch{openModal(modalHead('REPRODUCE THE EXPERIMENT','分享这个世界','复制下方链接，即可复现地图配置。')+`<div class="modal-body"><input id="share-url" aria-label="分享链接" readonly value="${escape(url.href)}"/></div>`);input('share-url').select();}};
$('benchmark').onclick=openBenchmark;
$('footer-help').onclick=openManual;
document.querySelector<HTMLAnchorElement>('.brand')!.onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:reduced?'instant':'smooth'});};
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
document.addEventListener('keydown',e=>{const tag=(e.target as HTMLElement).tagName;if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(tag)||modal.open||e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'){e.preventDefault();void start();}else if(e.key==='ArrowRight'){e.preventDefault();if(!benchmarking&&!generating){stopCountdown();setRunning(false);tick(1);}}else if(e.key.toLowerCase()==='r'&&!generating&&!benchmarking)initializeLanes();});
window.addEventListener('hashchange',()=>{if(initial)return;readShare();generateMap();});
window.addEventListener('beforeunload',()=>{clearLanes();genWorker?.terminate();benchWorker?.terminate();});
generatorNote();generateMap();requestAnimationFrame(frame);
