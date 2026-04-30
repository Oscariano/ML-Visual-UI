export type NodeKind = "data" | "prep" | "split" | "modelPrep" | "model" | "eval" | "deploy" | "assistant" | "impact";

export type ColumnProfile = {
  name: string;
  type: "numeric" | "categorical" | "text" | "date" | "boolean";
  missing: number;
  unique: number;
  sample: string[];
  role: "feature" | "target" | "id" | "date" | "drop";
};

export type DatasetProfile = {
  name: string;
  rows: number;
  columns: ColumnProfile[];
};

export type PipelineNode = {
  id: string;
  component: string;
  kind: NodeKind;
  x: number;
  y: number;
  status: string;
  summary: string;
  config: Record<string, string | number | boolean | string[]>;
};

export type PipelineEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  dtype: string;
  shape: string;
  detail: string;
};

export type AssistantAction =
  | { type: "switch_model"; model: string }
  | { type: "set_split"; testSize: number }
  | { type: "add_transform"; transform: string }
  | { type: "set_framework"; framework: "sklearn" | "pytorch" | "recommender" }
  | { type: "set_metric"; metric: string };

export type PipelineState = {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  selectedNodeId: string;
  dataset?: DatasetProfile;
  framework: "sklearn" | "pytorch" | "recommender";
  transforms: string[];
  code: string;
  assistantLog: string[];
  lastMessage: string;
};
