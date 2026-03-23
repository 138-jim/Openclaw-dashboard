export interface SlackVisitor {
  id: string;
  name: string;
  provider: string;
  targetAgent: string;
  lastActive: string;
  surface: string;
  avatarUrl?: string;
}
