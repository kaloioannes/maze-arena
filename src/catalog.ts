import type { Algorithm } from './types.ts';
const search = ['取出下一候选节点', '检查是否到达出口', '枚举可通行邻居', '更新代价与父节点', '把候选加入前沿'];
const walk = ['观察当前位置的通道', '根据规则选择下一步', '记录走过的通道', '移动并累计路程', '检查出口或循环'];
export const algorithms: Algorithm[] = [
  { id:'astar', name:'A* 搜索', en:'A-STAR', tag:'有方向的探索者', color:'#baf46a', group:'search', structure:'最小优先队列', optimal:'是 · 曼哈顿启发式', complete:'是', description:'用已经付出的代价 g 与到终点的估计 h 排序。f = g + h；四向移动、正权地形下保证最小代价。', code:search },
  { id:'bfs', name:'广度优先', en:'BREADTH FIRST', tag:'一层层，不放过', color:'#62cfff', group:'search', structure:'FIFO 队列', optimal:'等权时最少步数', complete:'是', description:'像涟漪一样逐层扩散。第一次找到的路线步数最少，但加权地图上未必代价最低。', code:search },
  { id:'dfs', name:'深度优先', en:'DEPTH FIRST', tag:'先走到底再说', color:'#be9aff', group:'search', structure:'LIFO 栈', optimal:'否', complete:'是', description:'沿一条分支深入，再返回其他分支。以图搜索方式记录访问，不会在环路中无限打转。', code:search },
  { id:'dijkstra', name:'Dijkstra', en:'UNIFORM COST', tag:'每一步都精打细算', color:'#ffc76b', group:'search', structure:'最小优先队列', optimal:'是 · 最小代价', complete:'是', description:'始终展开累计代价最低的候选。无需知道终点方向，适用于本实验室的全部正权地图。', code:search },
  { id:'greedy', name:'贪心最佳优先', en:'GREEDY', tag:'出口就在前面', color:'#ff8da9', group:'search', structure:'启发式优先队列', optimal:'否', complete:'是', description:'只看离终点的估计距离 h，忽略已经付出的代价。方向感很强，也容易被墙绕远。', code:search },
  { id:'wastar', name:'加权 A*', en:'WEIGHTED A*', tag:'激进一点，再激进一点', color:'#f9ec7b', group:'search', structure:'最小优先队列', optimal:'否 · 权重 2.5', complete:'是', description:'f = g + 2.5h。更重视终点方向，用路径质量换取可能更少的搜索。', code:search },
  { id:'bibfs', name:'双向 BFS', en:'BIDIRECTIONAL', tag:'我们在中间相遇', color:'#61e4cd', group:'search', structure:'两端 FIFO 队列', optimal:'等权时最少步数', complete:'是', description:'从起点和终点交替逐层扩散，两个完整搜索层相遇后拼接路线。加权时仍按步数搜索。', code:['从一侧队列取出节点', '检查两侧是否相遇', '展开这一侧的搜索层', '记录对应的父节点', '相遇后拼接两段路径'] },
  { id:'iddfs', name:'迭代加深 DFS', en:'ITERATIVE DEEPENING', tag:'再多走一层', color:'#9cb9ff', group:'search', structure:'限深 DFS 栈', optimal:'等权时最少步数', complete:'理论上是 · 有运行预算', description:'从深度 0 开始反复进行限深搜索。省前沿空间，但会重复探索；复杂环路可能很快耗尽运行预算。', code:['从当前深度上限出发', '深度优先检查下一节点', '只避免当前路径上的循环', '到达上限时回溯', '本轮结束：深度上限 +1'] },
  { id:'ida', name:'IDA*', en:'ITERATIVE A-STAR', tag:'用阈值慢慢逼近', color:'#e8a3f4', group:'search', structure:'f 阈值 DFS 栈', optimal:'是 · 完成时', complete:'理论上是 · 有运行预算', description:'以 f = g+h 的阈值控制深度优先搜索，下一轮取超限 f 的最小值。使用路径循环检测，重复搜索可能很昂贵。', code:['以 f 阈值开始 DFS', '计算当前 g + h', '超出阈值：记录下一阈值', '探索邻居或回溯', '提高阈值，重新出发'] },
  { id:'beam', name:'束搜索', en:'BEAM SEARCH', tag:'只留下 32 个希望', color:'#80d8b1', group:'search', structure:'逐层束 · 宽度 32', optimal:'否', complete:'否 · 会裁剪候选', description:'每层只保留 h 最小的 32 个节点，其他候选被永久丢弃。因此可能错过唯一通往出口的路线。', code:['取出当前层的节点', '检查是否到达出口', '生成下一层候选', '按估计距离排序', '保留前 32 个，裁剪其余'] },
  { id:'left', name:'左手法', en:'LEFT HAND', tag:'左墙是我的老朋友', color:'#ffb18b', group:'walker', structure:'朝向 + 局部通道', optimal:'否', complete:'有限条件 · 可陷入循环', description:'优先左转，其次直行、右转、掉头。只读取当前通道；起点朝东。若相同位置和朝向再次出现，判定循环。', code:walk },
  { id:'right', name:'右手法', en:'RIGHT HAND', tag:'我选择另一边', color:'#dfb16c', group:'walker', structure:'朝向 + 局部通道', optimal:'否', complete:'有限条件 · 可陷入循环', description:'优先右转，其次直行、左转、掉头。内部终点和带环地图不保证成功；检测重复的位置与朝向。', code:walk },
  { id:'tremaux', name:'Trémaux 标记法', en:'TRÉMAUX', tag:'每条通道都有记忆', color:'#d5c7ff', group:'walker', structure:'通道标记 + 回溯栈', optimal:'否', complete:'是 · 连通地图', description:'通道标记版深度优先行走。优先进入未访问位置，记录来路，遇到死路沿原通道真实走回，计入回头路。', code:walk },
  { id:'random', name:'随机游走', en:'RANDOM WALK', tag:'总有一天会到吧', color:'#f6a0cf', group:'walker', structure:'种子随机数', optimal:'否', complete:'无有限步保证', description:'每次等概率选择一条当前通道。可反复走回头路，达到运行预算就停止。使用独立且可复现的算法随机种子。', code:walk },
  { id:'straight', name:'头铁哥', en:'STRAIGHT AHEAD', tag:'能直走就绝不拐弯', color:'#ff7979', group:'fun', structure:'直行优先回溯栈', optimal:'否', complete:'是 · 连通地图', description:'原创行走策略：未访问通道中优先保持朝向，否则固定顺序转弯，没路就沿栈回退。直走的执念也有代价。', code:walk },
  { id:'curious', name:'好奇宝宝', en:'CURIOUS EXPLORER', tag:'没看过的地方最香', color:'#8be4f2', group:'fun', structure:'局部访问次数', optimal:'否', complete:'无有限步保证', description:'原创策略：选择访问次数最少的相邻格，平局时用种子随机数选择。只知道走过的地方，不偷看出口路线。', code:walk },
  { id:'roulette', name:'命运轮盘', en:'ROULETTE DFS', tag:'分岔路口交给宇宙', color:'#e5dd8c', group:'fun', structure:'随机回溯栈', optimal:'否', complete:'是 · 连通地图', description:'原创随机次序回溯行走：随机挑一个未访问的邻居，走错就真的走回来。与无记忆随机游走不同，最终能遍历连通地图。', code:walk },
];
export const byId = (id:string) => algorithms.find(a=>a.id===id)!;
export const generators = [
  {id:'backtracker',name:'递归回溯',note:'蜿蜒长廊'}, {id:'prim',name:'随机 Prim',note:'密集岔路'},
  {id:'kruskal',name:'随机 Kruskal',note:'均匀交织'}, {id:'wilson',name:'Wilson',note:'均匀生成树'},
  {id:'division',name:'递归分割',note:'几何秩序'}, {id:'sidewinder',name:'Sidewinder',note:'横向肌理'},
  {id:'binary',name:'二叉树',note:'东北偏好'},
];
