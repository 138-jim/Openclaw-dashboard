import { AgentState, hashStr } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';
import {
  COLS, ROWS, ACTIVE_STATES,
  SHIRT_COLORS, HAIR_COLORS, HAIR_STYLES,
  VISITOR_SHIRT_COLORS, VISITOR_SKIN_COLORS,
  getChairPos3D, getDoorPos3D, getBreakRoomSeat3D, getLobbySeat3D,
  hCorridorZ, LOBBY_Z, GRID_W,
} from '@/lib/office-layout';
import {
  aStar3D, buildNavGraph3D,
  getCorridorWaypoints3D,
  getBreakRoomWaypoints3D,
  getReturnFromBreakWaypoints3D,
} from '@/lib/pathfinding-3d';

// Build nav graph once for A* pathfinding
let _navGraph: ReturnType<typeof buildNavGraph3D> | null = null;
function getNavGraph() {
  if (!_navGraph) _navGraph = buildNavGraph3D();
  return _navGraph;
}

// Helper: A* path between two points, with destination appended
// If A* fails (disconnected graph), walks to nearest graph node then to destination
// This is safe because the nearest node is always on a corridor/door
function pathTo(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] {
  const graph = getNavGraph();
  const path = aStar3D(graph, fromX, fromZ, toX, toZ);
  const dest = { x: toX, z: toZ };

  if (path.length === 0) {
    // A* found no path — go to nearest graph node first, then destination
    // This at least gets the agent onto the corridor network
    let bestNode: { x: number; z: number } | null = null;
    let bestDist = Infinity;
    for (const node of Array.from(graph.values())) {
      const d = Math.hypot(node.x - toX, node.z - toZ);
      if (d < bestDist) { bestDist = d; bestNode = { x: node.x, z: node.z }; }
    }
    if (bestNode) return [bestNode, dest];
    return [dest];
  }

  // Always append exact destination — ensures agent walks INTO the room/area
  path.push(dest);
  return path;
}

function setWaypoints(entity: { waypoints: {x:number;z:number}[]; waypointIndex: number; targetX: number; targetZ: number }, wp: {x:number;z:number}[]) {
  entity.waypoints = wp;
  entity.waypointIndex = 0;
  if (wp.length > 0) {
    entity.targetX = wp[0].x;
    entity.targetZ = wp[0].z;
  }
}

// Exported for use in Scene updater
export { pathTo, setWaypoints };

// ─── Agent Animation State ──────────────────────────────────────────────────

export interface AgentAnim3D {
  label: string;
  name: string;
  emoji: string;
  state: string;
  detail: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  shirtColor: string;
  hairColor: string;
  hairStyle: number;
  walkPhase: number;
  isWalking: boolean;
  bobPhase: number;
  errorTimer: number;
  roomIndex: number;
  chatState:
    | 'at_desk'
    | 'walking_to_chat'
    | 'chatting'
    | 'walking_home'
    | 'walking_to_break'
    | 'in_break_room'
    | 'walking_from_break';
  chatTarget: number;
  waypoints: { x: number; z: number }[];
  waypointIndex: number;
  chatMessageIndex: number;
  chatTimer: number;
  conversationId: string | null;
}

// ─── Visitor Animation State ────────────────────────────────────────────────

export interface VisitorAnim3D {
  id: string;
  name: string;
  surface: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  shirtColor: string;
  skinColor: string;
  walkPhase: number;
  isWalking: boolean;
  bobPhase: number;
  targetAgentLabel: string;
  targetRoomIndex: number;
  chatState: 'entering' | 'walking_to_agent' | 'chatting' | 'leaving';
  waypoints: { x: number; z: number }[];
  waypointIndex: number;
  chatTimer: number;
  avatarUrl?: string;
}

// ─── Sync agents from props ─────────────────────────────────────────────────

