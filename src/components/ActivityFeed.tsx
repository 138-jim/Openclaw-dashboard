'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { STATE_COLORS } from '@/lib/agents';

interface ActivityEvent {
  id: string;
  agent: string;
  emoji: string;
  event: string;
  state: string;
  timestamp: string;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then((next: ActivityEvent[]) => {
        setEvents(prev => {
          const prevIds = prev.map(e => e.id).join(',');
          const nextIds = next.map(e => e.id).join(',');
          return prevIds === nextIds ? prev : next;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 5000);
    return () => clearInterval(i);
  }, [refresh]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">Activity</h2>
      <div
        ref={listRef}
        className="max-h-[400px] overflow-y-auto space-y-2 scrollbar-thin"
      >
        {events.length === 0 && (
          <div className="py-8 text-center text-gray-500 text-sm">
            No recent activity
          </div>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors animate-slide-in"
            style={{ borderLeft: `3px solid ${STATE_COLORS[e.state] || STATE_COLORS.idle}` }}
          >
            <span className="text-lg shrink-0">{e.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 truncate">{e.event}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {e.timestamp
                  ? formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })
                  : 'just now'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
