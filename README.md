# Ariwa

A TypeScript library for interacting with Top.gg API and websocket-topgg services. Ariwa provides a simple and efficient way to receive real-time vote events, check vote status, and manage bot statistics on Top.gg.

## Features

- Real-time vote notifications via WebSocket connection
- Automatic reconnection handling
- Persistent event tracking across restarts
- Comprehensive Top.gg API integration
- Built-in response caching for optimal performance
- Fully typed with TypeScript

## Installation

```bash
npm install ariwa
```

## Basic Usage

### Setting up a WebSocket Client

```typescript
import { AriwaClient } from 'ariwa';

const client = new AriwaClient({
  ws: 'your-websockets-topgg-token',
  topgg: 'your-topgg-api-token', // Optional, for Top.gg API access
  name: 'my-awesome-bot',
  persistPath: './timestamp.json' // Optional, for persisting last event timestamp
});

// Connect to the WebSocket server
client.connect();

// Listen for vote events
client.on('vote', (voteData) => {
  console.log(`User ${voteData.user} voted for bot ${voteData.bot}!`);
  // Reward your users here
});

// Listen for other events
client.on('ready', (data) => {
  console.log('Connected to Top.gg WebSocket!');
});

client.on('test', (testData) => {
  console.log('Received test event:', testData);
});

client.on('reminder', (reminderData) => {
  console.log('Received reminder event:', reminderData);
});

// Handle disconnections
client.on('disconnected', (code, reason) => {
  console.log(`Disconnected: ${code} - ${reason}`);
});

// Handle errors
client.on('error', (err) => {
  console.error('WebSocket error:', err);
});

// Gracefully disconnect
process.on('SIGINT', async () => {
  console.log('Disconnecting...');
  await client.disconnect();
  process.exit(0);
});
```

### Working with Top.gg API

```typescript
// Using the API through the client
const botResult = await client.topgg.getBot('botId');
if (botResult.isOk()) {
  const bot = botResult.unwrap();
  console.log(`Bot ${bot.username} has ${bot.server_count} servers!`);
}

// Post stats to Top.gg
await client.topgg.postStats('botId', {
  server_count: 1500,
  shard_count: 10
});

// Check if a user voted
const hasVotedResult = await client.topgg.hasVoted('botId', 'userId');
if (hasVotedResult.isOk() && hasVotedResult.unwrap()) {
  console.log('User has voted!');
}
```

### Using the WebSocket API Directly

```typescript
import { AriwaAPI } from 'ariwa';

const api = new AriwaAPI({ token: 'your-websockets-topgg-token' });

// Get entity information
const entityResult = await api.getEntity();
if (entityResult.isOk()) {
  console.log('Connected entity:', entityResult.unwrap());
}

// Get user information
const userResult = await api.getUser('userId');
if (userResult.isOk()) {
  console.log('User data:', userResult.unwrap());
}

// Set user reminders
await api.setUserReminders('userId', true);
```

## Configuration Options

### AriwaClient Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `ws` | `string` | WebSockets-TopGG token | *Required* |
| `topgg` | `string` | Top.gg API token | `undefined` |
| `name` | `string` | Client name for WebSocket connection | *Required* |
| `cache` | `number` | Cache TTL in milliseconds | `300000` (5 minutes) |
| `autoReconnect` | `boolean` | Auto reconnect on disconnect | `true` |
| `reconnectOptions` | `object` | Reconnection configuration | See below |
| `persistPath` | `string` | Path to save timestamp information | `undefined` |

#### Reconnection Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `initialDelay` | `number` | Initial reconnection delay in ms | `1000` |
| `maxDelay` | `number` | Maximum reconnection delay in ms | `30000` |
| `maxAttempts` | `number` | Maximum number of reconnection attempts | `Infinity` |

## Event Types

The `AriwaClient` emits the following events:

| Event | Description | Data |
|-------|-------------|------|
| `ready` | Connection established | Connection details |
| `vote` | User voted for a bot | Vote details (user, bot, etc.) |
| `test` | Test event received | Test data |
| `reminder` | Vote reminder event | Reminder details |
| `disconnected` | WebSocket disconnected | `code` and `reason` |
| `error` | Error occurred | Error object |
| `unknownOp` | Unknown operation received | `op` and data |

## Error Handling

Ariwa uses the `@sapphire/result` package for error handling. All API methods return a `Result` object that can be safely unwrapped:

```typescript
const result = await client.topgg.getBot('botId');
if (result.isOk()) {
  // Success
  const data = result.unwrap();
  console.log(data);
} else {
  // Error
  const error = result.unwrapErr();
  console.error('Failed to get bot:', error);
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
