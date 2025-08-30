import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { AriwaAPI } from './AriwaAPI';
import { Result } from '@sapphire/result';
import { safeFetchJSON } from './utils/fetcher';
import { loadTimestamp, saveTimestamp } from './utils/persist';
import { AriwaEvents, Bot, BotsResponse, VoteUser, BotStats } from './types';

export interface AriwaClientOptions {
  topgg?: string; // Top.gg API token
  ws: string; // websockets-topgg token
  name: string; // websocket client name
  cache?: number; // cacheTTL in ms
  autoReconnect?: boolean;
  reconnectOptions?: {
    initialDelay?: number;
    maxDelay?: number;
    maxAttempts?: number;
  };
  persistPath?: string; // Path for timestamp persistence
}

const WS_URL = 'wss://api.websockets-topgg.com/v0/websocket';
const TOPGG_BASE_URL = 'https://top.gg/api';

export class AriwaClient extends EventEmitter {
  private wsToken: string;
  private name: string;
  private ws?: WebSocket;
  private lastMessageTimestamp?: number;
  private autoReconnect: boolean;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private intentionalClose: boolean = false;
  private persistPath?: string;
  public readonly wsApi: AriwaAPI;
  public readonly topgg: TopGGAPI;

  constructor(options: AriwaClientOptions) {
    super();
    this.wsToken = options.ws;
    this.name = options.name;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelay = options.reconnectOptions?.initialDelay ?? 1000;
    this.maxReconnectDelay = options.reconnectOptions?.maxDelay ?? 30000;
    this.maxReconnectAttempts = options.reconnectOptions?.maxAttempts ?? Infinity;
    this.persistPath = options.persistPath;

    this.wsApi = new AriwaAPI({ token: options.ws, cacheTTL: options.cache });
    this.topgg = new TopGGAPI(options.topgg ? { token: options.topgg, cacheTTL: options.cache } : undefined);
  }

  async connect(lastMessageTimestamp?: number) {
    this.lastMessageTimestamp = lastMessageTimestamp ?? (this.persistPath ? await loadTimestamp(this.persistPath) : undefined);
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this._connect();
  }

  private _connect() {
    const headers: Record<string, string> = {
      Authorization: this.wsToken,
      name: this.name
    };

    if (this.lastMessageTimestamp) headers['lastMessageTimestamp'] = this.lastMessageTimestamp.toString();

    this.ws = new WebSocket(WS_URL, { headers });

    this.ws.on('open', () => {
      this.emit('open');
      this.reconnectAttempts = 0;
      if (process.env.NODE_ENV !== 'test') console.log('WS open');
    });

    this.ws.on('message', this.handleMessage.bind(this));

    this.ws.on('close', (code, reason) => {
      this.emit('disconnected', code, reason.toString());
      if (!this.intentionalClose && this.autoReconnect && code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnect();
      }
    });

    this.ws.on('error', err => this.emit('error', err));
  }

  private async handleMessage(raw: WebSocket.Data) {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      this.emit('error', err);
      return;
    }

    const { op, d, ts } = data;

    switch (op) {
      case 3: this.emit('ready', d); break;
      case 10: this.emit('vote', { ...d, ts }); break;
      case 11: this.emit('test', { ...d, ts }); break;
      case 12: this.emit('reminder', { ...d, ts }); break;
      default: this.emit('unknownOp', op, d);
    }

