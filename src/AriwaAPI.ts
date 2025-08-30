import { Result } from '@sapphire/result';
import { safeFetchJSON } from './utils/fetcher';
import { APIUser, APIEntity } from './types';

const BASE_URL = 'https://api.websockets-topgg.com/v0/api';

interface AriwaAPIOptions {
  token: string;
  cacheTTL?: number;
}

export class AriwaAPI {
  private token: string;
  private cacheTTL: number;
  private cache: Map<string, { data: any; expiry: number }> = new Map();

  constructor(options: AriwaAPIOptions) {
    if (!options.token) throw new Error('AriwaAPI requires a token');
    this.token = options.token;
    this.cacheTTL = options.cacheTTL ?? 5 * 60 * 1000;
  }

  private getCacheKey(path: string): string {
    return path;
  }

  private async _fetch<T>(
    path: string,
    method: 'GET' | 'PATCH' = 'GET',
    body?: object
  ): Promise<Result<T, string>> {
    return safeFetchJSON<T>(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  private async _fetchWithCache<T>(
    path: string,
    method: 'GET' | 'PATCH' = 'GET',
    body?: object
  ): Promise<Result<T, string>> {
    if (method !== 'GET') {
      const result = await this._fetch<T>(path, method, body);
      if (result.isOk() && path.includes('/user/') && path.endsWith('/reminders')) {
        const userId = path.match(/\/user\/([^/]+)/)?.[1];
        if (userId) this.invalidateCache(`/user/${userId}`);
      }
      return result as Result<T, string, boolean>;
    }

    const key = this.getCacheKey(path);
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return Result.ok(cached.data);
    }

    const result = await this._fetch<T>(path, method, body);
    if (result.isOk()) {
      this.cache.set(key, { data: result.unwrap(), expiry: Date.now() + this.cacheTTL });
    }
    return result as Result<T, string, boolean>;
  }

  getEntity(): Promise<Result<APIEntity, string>> {
    return this._fetchWithCache<APIEntity>('/entity');
  }

  getUser(userId: string): Promise<Result<APIUser, string>> {
    return this._fetchWithCache<APIUser>(`/user/${userId}`);
  }

  setUserReminders(userId: string, enabled: boolean): Promise<Result<APIUser, string>> {
    if (enabled === undefined) return Promise.resolve(Result.err('remindersEnabled must be true or false'));
    return this._fetchWithCache<APIUser>(`/user/${userId}/reminders`, 'PATCH', { enable: enabled });
  }

  invalidateCache(path: string): void {
    const key = this.getCacheKey(path);
    this.cache.delete(key);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
