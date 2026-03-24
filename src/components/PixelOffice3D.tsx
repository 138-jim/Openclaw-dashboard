'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { AgentState } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';

const PixelOffice3DScene = dynamic(() => import('@/components/office3d/Scene'), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center" style={{ height: '600px' }}>
      <p className="text-gray-400 text-sm">Loading 3D Office...</p>
    </div>
  ),
});

export default function PixelOffice3D({
  agents,
  conversations = [],
  visitors = [],
}: {
  agents: AgentState[];
  conversations?: Conversation[];
  visitors?: SlackVisitor[];
}) {
  return <PixelOffice3DScene agents={agents} conversations={conversations} visitors={visitors} />;
}
