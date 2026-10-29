export interface MapOptions {
  width: number; height: number; seed: string; generator: string;
  loops: number; rooms: boolean; weighted: boolean;
}
export interface Maze extends MapOptions { cells: Uint8Array; weights: Uint8Array; start: number; goal: number; version: number }
export type AlgoGroup = 'search' | 'walker' | 'fun';
export interface Algorithm {
  id: string; name: string; en: string; tag: string; color: string;
  group: AlgoGroup; structure: string; optimal: string; complete: string;
  description: string; code: string[];
}
export interface Snapshot {
  id: string; steps: number; visited: number; frontier: number; peak: number;
  current: number; g: number; h: number; f: number; parent: number;
  computeMs: number; status: string; path: number[]; cost: number;
  line: number; event: string; top: { node: number; score: number }[];
  changes: Uint32Array; // node * 8 + state: frontier=1, explored=2, backtrack=3, reverse=4
}
export interface Lane {
  id: string; worker: Worker; snapshot: Snapshot | null; pending: boolean;
  states: Uint8Array; layer: HTMLCanvasElement; history: number[];
  pathAt: number; pathLayer: HTMLCanvasElement; doneAt: number; initialized: boolean;
  sparks: { node:number; at:number }[];
}
export interface BenchmarkRow {
  id: string; samples: number[]; median: number; steps: number;
  visited: number; cost: number; length: number; status: string;
}
