import { hashStr } from '@/lib/agents';

export interface ConversationMessage {
  from: string;
  text: string;
}

export interface Conversation {
  id: string;
  participants: string[]; // agent labels
  topic: string;
  messages: ConversationMessage[];
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const MESSAGE_TEMPLATES: Record<string, string[][]> = {
  syncing: [
    ['Ready to sync?', 'Pushing changes now.'],
    ['Pull from main?', 'Already on it.'],
    ['Merge conflict here.', 'Let me take a look.'],
    ['Branch is up to date.', 'Great, deploying now.'],
  ],
  writing: [
    ['Can you review this?', 'Looks good to me.'],
    ['Draft is ready.', 'Nice work on that.'],
    ['Need a second opinion.', 'Happy to help.'],
    ['Rewriting this section.', 'Good call, it needed it.'],
  ],
  researching: [
    ['Found something interesting.', 'Show me what you got.'],
    ['Checking the docs now.', 'Try the API reference.'],
    ['This looks promising.', 'Let me dig deeper.'],
    ['Any leads on this?', 'I have a few ideas.'],
  ],
  executing: [
    ['Running the pipeline.', 'Watching the logs.'],
    ['Tests are passing.', 'Ship it!'],
    ['Build started.', 'Fingers crossed.'],
    ['Deploying to staging.', 'I will monitor it.'],
  ],
};

export interface AgentStateForConversation {
  label: string;
  name: string;
  state: string;
}

export function generateConversations(agents: AgentStateForConversation[]): Conversation[] {
  const now = new Date();
  const hourSeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() * 24 + now.getHours();

  // Group agents by active state
  const groups: Record<string, AgentStateForConversation[]> = {};
  for (const a of agents) {
    if (['writing', 'researching', 'executing', 'syncing'].includes(a.state)) {
      if (!groups[a.state]) groups[a.state] = [];
      groups[a.state].push(a);
    }
  }

  const conversations: Conversation[] = [];

  for (const [state, group] of Object.entries(groups)) {
    if (group.length < 2) continue;

    // Sort by label for consistency
    group.sort((a, b) => a.label.localeCompare(b.label));

    // Pair agents up
    for (let i = 0; i + 1 < group.length; i += 2) {
      const a1 = group[i];
      const a2 = group[i + 1];
      const seed = hashStr(a1.label + a2.label) + hourSeed;
      const rng = seededRandom(seed);

      const templates = MESSAGE_TEMPLATES[state] || MESSAGE_TEMPLATES.writing;
      const templateIdx = Math.floor(rng() * templates.length);
      const template = templates[templateIdx];

      conversations.push({
        id: `${a1.label}-${a2.label}-${state}`,
        participants: [a1.label, a2.label],
        topic: state,
        messages: [
          { from: a1.label, text: template[0] },
          { from: a2.label, text: template[1] },
        ],
      });
    }
  }

  // Limit to at most 3 conversations
  return conversations.slice(0, 3);
}
