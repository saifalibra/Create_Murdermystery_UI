export interface Logic {
  logic_id: string;
  name: string;
  color?: string | null;
}

/** ノードタイプ */
export type NodeType = "Evidence" | "Secret" | "Location" | "Character";

export interface GraphNode {
  node_id: string;
  node_type: NodeType;
  reference_id: string;
  event_id?: string | null;
  logic_details: Record<string, string>;
  logic_related_entities: Record<string, string[]>;
}

/** React Flow ノードの data プロパティの型 */
export interface GraphNodeData {
  label: string | React.ReactNode;
  node: GraphNode | null; // イベントグループ親ノードの場合は null
  color?: string;
  isEventGroup?: boolean;
  eventId?: string; // イベントグループ親ノードの場合のみ
  logicId?: string; // イベントグループ親ノードの場合のみ（(event_id, logic_id) の logic_id）
  parentId?: string; // イベントグループ子ノードの場合のみ
  logicName?: string;
}

export interface GraphEdge {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
}

/** 証拠（API用） */
export interface EvidenceItem {
  id: string;
  name: string;
  summary: string;
  detail: string;
  pointers?: { location_id?: string | null; character_id?: string | null };
}

/** 秘密（API用） */
export interface SecretItem {
  id: string;
  character_id: string;
  title?: string;
  description: string;
}

/** 場所（API用） */
export interface LocationItem {
  id: string;
  name: string;
}

/** 人物（API用） */
export interface CharacterItem {
  id: string;
  name: string;
}