export function syncAgents3D(
  existing: AgentAnim3D[],
  newProps: AgentState[]
): AgentAnim3D[] {
  const existingMap = new Map(existing.map(a => [a.label, a]));

  return newProps.map((a, i) => {
    const prev = existingMap.get(a.label);
    const h = hashStr(a.label);
    const chairPos = getChairPos3D(i);

    if (prev) {
      const stateChanged = prev.state !== a.state;
      // Don't overwrite target — let the idle/break room transitions handle movement
      let targetX = prev.targetX;
      let targetZ = prev.targetZ;
      if (stateChanged && prev.chatState === 'at_desk') {
        targetX = chairPos.x;
        targetZ = chairPos.z;
      }
      return {
        ...prev,
        name: a.name,
        emoji: a.emoji,
        state: a.state,
        detail: a.detail,
        targetX,
        targetZ,
        isWalking: stateChanged ? true : prev.isWalking,
        errorTimer: a.state === 'error' ? (prev.errorTimer || 100) : 0,
        roomIndex: i,
      };
    }

    // New agent — initialize at break room seat if idle, else at chair
    const isIdle = a.state === 'idle';
    const seat = getBreakRoomSeat3D(i);
    const startPos = isIdle ? seat : chairPos;

    return {
      label: a.label,
      name: a.name,
      emoji: a.emoji,
      state: a.state,
      detail: a.detail,
      x: startPos.x,
      z: startPos.z,
      targetX: startPos.x,
      targetZ: startPos.z,
      shirtColor: SHIRT_COLORS[h % SHIRT_COLORS.length],
      hairColor: HAIR_COLORS[(h >> 4) % HAIR_COLORS.length],
      hairStyle: HAIR_STYLES[(h >> 8) % HAIR_STYLES.length],
      walkPhase: 0,
      isWalking: false,
      bobPhase: Math.random() * Math.PI * 2,
      errorTimer: a.state === 'error' ? 100 : 0,
      roomIndex: i,
      chatState: isIdle ? 'in_break_room' : 'at_desk',
      chatTarget: -1,
      waypoints: [],
      waypointIndex: 0,
      chatMessageIndex: 0,
      chatTimer: 0,
      conversationId: null,
    };
  });
}

// ─── Sync visitors from props ───────────────────────────────────────────────

export function syncVisitors3D(
  existing: VisitorAnim3D[],
  newVisitorProps: SlackVisitor[],
  agents: AgentState[]
): VisitorAnim3D[] {
  const existingMap = new Map(existing.map(v => [v.id, v]));
  const currentIds = new Set(newVisitorProps.map(v => v.id));
  const additions: VisitorAnim3D[] = [];

  // Mark removed visitors as leaving — walk back to lobby then off-screen
  for (const v of existing) {
    if (!currentIds.has(v.id) && v.chatState !== 'leaving') {
      v.chatState = 'leaving';
      const lobbyExit = { x: GRID_W / 2, z: LOBBY_Z + 10 };
      setWaypoints(v, pathTo(v.x, v.z, lobbyExit.x, lobbyExit.z));
    }
  }

  for (const sv of newVisitorProps) {
    const prev = existingMap.get(sv.id);
    const agentIdx = agents.findIndex(a => a.label === sv.targetAgent);
    const targetRoom = agentIdx >= 0 ? agentIdx : 0;

    if (prev) {
      prev.targetAgentLabel = sv.targetAgent;
      prev.targetRoomIndex = targetRoom;
      prev.name = sv.name;
      if (sv.avatarUrl && sv.avatarUrl !== prev.avatarUrl) {
        prev.avatarUrl = sv.avatarUrl;
      }
      continue;
    }

    const h = hashStr(sv.id);
    const visitorIdx = additions.length + existing.filter(e => currentIds.has(e.id)).length;
    const lobbySeat = getLobbySeat3D(visitorIdx);

    // Visitors enter from the front of the lobby and walk to their seat
    additions.push({
      id: sv.id,
      name: sv.name,
      surface: sv.surface || 'slack',
      x: GRID_W / 2,
      z: LOBBY_Z + 8, // start off-screen below lobby
      targetX: GRID_W / 2,
      targetZ: LOBBY_Z + 8,
      shirtColor: VISITOR_SHIRT_COLORS[h % VISITOR_SHIRT_COLORS.length],
      skinColor: VISITOR_SKIN_COLORS[(h >> 3) % VISITOR_SKIN_COLORS.length],
      walkPhase: 0,
      isWalking: false,
      bobPhase: Math.random() * Math.PI * 2,
      targetAgentLabel: sv.targetAgent,
      targetRoomIndex: targetRoom,
      chatState: 'entering',
      waypoints: [
        { x: lobbySeat.x, z: LOBBY_Z + 6 },
        { x: lobbySeat.x, z: lobbySeat.z },
      ],
      waypointIndex: 0,
      chatTimer: 0,
      avatarUrl: sv.avatarUrl,
    });
  }

  return existing
    .concat(additions)
    .filter(v => {
      if (v.chatState !== 'leaving') return true;
      // Remove if they've walked off-screen
      return v.z < LOBBY_Z + 9 && v.x > -4;
    });
}

// ─── Update conversations → chat states ─────────────────────────────────────

