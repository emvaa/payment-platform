import { Payment } from '../../../../shared/types';
import { Logger } from '../utils/Logger';
import { Redis } from 'ioredis';

export interface IdempotencyRecord {
  idempotencyKey: string;
  response: any;
  timestamp: Date;
  expiresAt: Date;
  requestId: string;
}

export class IdempotencyService {
  private redis: Redis;
  private logger: Logger;
  private defaultTTL: number = 86400000; // 24 hours in milliseconds

  constructor(redisClient: Redis, logger: Logger) {
    this.redis = redisClient;
    this.logger = logger;
  }

  async check(idempotencyKey: string): Promise<Payment | null> {
    try {
      const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
      
      if (!cached) {
        return null;
      }

      const record: IdempotencyRecord = JSON.parse(cached);
      
      // Check if the record has expired
      if (new Date() > new Date(record.expiresAt)) {
        await this.redis.del(`idempotency:${idempotencyKey}`);
        return null;
      }

      this.logger.info('Idempotency cache hit', {
        idempotencyKey,
        requestId: record.requestId,
        timestamp: record.timestamp
      });

      return record.response;
      
    } catch (error) {
      this.logger.error('Error checking idempotency', {
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // If Redis fails, we should allow the request to proceed
      return null;
    }
  }

  async store(idempotencyKey: string, response: Payment, ttl?: number): Promise<void> {
    try {
      const record: IdempotencyRecord = {
        idempotencyKey,
        response,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + (ttl || this.defaultTTL)),
        requestId: this.generateRequestId()
      };

      const key = `idempotency:${idempotencyKey}`;
      const value = JSON.stringify(record);
      const expireTime = Math.floor((ttl || this.defaultTTL) / 1000); // Convert to seconds

      await this.redis.setex(key, expireTime, value);

      this.logger.info('Idempotency record stored', {
        idempotencyKey,
        requestId: record.requestId,
        ttl: expireTime
      });

    } catch (error) {
      this.logger.error('Error storing idempotency record', {
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // If Redis fails, we should not fail the request
      // The operation can proceed without idempotency guarantee
    }
  }

  async invalidate(idempotencyKey: string): Promise<void> {
    try {
      await this.redis.del(`idempotency:${idempotencyKey}`);
      
      this.logger.info('Idempotency record invalidated', {
        idempotencyKey
      });
      
    } catch (error) {
      this.logger.error('Error invalidating idempotency record', {
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`idempotency:${pattern}*`);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        this.logger.info('Idempotency records invalidated by pattern', {
          pattern,
          count: keys.length
        });
      }
      
    } catch (error) {
      this.logger.error('Error invalidating idempotency records by pattern', {
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async cleanup(): Promise<void> {
    try {
      const keys = await this.redis.keys('idempotency:*');
      let cleanedCount = 0;
      
      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          const record: IdempotencyRecord = JSON.parse(cached);
          
          if (new Date() > new Date(record.expiresAt)) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      this.logger.info('Idempotency cleanup completed', {
        totalKeys: keys.length,
        cleanedCount
      });
      
    } catch (error) {
      this.logger.error('Error during idempotency cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getStats(): Promise<{
    totalRecords: number;
    expiredRecords: number;
    memoryUsage: string;
  }> {
    try {
      const keys = await this.redis.keys('idempotency:*');
      let expiredCount = 0;
      
      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          const record: IdempotencyRecord = JSON.parse(cached);
          
          if (new Date() > new Date(record.expiresAt)) {
            expiredCount++;
          }
        }
      }

      const memoryInfo = await this.redis.info('memory');
      const memoryUsage = this.parseMemoryUsage(memoryInfo);

      return {
        totalRecords: keys.length,
        expiredRecords: expiredCount,
        memoryUsage
      };
      
    } catch (error) {
      this.logger.error('Error getting idempotency stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalRecords: 0,
        expiredRecords: 0,
        memoryUsage: '0B'
      };
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseMemoryUsage(memoryInfo: string): string {
    const lines = memoryInfo.split('\r\n');
    for (const line of lines) {
      if (line.startsWith('used_memory_human:')) {
        return line.split(':')[1].trim();
      }
    }
    return '0B';
  }

  async setTTL(idempotencyKey: string, ttl: number): Promise<void> {
    try {
      const key = `idempotency:${idempotencyKey}`;
      const expireTime = Math.floor(ttl / 1000); // Convert to seconds
      
      await this.redis.expire(key, expireTime);
      
      this.logger.info('Idempotency TTL updated', {
        idempotencyKey,
        ttl: expireTime
      });
      
    } catch (error) {
      this.logger.error('Error setting idempotency TTL', {
        idempotencyKey,
        ttl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getTTL(idempotencyKey: string): Promise<number | null> {
    try {
      const key = `idempotency:${idempotencyKey}`;
      const ttl = await this.redis.ttl(key);
      
      return ttl >= 0 ? ttl * 1000 : null; // Convert back to milliseconds
      
    } catch (error) {
      this.logger.error('Error getting idempotency TTL', {
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
}
