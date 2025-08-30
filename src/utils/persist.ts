import fs from 'fs/promises';
import path from 'path';

export async function saveTimestamp(filePath: string, timestamp: number): Promise<void> {
  try {
    await Promise.race([
      fs.writeFile(filePath, JSON.stringify({ lastMessageTimestamp: timestamp }), { flag: 'w' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('File write timeout')), 1000))
    ]);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Failed to save timestamp:', err);
  }
}

export async function loadTimestamp(filePath: string): Promise<number | undefined> {
  try {
    const data = await Promise.race([
      fs.readFile(filePath, 'utf-8'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('File read timeout')), 1000))
    ]);
    const parsed = JSON.parse(data as string);
    return parsed.lastMessageTimestamp;
  } catch {
    return undefined;
  }
}