export function updateConversations3D(
  agents: AgentAnim3D[],
  conversations: Conversation[]
): void {
  const convMap = new Map(conversations.map(c => [c.id, c]));
  const agentMap = new Map(agents.map(a => [a.label, a]));

  // End conversations that disappeared
  for (const a of agents) {
    if (a.conversationId && !convMap.has(a.conversationId)) {
      if (a.chatState === 'chatting' || a.chatState === 'walking_to_chat') {
        // Walk back to appropriate place: desk if active, break room if idle
        const isIdle = a.state === 'idle';
        if (isIdle) {
          a.chatState = 'walking_to_break';
          const seat = getBreakRoomSeat3D(a.roomIndex);
          setWaypoints(a, pathTo(a.x, a.z, seat.x, seat.z));
        } else {
          a.chatState = 'walking_home';
          const homeChair = getChairPos3D(a.roomIndex);
          setWaypoints(a, pathTo(a.x, a.z, homeChair.x, homeChair.z));
        }
      }
      a.conversationId = null;
    }
  }

  // Start new conversations — walker goes to wherever the target currently IS
  for (const conv of conversations) {
    const [label1, label2] = conv.participants;
    const a1 = agentMap.get(label1);
    const a2 = agentMap.get(label2);
    if (!a1 || !a2) continue;

    const stayer = a1.roomIndex < a2.roomIndex ? a1 : a2;
    const walker = a1.roomIndex < a2.roomIndex ? a2 : a1;

    if (walker.conversationId === conv.id) continue;
    // Allow chatting from at_desk OR in_break_room
    if (walker.chatState !== 'at_desk' && walker.chatState !== 'in_break_room') continue;

    walker.conversationId = conv.id;
    walker.chatState = 'walking_to_chat';
    walker.chatTarget = stayer.roomIndex;
    // Walk to where the stayer actually IS (not their room)
    // Offset based on walker index so multiple chatters don't stack
    const offsetAngle = (walker.roomIndex * 1.2) % (Math.PI * 2);
    const chatOffsetX = Math.cos(offsetAngle) * 1.5;
    const chatOffsetZ = Math.sin(offsetAngle) * 1.5;
    setWaypoints(walker, pathTo(walker.x, walker.z, stayer.x + chatOffsetX, stayer.z + chatOffsetZ));
    walker.chatMessageIndex = 0;
    walker.chatTimer = 0;

    stayer.conversationId = conv.id;
    stayer.chatMessageIndex = 0;
    stayer.chatTimer = 0;
  }
}

// ─── Idle/active transitions ────────────────────────────────────────────────

export function updateIdleTransitions3D(agents: AgentAnim3D[]): void {
  for (const a of agents) {
    const isIdle = a.state === 'idle';
    const isBusy = ACTIVE_STATES.has(a.state) || a.state === 'error';

    if (isIdle && a.chatState === 'at_desk' && !a.conversationId && !a.isWalking) {
      // Send idle agent to break room
      a.chatState = 'walking_to_break';
      const seat = getBreakRoomSeat3D(a.roomIndex);
      setWaypoints(a, pathTo(a.x, a.z, seat.x, seat.z));
    } else if (isBusy && a.chatState === 'in_break_room') {
      a.chatState = 'walking_from_break';
      const homeChair = getChairPos3D(a.roomIndex);
      setWaypoints(a, pathTo(a.x, a.z, homeChair.x, homeChair.z));
    }
  }
}

// ─── Agent movement update (per frame) ──────────────────────────────────────

const WALK_SPEED = 8; // units per second
const CORNER_RADIUS = 0.6;

