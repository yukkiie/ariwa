import 'dotenv/config';
import { AriwaClient } from '../src/AriwaClient';
import { Result } from '@sapphire/result';
import fs from 'fs/promises';
import path from 'path';
import { Bot, BotStats } from '../src/types';

jest.setTimeout(60000); // Increase timeout for Ws

const wsToken = process.env.WS_TOKEN;
const topggToken = process.env.TOPGG_TOKEN;
if (!wsToken || !topggToken) throw new Error('WS_TOKEN and TOPGG_TOKEN must be set in .env');

describe('Ariwa Unified Client', () => {
  let client: AriwaClient;
  const existingUserId = '13489838383'; 
  const botId = '1348997894';

  beforeAll(async () => {
    // Clean up any existing temp 
    await fs.unlink(path.join(__dirname, 'test-timestamp.json')).catch(() => {});
    
    client = new AriwaClient({
      topgg: topggToken,
      ws: wsToken,
      name: 'TestClient',
      cache: 1000, // Short cache for testing
      persistPath: path.join(__dirname, 'test-timestamp.json')
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
    await fs.unlink(path.join(__dirname, 'test-timestamp.json')).catch(() => {});
  });

  describe('WebSocket (wsApi)', () => {
    it('should connect and emit ready', done => {
      client.on('ready', data => {
        expect(data).toHaveProperty('connectionId');
        expect(data).toHaveProperty('name', 'TestClient');
        done();
      });
    });

    it('should receive a test event and perform wsApi actions', done => {
      client.on('test', async (eventData) => {
        try {
          const userId = existingUserId;

          // Fetch user via wsApi
          const userResult = await client.wsApi.getUser(userId);
          if (userResult.isErr()) {
            console.error('getUser error:', userResult.unwrapErr());
            return done(new Error(userResult.unwrapErr()));
          }
          const user = userResult.unwrap();
          expect(user).toHaveProperty('id', userId);
          expect(user).toHaveProperty('overallVotes');
          expect(user).toHaveProperty('monthlyVotes');
          expect(user).toHaveProperty('streakCount');
          expect(user).toHaveProperty('remindersEnabled');

          // Enable reminders
          const enableResult = await client.wsApi.setUserReminders(userId, true);
          if (enableResult.isErr()) {
            console.error('setUserReminders enable error:', enableResult.unwrapErr());
            return done(new Error(enableResult.unwrapErr()));
          }
          expect(enableResult.unwrap().remindersEnabled).toBe(true);

          // Disable reminders
          const disableResult = await client.wsApi.setUserReminders(userId, false);
          if (disableResult.isErr()) {
            console.error('setUserReminders disable error:', disableResult.unwrapErr());
            return done(new Error(disableResult.unwrapErr()));
          }
          expect(disableResult.unwrap().remindersEnabled).toBe(false);

          done();
        } catch (err) {
          console.error('Test event error:', err);
          done(err);
        }
      });
    });

    it('should return error if reminders not passed', async () => {
      const result = await client.wsApi.setUserReminders(existingUserId, undefined as any);
      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr()).toBe('remindersEnabled must be true or false');
    });

    it('should fetch entity associated with token', async () => {
      const entityResult = await client.wsApi.getEntity();
      if (entityResult.isErr()) {
        console.error('getEntity error:', entityResult.unwrapErr());
        throw new Error(entityResult.unwrapErr());
      }
      const entity = entityResult.unwrap();
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('overallVotes');
      expect(entity).toHaveProperty('monthlyVotes');
      expect(entity).toHaveProperty('remindersEnabled');
    });

    it('should cache wsApi responses', async () => {
      const start = Date.now();
      const firstResult = await client.wsApi.getEntity();
      const firstTime = Date.now() - start;

      const secondResult = await client.wsApi.getEntity();
      const secondTime = Date.now() - start - firstTime;

      if (firstResult.isErr()) {
        console.error('getEntity first call error:', firstResult.unwrapErr());
        throw new Error(firstResult.unwrapErr());
      }
      if (secondResult.isErr()) {
        console.error('getEntity second call error:', secondResult.unwrapErr());
        throw new Error(secondResult.unwrapErr());
      }
      expect(firstResult.isOk()).toBe(true);
      expect(secondResult.isOk()).toBe(true);
      expect(firstResult.unwrap()).toEqual(secondResult.unwrap());
      expect(secondTime).toBeLessThanOrEqual(firstTime); // Cache should be as fast or faster
    });
  });

  describe('Top.gg API (topgg)', () => {
    it('should post bot stats', async () => {
      console.debug('postStats request:', { botId, stats: { server_count: 32, shard_count: 0 } });
      const result = await client.topgg.postStats(botId, { server_count: 32, shard_count: 2 });
      if (result.isErr()) {
        console.error('postStats error:', result.unwrapErr());
        throw new Error(result.unwrapErr());
      }
      expect(result.isOk()).toBe(true);
    });

    it('should get bot details', async () => {
      const result = await client.topgg.getBot(botId);
      if (result.isErr()) {
        console.error('getBot error:', result.unwrapErr());
        throw new Error(result.unwrapErr());
      }
      const bot: Bot = result.unwrap();
      expect(bot).toHaveProperty('id', botId);
      expect(bot).toHaveProperty('username');
      expect(bot).toHaveProperty('points');
    });

    it('should check if user has voted', async () => {
      const result = await client.topgg.hasVoted(botId, existingUserId);
      if (result.isErr()) {
        console.error('hasVoted error:', result.unwrapErr());
        throw new Error(result.unwrapErr());
      }
      expect(typeof result.unwrap()).toBe('boolean');
    });

    it('should cache topgg responses', async () => {
      const start = Date.now();
      const firstResult = await client.topgg.getBot(botId);
      const firstTime = Date.now() - start;

      const secondResult = await client.topgg.getBot(botId);
      const secondTime = Date.now() - start - firstTime;

      if (firstResult.isErr()) {
        console.error('getBot first call error:', firstResult.unwrapErr());
        throw new Error(firstResult.unwrapErr());
      }
      if (secondResult.isErr()) {
        console.error('getBot second call error:', secondResult.unwrapErr());
        throw new Error(secondResult.unwrapErr());
      }
      expect(firstResult.isOk()).toBe(true);
      expect(secondResult.isOk()).toBe(true);
      expect(firstResult.unwrap()).toEqual(secondResult.unwrap());
      expect(secondTime).toBeLessThanOrEqual(firstTime); // Cache should be as fast or faster
    });

    it('should return error if topgg token is missing', async () => {
      const noTokenClient = new AriwaClient({
        ws: wsToken,
        name: 'NoTopGG',
        cache: 1000
      });
      const result = await noTokenClient.topgg.getBot(botId);
      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr()).toBe('Top.gg token not provided');
    });
  });

  describe('Persistence', () => {
    it('should persist and load lastMessageTimestamp', async () => {
      const timestamp = Date.now();
      await fs.writeFile(path.join(__dirname, 'test-timestamp.json'), JSON.stringify({ lastMessageTimestamp: timestamp }));

      const newClient = new AriwaClient({
        ws: wsToken,
        name: 'PersistTest',
        persistPath: path.join(__dirname, 'test-timestamp.json')
      });
      await newClient.connect();

      expect(newClient['lastMessageTimestamp']).toBe(timestamp);
      await newClient.disconnect();
    });
  });
});
