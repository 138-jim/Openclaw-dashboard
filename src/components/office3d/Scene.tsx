// @ts-nocheck
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { AgentState, STATE_COLORS } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';
import { H, GRID_W, W, ACTIVE_STATES, getMonitorPos3D } from '@/lib/office-layout';
import {
  AgentAnim3D, VisitorAnim3D,
  syncAgents3D, syncVisitors3D,
  updateConversations3D, updateIdleTransitions3D,
  updateAgentMovement3D, updateVisitorMovement3D,
  pathTo, setWaypoints,
} from '@/lib/agent-animation';
import Room from '@/components/office3d/Room';
import CorridorFloor from '@/components/office3d/CorridorFloor';
import BreakRoom from '@/components/office3d/BreakRoom';
import Lobby from '@/components/office3d/Lobby';
import Character from '@/components/office3d/Character';
import VisitorCharacter from '@/components/office3d/VisitorCharacter';
import ThoughtBubble from '@/components/office3d/ThoughtBubble';
import SpeechBubble from '@/components/office3d/SpeechBubble';

// Inner component that runs inside Canvas (can use useFrame)
function SceneUpdater({ animRef }: { animRef: React.MutableRefObject<{
  agents: AgentAnim3D[];
  visitors: VisitorAnim3D[];
  conversations: Conversation[];
}> }) {
  const [, setTick] = useState(0);

  useFrame((_, delta) => {
    const anim = animRef.current;
    const dt = Math.min(delta, 0.05); // cap at 50ms

    updateConversations3D(anim.agents, anim.conversations);
    updateIdleTransitions3D(anim.agents);

    for (const a of anim.agents) {
      updateAgentMovement3D(a, dt);
    }
    for (const v of anim.visitors) {
      // If visitor just arrived at lobby and needs to walk to agent
      if (v.chatState === 'walking_to_agent' && v.waypoints.length === 0) {
        const targetAgent = anim.agents.find(a => a.label === v.targetAgentLabel);
        if (targetAgent) {
          // Offset each visitor so they don't stack on the agent
          const vi = anim.visitors.indexOf(v);
          const vAngle = (vi * 1.5 + 0.5) % (Math.PI * 2);
          const vOffX = Math.cos(vAngle) * 1.8;
          const vOffZ = Math.sin(vAngle) * 1.8;
          setWaypoints(v, pathTo(v.x, v.z, targetAgent.x + vOffX, targetAgent.z + vOffZ));
        }
      }
      updateVisitorMovement3D(v, dt);
    }

    // Trigger re-render every 100ms to update character positions
    setTick(t => t + 1);
  });

  return null;
}

// 3rd person camera that follows a selected agent
function CameraFollower({ animRef, followLabel, controlsRef }: {
  animRef: React.MutableRefObject<{ agents: AgentAnim3D[] }>;
  followLabel: string | null;
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  const smoothTarget = useRef(new THREE.Vector3());
  const smoothPos = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!followLabel) return;
    const agent = animRef.current.agents.find(a => a.label === followLabel);
    if (!agent) return;

    // Target: agent position
    const target = new THREE.Vector3(agent.x, 0.8, agent.z);
    // Camera: behind and above the agent — zoomed out for good view
    const camOffset = new THREE.Vector3(agent.x - 6, 8, agent.z + 10);

    // Smooth interpolation
    smoothTarget.current.lerp(target, 0.05);
    smoothPos.current.lerp(camOffset, 0.05);

    camera.position.copy(smoothPos.current);
    camera.lookAt(smoothTarget.current);

    // Update orbit controls target
    if (controlsRef.current) {
      controlsRef.current.target.copy(smoothTarget.current);
      controlsRef.current.update();
    }
  });

  return null;
}

