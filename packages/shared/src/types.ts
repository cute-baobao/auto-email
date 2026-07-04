export type SkillOutput = 'reply' | 'stats' | 'text';

export interface SkillManifest {
  name: string;
  description: string;
  allowedTools: string[];
  output: SkillOutput;
  body: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  output: SkillOutput;
}

export interface RunRequest {
  input: string;
  skill?: string;
}

export interface StatsPanel {
  title: string;
  rows: { label: string; count: number }[];
}

export type RunResponse =
  | {
      type: 'reply';
      skill: string;
      template: string;
      reply: string;
      metadata: Record<string, string>;
      email_name?: string;
      email_from?: string;
    }
  | { type: 'stats'; skill: string; panels: StatsPanel[] }
  | { type: 'text'; skill: string; text: string };

export interface ReplyRecord {
  template: string;
  email_from?: string;
  email_name?: string;
  email_content?: string;
  reply_content: string;
  metadata: Record<string, string>;
  confirmed: boolean;
}

export interface ProviderConfig {
  base_url: string;
  model: string;
}

export interface AppConfig {
  providers: { default: string } & Record<string, ProviderConfig>;
}

export type RunStreamEvent =
  | { type: 'skill-selected'; skill: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; result: unknown }
  | { type: 'result'; result: RunResponse }
  | { type: 'error'; message: string; fallback?: 'manual' }
  | { type: 'done'; durationMs: number };
