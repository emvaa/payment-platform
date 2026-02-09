import { Pool, PoolConfig } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  pool: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
  };
}

export class DatabasePool {
  private pool: Pool;
  private config: DatabaseConfig;

  constructor(config?: Partial<DatabaseConfig>) {
    const parsed = this.parseDatabaseUrl(process.env.DATABASE_URL);
    this.config = {
      host: config?.host || parsed?.host || process.env.DB_HOST || 'localhost',
      port: config?.port || parsed?.port || parseInt(process.env.DB_PORT || '5432'),
      database: config?.database || parsed?.database || process.env.DB_NAME || 'payment_service',
      username: config?.username || parsed?.username || process.env.DB_USER || 'payment_user',
      password: config?.password || parsed?.password || process.env.DB_PASSWORD || '',
      ssl: config?.ssl || process.env.DB_SSL === 'true',
      pool: {
        min: config?.pool?.min || parseInt(process.env.DB_POOL_MIN || '2'),
        max: config?.pool?.max || parseInt(process.env.DB_POOL_MAX || '10'),
        idleTimeoutMillis: config?.pool?.idleTimeoutMillis || parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000')
      }
    };

    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      min: this.config.pool.min,
      max: this.config.pool.max,
      idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
      connectionTimeoutMillis: 2000,
      statement_timeout: 10000,
      query_timeout: 10000,
      application_name: 'payment-service'
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', () => {
      console.log('New database connection established', {
        database: this.config.database
      });
    });

    this.pool.on('error', (err) => {
      console.error('Database pool error:', err);
    });

    this.pool.on('remove', () => {
      console.log('Database connection removed');
    });

    this.pool.on('acquire', () => {
      console.log('Database connection acquired', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    });
  }

  getPool(): Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('Database pool closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  getConfig(): DatabaseConfig {
    return { ...this.config };
  }

  async getStats(): Promise<any> {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  private parseDatabaseUrl(url?: string): { host: string; port: number; database: string; username: string; password: string } | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      const host = u.hostname;
      const port = parseInt(u.port || '5432');
      const database = u.pathname.replace('/', '') || 'payment_service';
      const username = decodeURIComponent(u.username);
      const password = decodeURIComponent(u.password);
      return { host, port, database, username, password };
    } catch {
      return null;
    }
  }
}
