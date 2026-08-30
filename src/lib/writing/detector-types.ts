import type { CombinedResult } from "./detector-core";

export interface SegmentItem {
  start: number;
  end: number;
  raw: string;
  n: number;
  p: number;
  para: boolean;
  reasons: string[];
  chunkWords?: number;
  chunkIndex?: number;
  chunkParas?: number;
  chunkReliable?: boolean;
  chunkIsolated?: boolean;
}

export interface ParagraphReportRow {
  index: number;
  words: number;
  probability: number;
  category: "low" | "uncertain" | "high";
  reliable: boolean;
  merged: boolean;
  preview: string;
}

export interface DetectorResult {
  engine: "heuristic" | "local";
  items: SegmentItem[];
  total: number;
  segments: number;
  flagged: number;
  pct: number;
  docP: number;
  /** 4 metric bars — meaning differs by engine (see renderer). */
  perp: number;
  burst: number;
  pat: number;
  human: number;
  reliable: boolean;
  combined: CombinedResult;
  paragraphReport: ParagraphReportRow[];
  primarySignals: string[];
  limitations: string[];
  /** transformer-path only */
  perModel?: [number, number];
  windows?: number;
  /** heuristic-path only — raw chip values */
  cv?: number;
  msd?: number;
  mLen?: number;
  sLen?: number;
  surp?: number;
  commaMean?: number;
}
