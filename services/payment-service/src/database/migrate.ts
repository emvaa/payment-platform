import { DatabasePool } from '../config/database';
import { Logger } from '../utils/Logger';

async function run() {
  const logger = new Logger('payment-service:migrate');
  const db = new DatabasePool();
  const pool = db.getPool();
  let attempts = 0;
  const maxAttempts = 10;
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
  while (attempts < maxAttempts) {
    attempts++;
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id VARCHAR(128) PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          state VARCHAR(50) NOT NULL,
          amount NUMERIC(18,2) NOT NULL,
          currency VARCHAR(8) NOT NULL,
          sender_id VARCHAR(128) NOT NULL,
          receiver_id VARCHAR(128),
          description TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          idempotency_key VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP NULL,
          expires_at TIMESTAMP NULL,
          confirmation_code VARCHAR(10),
          failure_reason TEXT,
          risk_score NUMERIC(5,4)
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS payment_holds (
          id VARCHAR(128) PRIMARY KEY,
          payment_id VARCHAR(128) NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
          amount NUMERIC(18,2) NOT NULL,
          currency VARCHAR(8) NOT NULL,
          reason TEXT,
          release_at TIMESTAMP NULL,
          is_released BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL,
          released_at TIMESTAMP NULL
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS payment_links (
          id VARCHAR(128) PRIMARY KEY,
          merchant_id VARCHAR(128) NOT NULL,
          amount NUMERIC(18,2) NOT NULL,
          currency VARCHAR(8) NOT NULL,
          description TEXT,
          expires_at TIMESTAMP NULL,
          max_uses INT NULL,
          current_uses INT NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          single_use BOOLEAN NOT NULL DEFAULT FALSE,
          url TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        );
      `);
      await client.query('COMMIT');
      logger.info('Migration completed', { attempts });
      client.release();
      break;
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
      }
      logger.error('Migration attempt failed', { attempts, error: error instanceof Error ? error.message : 'Unknown error' });
      if (attempts >= maxAttempts) {
        await db.close();
        process.exit(1);
      }
      await delay(3000);
    }
  }
  await db.close();
}

run();