export function updateAgentMovement3D(agent: AgentAnim3D, dt: number): void {
  const dx = agent.targetX - agent.x;
  const dz = agent.targetZ - agent.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 0.2) {
    agent.isWalking = true;
    const speed = Math.min(WALK_SPEED * dt, dist);

    // Corner smoothing: blend direction within CORNER_RADIUS of next waypoint
    let moveX = (dx / dist) * speed;
    let moveZ = (dz / dist) * speed;

    if (
      agent.waypoints.length > 0 &&
      agent.waypointIndex < agent.waypoints.length - 1 &&
      dist < CORNER_RADIUS
    ) {
      const nextWp = agent.waypoints[agent.waypointIndex + 1];
      if (nextWp) {
        const ndx = nextWp.x - agent.x;
        const ndz = nextWp.z - agent.z;
        const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
        if (ndist > 0.01) {
          const blend = 1 - dist / CORNER_RADIUS;
          moveX = moveX * (1 - blend) + (ndx / ndist) * speed * blend;
          moveZ = moveZ * (1 - blend) + (ndz / ndist) * speed * blend;
        }
      }
    }

    agent.x += moveX;
    agent.z += moveZ;
    agent.walkPhase += dt * 8;
  } else {
    agent.isWalking = false;
    agent.x = agent.targetX;
    agent.z = agent.targetZ;

    // Waypoint progression — always progress if there are waypoints remaining
    if (agent.waypoints.length > 0) {
      agent.waypointIndex++;
      if (agent.waypointIndex < agent.waypoints.length) {
        agent.targetX = agent.waypoints[agent.waypointIndex].x;
        agent.targetZ = agent.waypoints[agent.waypointIndex].z;
      } else {
        // Arrived at destination
        if (agent.chatState === 'walking_to_chat') {
          agent.chatState = 'chatting';
          agent.chatTimer = 0;
          agent.chatMessageIndex = 0;
        } else if (agent.chatState === 'walking_to_break') {
          agent.chatState = 'in_break_room';
        } else if (agent.chatState === 'walking_from_break') {
          agent.chatState = 'at_desk';
          const homeChair = getChairPos3D(agent.roomIndex);
          agent.targetX = homeChair.x;
          agent.targetZ = homeChair.z;
        } else {
          // walking_home
          agent.chatState = 'at_desk';
          agent.conversationId = null;
          const homeChair = getChairPos3D(agent.roomIndex);
          agent.targetX = homeChair.x;
          agent.targetZ = homeChair.z;
        }
        agent.waypoints = [];
        agent.waypointIndex = 0;
      }
    }
  }

  // Walk phase decay when stopped
  if (!agent.isWalking && agent.walkPhase > 0) {
    agent.walkPhase *= 0.9;
    if (agent.walkPhase < 0.01) agent.walkPhase = 0;
  }

  // Idle bobbing
  agent.bobPhase += dt * 3;

  // Error timer
  if (agent.errorTimer > 0) agent.errorTimer -= dt * 0.6;

  // Chat message cycling + auto-end after all messages shown
  if (agent.chatState === 'chatting') {
    agent.chatTimer += dt * 1000;
    if (agent.chatTimer > 3000) {
      agent.chatTimer = 0;
      agent.chatMessageIndex++;
    }
    // After 15 seconds of chatting, walk back
    if (agent.chatMessageIndex > 4) {
      const isIdle = agent.state === 'idle';
      if (isIdle) {
        agent.chatState = 'walking_to_break';
        const seat = getBreakRoomSeat3D(agent.roomIndex);
        setWaypoints(agent, pathTo(agent.x, agent.z, seat.x, seat.z));
      } else {
        agent.chatState = 'walking_home';
        const homeChair = getChairPos3D(agent.roomIndex);
        setWaypoints(agent, pathTo(agent.x, agent.z, homeChair.x, homeChair.z));
      }
      agent.conversationId = null;
      agent.chatMessageIndex = 0;
    }
  }
}

// ─── Visitor movement update (per frame) ────────────────────────────────────

const VISITOR_WALK_SPEED = 7; // units per second

export function updateVisitorMovement3D(visitor: VisitorAnim3D, dt: number): void {
  const dx = visitor.targetX - visitor.x;
  const dz = visitor.targetZ - visitor.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 0.2) {
    visitor.isWalking = true;
    const speed = Math.min(VISITOR_WALK_SPEED * dt, dist);
    visitor.x += (dx / dist) * speed;
    visitor.z += (dz / dist) * speed;
    visitor.walkPhase += dt * 8;
  } else {
    visitor.isWalking = false;
    visitor.x = visitor.targetX;
    visitor.z = visitor.targetZ;

    // Waypoint progression
    if (visitor.waypoints.length > 0) {
      visitor.waypointIndex++;
      if (visitor.waypointIndex < visitor.waypoints.length) {
        visitor.targetX = visitor.waypoints[visitor.waypointIndex].x;
        visitor.targetZ = visitor.waypoints[visitor.waypointIndex].z;
      } else {
        // All waypoints reached
        visitor.waypoints = [];
        visitor.waypointIndex = 0;
        if (visitor.chatState === 'entering') {
          visitor.chatState = 'walking_to_agent';
        } else if (visitor.chatState === 'walking_to_agent') {
          visitor.chatState = 'chatting';
          visitor.chatTimer = 0;
        }
        // leaving state: just stop, will be cleaned up
      }
    }
  }

  // Walk phase decay
  if (!visitor.isWalking && visitor.walkPhase > 0) {
    visitor.walkPhase *= 0.9;
    if (visitor.walkPhase < 0.01) visitor.walkPhase = 0;
  }

  // Chat timer — visitors leave after chatting for 20 seconds
  if (visitor.chatState === 'chatting') {
    visitor.chatTimer += dt;
    if (visitor.chatTimer > 20) {
      visitor.chatState = 'leaving';
      const lobbyExit = { x: GRID_W / 2, z: LOBBY_Z + 10 };
      setWaypoints(visitor, pathTo(visitor.x, visitor.z, lobbyExit.x, lobbyExit.z));
      visitor.chatTimer = 0;
    }
  }

  // Bobbing
  visitor.bobPhase += dt * 3;
}
