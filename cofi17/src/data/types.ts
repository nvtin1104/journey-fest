/** Schema of the Color Fiesta map API (only the fields this app reads). */
export interface MapNode {
  id: string;
  type: 'AREA' | 'BOOTH';
  refId?: string | null;
  areaTypeId?: number | null;
  label: string;
  description?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  boothSlot?: number | null;
  boothCode2?: string | null;
  hideLabel?: boolean | null;
}

export interface MapEdge {
  id: string;
  groupId?: string | null;
  source: string;
  target: string;
}

export interface MapGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface EventMapData {
  meta: { eventId: string; gridSize: number; version?: number; updatedAt?: string };
  nodes: MapNode[];
  edges: MapEdge[];
  groups: MapGroup[];
}
