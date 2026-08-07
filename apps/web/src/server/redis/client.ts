import { Redis } from 'ioredis';
import { redisUrl } from '../env.js';

/**
 * Tạo client Redis.
 *
 * `onError` BẮT BUỘC phải xử lý: `Redis` là EventEmitter, và EventEmitter không
 * có listener `'error'` sẽ ném uncaught exception **giết cả process**. Không gắn
 * listener thì một lần Redis restart sẽ hạ nguyên tiến trình Next.js chứ không
 * phải làm hỏng một request.
 */
export function createRedis(url: string = redisUrl(), onError?: (err: Error) => void): Redis {
  const client = new Redis(url, {
    // Mặc định ioredis xếp hàng command vô hạn khi mất kết nối. Với warm-pool thì
    // fail nhanh tốt hơn là ôm một hàng đợi câm (Errors Over Silent Fallbacks).
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });

  client.on('error', onError ?? ((err) => console.error('[redis]', err.message)));

  return client;
}
