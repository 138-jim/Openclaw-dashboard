import {
  COLS, ROWS, ROOM_W, ROOM_H, CORRIDOR,
  GRID_W, GRID_H, BREAK_ROOM_X,
  getDoorPos3D, getInsideDoorPos3D, getChairPos3D,
  hCorridorZ, vCorridorX,
} from './office-layout';

interface NavNode3D {
  id: string;
  x: number;
  z: number;
  neighbors: string[];
}

function nid(x: number, z: number): string {
  return `${Math.round(x * 10)},${Math.round(z * 10)}`;
}

function ensureNode(graph: Map<string, NavNode3D>, x: number, z: number): string {
  const id = nid(x, z);
  if (!graph.has(id)) {
    graph.set(id, { id, x, z, neighbors: [] });
  }
  return id;
}

function connect(graph: Map<string, NavNode3D>, a: string, b: string) {
  if (a === b) return;
  const na = graph.get(a);
  const nb = graph.get(b);
  if (!na || !nb) return;
  if (!na.neighbors.includes(b)) na.neighbors.push(b);
  if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
}

export function buildNavGraph3D(): Map<string, NavNode3D> {
  const graph = new Map<string, NavNode3D>();

  // 1. Create door nodes (exterior in corridor) and interior door nodes for every room
  // Connected: chair <-> insideDoor <-> door(corridor) <-> corridor network
  for (let i = 0; i < COLS * ROWS; i++) {
    const d = getDoorPos3D(i);        // in corridor
    const id = getInsideDoorPos3D(i);  // inside room
    const c = getChairPos3D(i);        // at desk
    const doorId = ensureNode(graph, d.x, d.z);
    const insideId = ensureNode(graph, id.x, id.z);
    const chairId = ensureNode(graph, c.x, c.z);
    // Chain: chair -> insideDoor -> door
    connect(graph, chairId, insideId);
    connect(graph, insideId, doorId);
  }

  // 2. Build horizontal corridor networks (between each pair of rows)
  for (let row = 0; row < ROWS - 1; row++) {
    const cz = hCorridorZ(row);
    const nodesOnThisCorridor: string[] = [];

    // Project each room's door onto this corridor
    for (let col = 0; col < COLS; col++) {
      // Room above (row r) — its door is at the bottom, corridor is just below
      const roomAbove = row * COLS + col;
      const doorAbove = getDoorPos3D(roomAbove);
      const projId = ensureNode(graph, doorAbove.x, cz);
      nodesOnThisCorridor.push(projId);
      connect(graph, nid(doorAbove.x, doorAbove.z), projId);

      // Room below (row r+1) — its door is also near this corridor
      const roomBelow = (row + 1) * COLS + col;
      const doorBelow = getDoorPos3D(roomBelow);
      // Door of room below is at its bottom (z = origin.z + ROOM_H)
      // But we need to connect it to the corridor ABOVE it
      // The door is at the TOP of the room below, which is near this corridor
      // Actually door is at bottom of each room. Room below's top = origin.z of roomBelow
      // The corridor is between the two rows. Room above door = near corridor.
      // Room below: its top edge is at row origin, door is at bottom.
      // We need a node at doorBelow.x on this corridor, then connect door to it.
      const projBelowId = ensureNode(graph, doorBelow.x, cz);
      if (!nodesOnThisCorridor.includes(projBelowId)) {
        nodesOnThisCorridor.push(projBelowId);
      }
      // Room below's door is far from this corridor — create intermediate node
      // at the top of roomBelow (origin.z) which is adjacent to the corridor
      const roomBelowOriginZ = Math.floor(roomBelow / COLS) * (ROOM_H + CORRIDOR);
      const topOfRoomBelow = ensureNode(graph, doorBelow.x, roomBelowOriginZ);
      connect(graph, projBelowId, topOfRoomBelow);
      connect(graph, topOfRoomBelow, nid(doorBelow.x, doorBelow.z));
    }

    // Add vertical corridor intersection nodes
    for (let col = 0; col < COLS - 1; col++) {
      const cx = vCorridorX(col);
      nodesOnThisCorridor.push(ensureNode(graph, cx, cz));
    }

    // Add break room corridor extension
    const breakExtId = ensureNode(graph, BREAK_ROOM_X, cz);
    nodesOnThisCorridor.push(breakExtId);
    // Connect rightmost vertical corridor to break room extension
    if (COLS > 1) {
      const rightVcX = vCorridorX(COLS - 2);
      connect(graph, nid(rightVcX, cz), breakExtId);
    }

    // Sort all nodes on this corridor by X and connect adjacent
    const uniqueIds = Array.from(new Set(nodesOnThisCorridor));
    const sorted = uniqueIds
      .map(id => graph.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      connect(graph, sorted[i].id, sorted[i + 1].id);
    }
  }

  // 3. Connect vertical corridors (between horizontal corridors)
  for (let col = 0; col < COLS - 1; col++) {
    const cx = vCorridorX(col);
    for (let row = 0; row < ROWS - 2; row++) {
      const z1 = hCorridorZ(row);
      const z2 = hCorridorZ(row + 1);
      connect(graph, nid(cx, z1), nid(cx, z2));
    }
  }

  // 4. Connect break room corridor vertically
  for (let row = 0; row < ROWS - 2; row++) {
    const z1 = hCorridorZ(row);
    const z2 = hCorridorZ(row + 1);
    connect(graph, nid(BREAK_ROOM_X, z1), nid(BREAK_ROOM_X, z2));
  }

  // 5. Break room interior — single entry node connected to all corridor levels
  const breakMidZ = GRID_H / 2;
  const breakEntryId = ensureNode(graph, BREAK_ROOM_X + 2, breakMidZ);
  // Connect to nearest corridor extension
  for (let row = 0; row < ROWS - 1; row++) {
    const cz = hCorridorZ(row);
    connect(graph, nid(BREAK_ROOM_X, cz), breakEntryId);
  }

  // 6. Break room interior — grid of nodes so agents inside can pathfind
  for (let bx = 1; bx <= 3; bx++) {
    for (let bz = 0; bz < ROWS - 1; bz++) {
      const nodeX = BREAK_ROOM_X + bx * 2;
      const nodeZ = 2 + bz * (GRID_H / (ROWS - 1));
      const id = ensureNode(graph, nodeX, nodeZ);
      connect(graph, id, breakEntryId);
      // Connect to neighboring break room nodes
      if (bx > 1) connect(graph, id, nid(BREAK_ROOM_X + (bx - 1) * 2, nodeZ));
      if (bz > 0) connect(graph, id, nid(nodeX, 2 + (bz - 1) * (GRID_H / (ROWS - 1))));
    }
  }

  // 7. Lobby area — grid of nodes connected to bottom corridor
  const lobbyZ = GRID_H + CORRIDOR;
  const lastCorridorZ = ROWS > 1 ? hCorridorZ(ROWS - 2) : hCorridorZ(0);

  // Create lobby nodes across the width
  for (let lx = 0; lx < 5; lx++) {
    const nodeX = 3 + lx * (GRID_W - 6) / 4;
    for (let lz = 0; lz < 3; lz++) {
      const nodeZ = lobbyZ + 1 + lz * 2;
      const id = ensureNode(graph, nodeX, nodeZ);
      // Connect to corridor above
      if (lz === 0) {
        const corridorNodeId = ensureNode(graph, nodeX, lastCorridorZ);
        connect(graph, id, corridorNodeId);
        // Also connect this corridor projection to nearest existing corridor node
        // by connecting along the corridor
        for (let col = 0; col < COLS - 1; col++) {
          const vcX = vCorridorX(col);
          if (Math.abs(vcX - nodeX) < ROOM_W) {
            connect(graph, corridorNodeId, nid(vcX, lastCorridorZ));
          }
        }
      }
      // Connect to neighboring lobby nodes
      if (lx > 0) connect(graph, id, nid(3 + (lx - 1) * (GRID_W - 6) / 4, nodeZ));
      if (lz > 0) connect(graph, id, nid(nodeX, lobbyZ + 1 + (lz - 1) * 2));
    }
  }

  // Lobby exit (south)
  const lobbyExitId = ensureNode(graph, GRID_W / 2, lobbyZ + 7);
  connect(graph, lobbyExitId, nid(GRID_W / 2, lobbyZ + 5));

  return graph;
}

