import { HistoryRepository } from './repositories/historyRepository.js';
import { createServer } from './server.js';
import { createMemoryStorageAdapter } from './storage/memoryAdapter.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '8787', 10);

const storage = createMemoryStorageAdapter();
const repository = new HistoryRepository(storage);
const server = createServer({ repository });

server.listen(port, host, () => {
  console.log(`image-sub2api-studio server listening at http://${host}:${port}`);
});

