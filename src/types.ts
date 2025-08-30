// API response types (websockets-topgg)
export interface APIUser {
  id: string;
  canVoteAt: string | null;
  overallVotes: number;
  monthlyVotes: number;
  streakCount: number;
  lastVoted: string;
  remindersEnabled: boolean;
}

export interface APIEntity {
  id: string;
  overallVotes: number;
  monthlyVotes: number;
  remindersEnabled: boolean;
  remindersBanned?: boolean;
  remindersBannedReason?: string;
}

// WebSocket event payload types
export interface VotePayload {
  user: APIUser;
  entity: APIEntity;
  isWeekend: boolean;
  ts: number;
  query?: string;
}

export interface ReminderPayload {
  user: APIUser;
  entity: APIEntity;
  isWeekend: boolean;
  ts: number;
}

export interface TestPayload {
  user: APIUser;
  entity: APIEntity;
  isWeekend: boolean;
  query?: string;
  ts: number;
}

export interface ReadyPayload {
  name: string;
  connectionId: string;
  entityId: string;
}

export type AriwaEvents = {
  vote: (payload: VotePayload) => void;
  reminder: (payload: ReminderPayload) => void;
  test: (payload: TestPayload) => void;
  ready: (payload: ReadyPayload) => void;
  disconnected: (code: number, reason: string) => void;
  error: (err: Error) => void;
};

// Top.gg API types
export interface Bot {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  defAvatar?: string;
  lib: string;
  prefix: string;
  shortdesc: string;
  longdesc?: string;
  tags: string[];
  website?: string;
  support?: string;
  github?: string;
  owners: string[];
  guilds: string[];
  invite?: string;
  date: string;
  server_count?: number;
  shard_count?: number;
  certifiedBot: boolean;
  vanity?: string;
  points: number;
  monthlyPoints: number;
  donatebotguildid: string;
}

export interface VoteUser {
  username: string;
  id: string;
  avatar: string;
}

export interface BotStats {
  server_count?: number;
  shards: number[];
  shard_count?: number;
}

export interface BotsResponse {
  results: Bot[];
  limit: number;
  offset: number;
  count: number;
  total: number;
}