// ─── A* Pathfinding ──────────────────────────────────────────────────────────

function heuristic(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

function findNearest(graph: Map<string, NavNode3D>, x: number, z: number): NavNode3D | null {
  let best: NavNode3D | null = null;
  let bestDist = Infinity;
  for (const node of Array.from(graph.values())) {
    const d = heuristic(node.x, node.z, x, z);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

export function aStar3D(
  graph: Map<string, NavNode3D>,
  startX: number, startZ: number,
  endX: number, endZ: number
): { x: number; z: number }[] {
  const startNode = findNearest(graph, startX, startZ);
  const endNode = findNearest(graph, endX, endZ);
  if (!startNode || !endNode) return [];
  if (startNode.id === endNode.id) return [{ x: endNode.x, z: endNode.z }];

  const openSet = new Set<string>([startNode.id]);
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(startNode.id, 0);
  fScore.set(startNode.id, heuristic(startNode.x, startNode.z, endNode.x, endNode.z));

  while (openSet.size > 0) {
    let currentId = '';
    let currentF = Infinity;
    for (const id of Array.from(openSet)) {
      const f = fScore.get(id) ?? Infinity;
      if (f < currentF) { currentF = f; currentId = id; }
    }

    if (currentId === endNode.id) {
      const path: { x: number; z: number }[] = [];
      let cur: string | undefined = currentId;
      while (cur) {
        const node = graph.get(cur)!;
        path.unshift({ x: node.x, z: node.z });
        cur = cameFrom.get(cur);
      }
      return path;
    }

    openSet.delete(currentId);
    closedSet.add(currentId);
    const current = graph.get(currentId)!;

    for (const neighborId of current.neighbors) {
      if (closedSet.has(neighborId)) continue;
      const neighbor = graph.get(neighborId)!;
      const tentativeG = (gScore.get(currentId) ?? Infinity) +
        heuristic(current.x, current.z, neighbor.x, neighbor.z);

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + heuristic(neighbor.x, neighbor.z, endNode.x, endNode.z));
        openSet.add(neighborId);
      }
    }
  }

  // IMPORTANT: No fallback! If no path found, return empty.
  // The caller (pathTo) handles this by going to nearest node only.
  return [];
}

// Cached nav graph
let _navGraph: Map<string, NavNode3D> | null = null;
function getNavGraph(): Map<string, NavNode3D> {
  if (!_navGraph) _navGraph = buildNavGraph3D();
  return _navGraph;
}

// Convenience functions
export function getCorridorWaypoints3D(fromRoom: number, toRoom: number): { x: number; z: number }[] {
  const fromDoor = getDoorPos3D(fromRoom);
  const toDoor = getDoorPos3D(toRoom);
  return aStar3D(getNavGraph(), fromDoor.x, fromDoor.z, toDoor.x, toDoor.z);
}

export function getBreakRoomWaypoints3D(fromRoom: number, seatPos: { x: number; z: number }): { x: number; z: number }[] {
  const fromDoor = getDoorPos3D(fromRoom);
  return aStar3D(getNavGraph(), fromDoor.x, fromDoor.z, seatPos.x, seatPos.z);
}

export function getReturnFromBreakWaypoints3D(
  toRoom: number, currentX: number, currentZ: number
): { x: number; z: number }[] {
  const chair = getChairPos3D(toRoom);
  return aStar3D(getNavGraph(), currentX, currentZ, chair.x, chair.z);
}

