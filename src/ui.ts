export const icons:Record<string,string>={
  play:'M8 5l11 7-11 7z',pause:'M8 5v14M16 5v14',reset:'M4 11a8 8 0 1 1 2 6M4 4v7h7',step:'M6 5l10 7-10 7zM19 5v14',
  shuffle:'M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 3-2 5-5M14 8c1-1 2-2 4-2h3M17 2l4 4-4 4',
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',fit:'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  share:'M8 12l8-5M8 12l8 5M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  expand:'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5', sound:'M11 4L6 9H2v6h4l5 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
  muted:'M11 4L6 9H2v6h4l5 5zM16 9l6 6M22 9l-6 6',code:'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
  book:'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15',
  chevron:'M9 5l7 7-7 7',check:'M5 12l4 4L20 5',close:'M6 6l12 12M18 6L6 18',download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  settings:'M4 7h16M4 17h16M8 4v6M16 14v6',flag:'M5 21V3l14 2-4 6-10-1',bolt:'M13 2L4 14h7l-1 8 10-13h-7z',
  github:'M9 19c-4 1-4-2-6-2M15 22v-4c0-1-.3-2-1-2 4-.5 7-2 7-6 0-2-1-3-2-4 0-1 0-3-1-3-2 0-3 1-4 1a15 15 0 0 0-5 0C8 3 6 2 5 3c-1 1-1 2-1 3-1 1-2 2-2 4 0 4 3 6 7 6-.7.5-1 1-1 2v4',
};
export const icon=(name:string,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]??icons.bolt}"/></svg>`;
export const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const number=(v:number)=>v>=1000000?(v/1000000).toFixed(2)+'m':v>=10000?(v/1000).toFixed(1)+'k':Math.round(v).toLocaleString('en-US');
export const statusText:Record<string,string>={running:'探索中',solved:'已抵达',unreachable:'无可达路线',pruned:'候选已裁剪',loop:'陷入循环',budget:'达到步数预算',timeout:'超过时间预算',ready:'准备就绪'};
export function shell(){return `
<header class="header">
  <a class="brand" href="#" aria-label="Maze Arena 首页"><span class="brand-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M7 25V7h18v18H14V14h5" stroke="currentColor" stroke-width="2.5"/></svg></span><span>MAZE<span class="brand-light">ARENA</span><small>迷宫竞速实验室</small></span></a>
  <nav class="nav" aria-label="主导航"><button class="nav-item active" id="nav-arena">竞技场 <span>01</span></button><button class="nav-item" id="nav-atlas">算法图鉴 <span>17</span></button><button class="nav-item" id="nav-help">实验手册 ${icon('book')}</button></nav>
  <div class="header-actions"><span class="local-badge"><i></i> 全部运算，本地发生</span><a class="icon-button" id="source-link" href="https://github.com/kaloioannes/maze-arena" target="_blank" rel="noopener" title="查看公开源码" aria-label="查看公开源码">${icon('github')}</a><button id="share" class="quiet-button">${icon('share')} 分享实验</button></div>
</header>
<div class="intro"><div><span class="eyebrow">AN ALGORITHMIC PLAYGROUND</span><h1>每一种思考，都有自己的<span>出路。</span></h1><p>生成一座迷宫，让不同的算法，在同一场未知里竞速。</p></div><div class="edition"><span>EXPERIMENT NO.</span><strong id="experiment-no">042</strong><span>可复现 · 可观察 · 可较量</span></div></div>
<main class="lab-grid">
  <aside class="panel world-panel" aria-label="迷宫设置"><div class="panel-heading"><span><b class="index">01</b> 构造世界</span><button id="mobile-settings" class="icon-button" aria-label="折叠地图设置">${icon('settings')}</button></div>
    <div class="world-body"><label class="field-label" for="seed">世界种子 <span>SEED</span></label><div class="input-action"><input id="seed" value="ORBIT-042" maxlength="128" spellcheck="false" aria-label="世界种子"/><button id="random-seed" class="icon-button" title="随机种子" aria-label="随机种子">${icon('shuffle')}</button></div>
    <label class="field-label" for="generator">生成方式 <span>GENERATOR</span></label><select id="generator"></select><p class="field-note" id="generator-note">蜿蜒长廊，每次转弯都有新发现。</p>
    <div class="field-label">世界尺度 <span>DIMENSIONS</span></div><div id="size-presets" class="size-grid"><button data-size="12,8"><span>口袋</span><small>12 × 8</small></button><button data-size="48,32" class="selected"><span>标准</span><small>48 × 32</small></button><button data-size="96,64"><span>困难</span><small>96 × 64</small></button><button data-size="256,256"><span>噩梦</span><small>256²</small></button><button data-size="1024,1024" class="abyss"><span>深渊 ${icon('bolt')}</span><small>1,048,576 格</small></button></div>
    <div class="dimensions"><label><span>宽</span><input type="number" id="width" min="4" max="1024" value="48" aria-label="迷宫宽度"/></label><span>×</span><label><span>高</span><input type="number" id="height" min="4" max="1024" value="32" aria-label="迷宫高度"/></label></div>
    <label class="field-label" for="loops">环路密度 <output id="loops-value">8%</output></label><input type="range" id="loops" min="0" max="40" value="8"/><div class="range-labels"><span>唯一通路</span><span>四通八达</span></div>
    <label class="toggle-row"><span>开放房间<small>为探索留一点呼吸感</small></span><input id="rooms" type="checkbox" role="switch"/><i></i></label>
    <label class="toggle-row"><span>加权地形<small>金色地块，需要更多代价</small></span><input id="weighted" type="checkbox" role="switch"/><i></i></label>
    <button id="generate" class="generate-button">${icon('shuffle')} 生成新世界 <span>↗</span></button><button id="cancel-generate" class="text-button hidden">取消生成</button><div class="generation-note" id="generation-note"><i></i> 同一种子，相同世界</div></div>
    <div class="world-footer"><span class="tiny-maze">⌘</span><p>墙的另一边，<br/>也许是另一种思路。</p><span>↳</span></div>
  </aside>
  <section class="arena-column" aria-label="算法竞技场">
    <div class="arena-toolbar"><div class="mode-switch" role="group" aria-label="观察模式"><button data-mode="single">独奏</button><button data-mode="compare">对照</button><button data-mode="race" class="active">竞速 <span>●</span></button></div><span id="map-label" class="mono map-label">48 × 32 / 1,536 CELLS</span><button id="fullscreen" class="icon-button" title="全屏竞技场" aria-label="全屏竞技场">${icon('expand')}</button></div>
    <div id="stage" class="stage"><div class="stage-top"><span class="live-tag" id="live-tag"><i></i> READY TO EXPLORE</span><span class="stage-seed" id="stage-seed">SEED / ORBIT-042</span></div><div id="canvases" class="canvases"></div><div class="stage-empty hidden" id="stage-loading"><span class="loader"></span><strong>正在构造世界</strong><span id="generation-progress">连接通道 · 0%</span></div>
      <div id="countdown" class="countdown hidden"></div><div class="stage-hint" id="stage-hint">拖动平移 · 滚轮缩放 · 点击探查</div>
      <div class="canvas-tools"><button id="zoom-out" class="icon-button" aria-label="缩小" title="缩小">${icon('minus')}</button><span id="zoom-label">100%</span><button id="zoom-in" class="icon-button" aria-label="放大" title="放大">${icon('plus')}</button><span class="tool-divider"></span><button id="fit" class="icon-button" aria-label="适应画布" title="适应画布">${icon('fit')}</button><button id="place-start" class="icon-button marker-tool" aria-label="放置起点" title="点击后在地图上放置起点">S</button><button id="place-goal" class="icon-button marker-tool" aria-label="放置终点" title="点击后在地图上放置终点">E</button><button id="export" class="icon-button" aria-label="导出画布图片" title="导出画布图片">${icon('download')}</button></div>
    </div>
    <div class="playback"><div class="playback-buttons"><button id="run" class="run-button">${icon('play')}<span>开始竞速</span></button><button id="step" class="icon-button" title="单步执行（→）" aria-label="单步执行">${icon('step')}</button><button id="reset" class="icon-button" title="重置算法（R）" aria-label="重置算法">${icon('reset')}</button></div><div class="speed-control"><span>节奏</span><input id="speed" type="range" min="0" max="100" value="48" aria-label="探索速度"/><output id="speed-label">480 步/s</output></div><button id="sound" class="icon-button" aria-pressed="false" title="开启音效" aria-label="开启音效">${icon('muted')}</button></div>
    <div class="telemetry"><div><span>已探索 · FOCUSED</span><strong id="stat-visited">0<small> / 1,536</small></strong></div><div><span>逻辑步数</span><strong id="stat-steps">0</strong></div><div><span>计算用时 <i title="仅统计 worker 内算法推进时间；不是严格基准成绩">ⓘ</i></span><strong id="stat-ms">0.00<small> ms</small></strong></div><div><span>路线代价</span><strong id="stat-cost">—</strong></div></div>
    <div class="arena-caption"><span><i class="legend-dot frontier"></i> 搜索前沿 <i class="legend-dot explored"></i> 已探索 <i class="legend-dot path"></i> 最终路径</span><button class="text-button" id="benchmark">${icon('bolt')} 性能实验室 ${icon('chevron')}</button></div>
    <div id="result-banner" class="result-banner hidden" aria-live="polite"></div>
  </section>
  <aside class="right-column">
    <section class="panel roster-panel"><div class="panel-heading"><span><b class="index">02</b> 出场选手 <small id="roster-count">03</small></span><button id="choose-algorithms" class="icon-button" aria-label="选择算法" title="选择算法">${icon('plus')}</button></div><div id="roster" class="roster"></div><div class="race-note" id="race-note">同图 · 同起点 · 同逻辑节奏</div></section>
    <section class="panel cockpit"><div class="panel-heading"><span><b class="index">03</b> 算法驾驶舱</span><span class="signal"><i></i><i></i><i></i></span></div><div class="cockpit-title"><span id="cockpit-name">A* 搜索</span><span class="mono">LIVE INTERNALS</span></div><div class="cockpit-tabs" role="group" aria-label="技术面板"><button data-tech="flow" class="active">执行流</button><button data-tech="queue">候选前沿</button><button data-tech="cell">节点探针</button></div><div id="tech-content" class="tech-content"></div><div class="queue-chart"><div><span>前沿负载</span><span class="mono" id="frontier-label">0 NODES</span></div><svg id="sparkline" viewBox="0 0 260 42" preserveAspectRatio="none" aria-label="前沿大小变化曲线"><path d="M0 40H260"/></svg></div><div id="event-log" class="event-log"><span class="mono">00:00</span><span>引擎已就绪，等待出发。</span></div></section>
  </aside>
</main>
<footer class="footer"><span>MAZE ARENA <i>/</i> FOLLOW YOUR CURIOSITY.</span><span><kbd>SPACE</kbd> 播放 / 暂停 <kbd>→</kbd> 单步 <kbd>R</kbd> 重置</span><label><input type="checkbox" id="reduce-motion"/> 减少动态效果</label><button id="footer-help" class="text-button">实验手册 ↗</button><span>v1.0</span></footer>
<div class="toast hidden" id="toast" role="status"></div>
<dialog id="modal" class="modal"><div id="modal-content"></div></dialog>
`;}
