import { Redis } from 'ioredis';
import { redisUrl } from '../env.js';

export function createRedis(url: string = redisUrl()): Redis {
  return new Redis(url, {
    // Mặc định ioredis xếp hàng command vô hạn khi mất kết nối. Với warm-pool thì
    // fail nhanh tốt hơn là ôm một hàng đợi câm (Errors Over Silent Fallbacks).
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });
}