    if (ts) {
      this.lastMessageTimestamp = ts;
      if (this.persistPath) await saveTimestamp(this.persistPath, ts);
    }
  }

  private reconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), this.maxReconnectDelay) + Math.random() * 1000;
    if (process.env.NODE_ENV !== 'test') console.log(`Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
    setTimeout(() => this._connect(), delay);
  }

  disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.ws = undefined;
        resolve();
        return;
      }
      this.intentionalClose = true;
      const timeout = setTimeout(() => reject(new Error('WebSocket close timed out')), 5000);
      this.ws.on('close', () => {
        clearTimeout(timeout);
        if (this.ws) {
          this.ws.removeAllListeners();
          this.ws.terminate(); // Forcefully terminate the connection
        }
        this.ws = undefined;
        resolve();
      });
      this.ws.on('error', err => {
        clearTimeout(timeout);
        if (this.ws) {
          this.ws.removeAllListeners();
        }
        this.ws = undefined;
        reject(err);
      });
      this.ws.close(1000, 'Client disconnect');
    });
  }
}

class TopGGAPI {
  private token?: string;
  private cacheTTL: number;
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private rateLimitReset?: number;

  constructor(options?: { token: string; cacheTTL?: number }) {
    this.token = options?.token;
    this.cacheTTL = options?.cacheTTL ?? 5 * 60 * 1000;
  }

  private getCacheKey(path: string, query?: Record<string, any>): string {
    let key = path;
    if (query) {
      const sortedQuery = Object.entries(query).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join('&');
      key += `?${sortedQuery}`;
    }
    return key;
  }

  private async _fetch<T>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: object,
    query?: Record<string, any>
  ): Promise<Result<T, string>> {
    if (!this.token) return Result.err('Top.gg token not provided');
    if (this.rateLimitReset && Date.now() < this.rateLimitReset) {
      return Result.err(`Rate limited until ${new Date(this.rateLimitReset).toISOString()}`);
    }

    let url = `${TOPGG_BASE_URL}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        params.append(k, v.toString());
      }
      url += `?${params.toString()}`;
    }

    const result = await safeFetchJSON<T>(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (result.isErr() && result.unwrapErr().includes('429')) {
      this.rateLimitReset = Date.now() + 60 * 1000; // I dont know if it reset in 60 second
      return Result.err('Rate limit exceeded, retry later');
    }

    return result;
  }

  private async _fetchWithCache<T>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: object,
    query?: Record<string, any>
  ): Promise<Result<T, string>> {
    if (method !== 'GET') {
      const result = await this._fetch<T>(path, method, body, query);
      if (result.isOk() && method === 'POST' && path.endsWith('/stats')) {
        const botId = path.match(/\/bots\/([^/]+)\/stats/)?.[1];
        if (botId) {
          this.invalidateCache(`/bots/${botId}/stats`);
          this.invalidateCache(`/bots/${botId}`);
        }
      }
      return result;
    }

    const key = this.getCacheKey(path, query);
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return Result.ok(cached.data);
    }

    const result = await this._fetch<T>(path, method, body, query);
    if (result.isOk()) {
      this.cache.set(key, { data: result.unwrap(), expiry: Date.now() + this.cacheTTL });
    }
    return result;
  }

  postStats(botId: string, stats: { server_count: number; shard_count?: number; shards?: number[] }): Promise<Result<unknown, string>> {
    return this._fetchWithCache(`/bots/${botId}/stats`, 'POST', stats);
  }

  getBots(options: { limit?: number; offset?: number; sort?: string; fields?: string } = {}): Promise<Result<BotsResponse, string>> {
    return this._fetchWithCache<BotsResponse>('/bots', 'GET', undefined, options);
  }

  getBot(botId: string): Promise<Result<Bot, string>> {
    return this._fetchWithCache<Bot>(`/bots/${botId}`);
  }

  getVotes(botId: string): Promise<Result<VoteUser[], string>> {
    return this._fetchWithCache<VoteUser[]>(`/bots/${botId}/votes`);
  }

  async hasVoted(botId: string, userId: string): Promise<Result<boolean, string>> {
    const result = await this._fetchWithCache<{ voted: number }>(`/bots/${botId}/check`, 'GET', undefined, { userId });
    if (result.isOk()) {
      return Result.ok(result.unwrap().voted === 1);
    }
    return Result.err(result.unwrapErr());
  }

  getStats(botId: string): Promise<Result<BotStats, string>> {
    return this._fetchWithCache<BotStats>(`/bots/${botId}/stats`);
  }

  invalidateCache(path: string, query?: Record<string, any>): void {
    const key = this.getCacheKey(path, query);
    this.cache.delete(key);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
