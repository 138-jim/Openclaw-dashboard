export interface AgentConfig {
  label: string; name: string; emoji: string;
}

export const AGENTS: AgentConfig[] = [
  { label: 'main', name: 'Smith', emoji: '🕶️' },
  { label: 'penny', name: 'Penny', emoji: '💰' },
  { label: 'desk', name: 'Desk', emoji: '🎧' },
  { label: 'hex', name: 'Hex', emoji: '⚙️' },
  { label: 'nooshbot', name: 'Janet', emoji: '📋' },
  { label: 'pipeline', name: 'Pipeline', emoji: '🚀' },
  { label: 'feedhive', name: 'Reef', emoji: '🐠' },
  { label: 'quill', name: 'Quill', emoji: '✍️' },
  { label: 'scout', name: 'Scout', emoji: '🔍' },
  { label: 'axel', name: 'Axel', emoji: '🔧' },
  { label: 'hal', name: 'Hal', emoji: '🖥️' },
  { label: 'grace', name: 'Grace', emoji: '🤝' },
  { label: 'lex', name: 'Lex', emoji: '⚖️' },
  { label: 'ada', name: 'Ada', emoji: '🧠' },
  { label: 'ivy', name: 'Ivy', emoji: '🌿' },
  { label: 'tess', name: 'Tess', emoji: '🧪' },
];

export interface AgentState {
  label: string; name: string; emoji: string;
  state: string; detail: string; updated_at: string;
  model?: string;
}

export const STATE_COLORS: Record<string, string> = {
  idle: '#6b7280',
  writing: '#3b82f6',
  researching: '#8b5cf6',
  executing: '#f59e0b',
  syncing: '#06b6d4',
  error: '#ef4444',
};