export default function Scene({
  agents,
  conversations = [],
  visitors = [],
}: {
  agents: AgentState[];
  conversations?: Conversation[];
  visitors?: SlackVisitor[];
}) {
  const animRef = useRef<{
    agents: AgentAnim3D[];
    visitors: VisitorAnim3D[];
    conversations: Conversation[];
  }>({
    agents: [],
    visitors: [],
    conversations: [],
  });

  // Sync conversations
  useEffect(() => {
    animRef.current.conversations = conversations;
  }, [conversations]);

  // Sync agents
  useEffect(() => {
    animRef.current.agents = syncAgents3D(animRef.current.agents, agents);
  }, [agents]);

  // Sync visitors
  useEffect(() => {
    animRef.current.visitors = syncVisitors3D(animRef.current.visitors, visitors, agents);
  }, [visitors, agents]);

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [followAgent, setFollowAgent] = useState<string | null>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const targetX = W / 2;
  const targetZ = H / 2;

  // Extract conversation messages for speech bubbles
  const convMap = new Map(conversations.map(c => [c.id, c]));

  return (
    <div ref={containerRef} className={`w-full relative ${isFullscreen ? 'bg-black' : ''}`} style={{ height: '70vh', minHeight: '500px' }}>
      <Canvas shadows camera={{ position: [targetX + 25, 35, targetZ + 35], fov: 50, near: 0.5, far: 300 }}>
        {/* Sky background */}
        <color attach="background" args={['#C8DAE8']} />

        <OrbitControls
          ref={controlsRef}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2.2}
          enableDamping
          dampingFactor={0.05}
          target={[targetX, 0, targetZ]}
          minDistance={3}
          maxDistance={100}
        />
        <CameraFollower animRef={animRef} followLabel={followAgent} controlsRef={controlsRef} />

        {/* Lighting */}
        <ambientLight intensity={0.7} color="#FFF8F0" />
        <directionalLight
          position={[40, 50, 30]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
        />
        <hemisphereLight args={['#87CEEB', '#E8D5B7', 0.4]} />
        <fog attach="fog" args={['#C8DAE8', 100, 250]} />

        {/* State updater */}
        <SceneUpdater animRef={animRef} />

        {/* Ground — large grass area (box) */}
        <mesh position={[W / 2, -0.3, H / 2]} receiveShadow>
          <boxGeometry args={[W + 60, 0.1, H + 60]} />
          <meshStandardMaterial color="#7CB87C" />
        </mesh>
        {/* Paved area under office (box) */}
        <mesh position={[W / 2, -0.15, H / 2]} receiveShadow>
          <boxGeometry args={[W + 6, 0.1, H + 6]} />
          <meshStandardMaterial color="#B8B0A4" />
        </mesh>

        {/* Corridors */}
        <CorridorFloor />

        {/* Break room */}
        <BreakRoom />
        <Lobby />

        {/* Agent rooms */}
        {agents.map((a, i) => (
          <Room
            key={a.label}
            roomIndex={i}
            label={a.label}
            name={a.name}
            emoji={a.emoji}
            glowColor={STATE_COLORS[a.state]}
            isError={a.state === 'error'}
          />
        ))}

        {/* Agent characters */}
        {animRef.current.agents.map(a => (
          <Character key={a.label} anim={a} />
        ))}

        {/* Visitor characters */}
        {animRef.current.visitors.map(v => (
          <VisitorCharacter key={v.id} anim={v} />
        ))}

        {/* Thought bubbles — active agents at desk */}
        {animRef.current.agents.map(a => {
          if (!ACTIVE_STATES.has(a.state)) return null;
          if (a.chatState !== 'at_desk') return null;
          if (!a.detail) return null;
          const monPos = getMonitorPos3D(a.roomIndex);
          return (
            <ThoughtBubble
              key={`thought-${a.label}`}
              text={a.detail}
              color={STATE_COLORS[a.state] || '#64748b'}
              position={[monPos.x, 3.5, monPos.z - 1]}
            />
          );
        })}

        {/* Speech bubbles — chatting agents */}
        {animRef.current.agents.map(a => {
          if (a.chatState !== 'chatting' || !a.conversationId) return null;
          const conv = convMap.get(a.conversationId);
          if (!conv || !conv.messages.length) return null;
          const msgIdx = a.chatMessageIndex % conv.messages.length;
          const msg = conv.messages[msgIdx];
          if (msg.from !== a.label) return null;
          return (
            <SpeechBubble
              key={`speech-${a.label}`}
              text={msg.text}
              color={STATE_COLORS[a.state] || '#64748b'}
              position={[a.x, 2.5, a.z]}
            />
          );
        })}

        {/* Visitor speech bubbles */}
        {animRef.current.visitors.map(v => {
          if (v.chatState !== 'chatting') return null;
          return (
            <SpeechBubble
              key={`visitor-speech-${v.id}`}
              text={`${v.name} is chatting with ${v.targetAgentLabel}`}
              color="#4A154B"
              position={[v.x, 2.5, v.z]}
            />
          );
        })}
      </Canvas>

      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-black/30 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isFullscreen ? (
            <>
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </>
          ) : (
            <>
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </>
          )}
        </svg>
      </button>

      {/* Agent selector sidebar */}
      <div className="absolute top-3 left-3 z-10 max-h-[80%] overflow-y-auto rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 w-48">
        <button
          onClick={() => setFollowAgent(null)}
          className={`w-full px-3 py-2 text-left text-xs font-medium border-b border-white/10 transition-colors ${
            !followAgent ? 'bg-purple-500/30 text-white' : 'text-gray-300 hover:bg-white/10'
          }`}
        >
          🏢 Overview
        </button>
        {agents.map(a => (
          <button
            key={a.label}
            onClick={() => setFollowAgent(a.label)}
            className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${
              followAgent === a.label ? 'bg-purple-500/30 text-white' : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            <span>{a.emoji}</span>
            <span className="truncate">{a.name}</span>
            <span className={`ml-auto w-1.5 h-1.5 rounded-full ${
              a.state === 'idle' ? 'bg-gray-500' :
              a.state === 'error' ? 'bg-red-500' :
              'bg-green-500'
            }`} />
          </button>
        ))}
      </div>

      {/* Follow mode indicator */}
      {followAgent && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-white text-sm flex items-center gap-2">
          <span>Following: {agents.find(a => a.label === followAgent)?.emoji} {agents.find(a => a.label === followAgent)?.name}</span>
          <button onClick={() => setFollowAgent(null)} className="text-gray-400 hover:text-white ml-2">✕</button>
        </div>
      )}
    </div>
  );
}
