import { DatabasePool } from '../config/database';
import { Logger } from '../utils/Logger';
import { Pool } from 'pg';
import { PaymentLink, Money, PaginatedResponse } from '../models/types';

export class PaymentLinkRepository {
  private pool: Pool;
  private logger: Logger;
  private memoryLinks: Map<string, PaymentLink> = new Map();

  constructor(databasePool: DatabasePool, logger: Logger) {
    this.pool = databasePool.getPool();
    this.logger = logger;
  }

  async create(link: Omit<PaymentLink, 'id' | 'url' | 'createdAt' | 'updatedAt' | 'currentUses'>): Promise<PaymentLink> {
    let client: any = null;
    try {
      client = await this.pool.connect();
      const id = `plink_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const url = `${process.env.PAYMENT_LINK_BASE_URL || 'https://pay.local/link'}/${id}`;
      const now = new Date();

      const query = `
        INSERT INTO payment_links (
          id, merchant_id, amount, currency, description, expires_at,
          max_uses, current_uses, is_active, single_use, url, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12
        ) RETURNING *
      `;

      const values = [
        id,
        link.merchantId,
        link.amount.amount,
        link.amount.currency,
        link.description || null,
        link.expiresAt || null,
        link.maxUses || null,
        link.isActive,
        link.singleUse,
        url,
        now,
        now
      ];

      const result = await client.query(query, values);
      const row = result.rows[0];
      return this.mapRow(row);
    } catch (error) {
      this.logger.warn('DB unavailable, using in-memory payment link fallback', { error: error instanceof Error ? error.message : 'Unknown error' });
      const id = `plink_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const url = `${process.env.PAYMENT_LINK_BASE_URL || 'https://pay.local/link'}/${id}`;
      const now = new Date();
      const fallback: PaymentLink = {
        id,
        merchantId: link.merchantId,
        amount: link.amount,
        description: link.description,
        expiresAt: link.expiresAt,
        maxUses: link.maxUses,
        currentUses: 0,
        isActive: link.isActive,
        singleUse: !!link.singleUse,
        url,
        createdAt: now,
        updatedAt: now
      };
      this.memoryLinks.set(id, fallback);
      return fallback;
    } finally {
      if (client) client.release();
    }
  }

  async findById(id: string): Promise<PaymentLink | null> {
    let client: any = null;
    try {
      client = await this.pool.connect();
      const result = await client.query('SELECT * FROM payment_links WHERE id = $1', [id]);
      if (result.rows.length === 0) return null;
      return this.mapRow(result.rows[0]);
    } catch (error) {
      this.logger.warn('DB unavailable on findById, using in-memory', { error: error instanceof Error ? error.message : 'Unknown error' });
      return this.memoryLinks.get(id) || null;
    } finally {
      if (client) client.release();
    }
  }

  async incrementUse(id: string): Promise<PaymentLink> {
    let client: any = null;
    try {
      client = await this.pool.connect();
      const now = new Date();
      const query = `
        UPDATE payment_links
        SET current_uses = current_uses + 1, updated_at = $2
        WHERE id = $1
        RETURNING *
      `;
      const result = await client.query(query, [id, now]);
      return this.mapRow(result.rows[0]);
    } catch (error) {
      this.logger.warn('DB unavailable on incrementUse, using in-memory', { error: error instanceof Error ? error.message : 'Unknown error' });
      const existing = this.memoryLinks.get(id);
      if (!existing) {
        throw error instanceof Error ? error : new Error('Link not found');
      }
      const updated: PaymentLink = { ...existing, currentUses: (existing.currentUses || 0) + 1, updatedAt: new Date() };
      this.memoryLinks.set(id, updated);
      return updated;
    } finally {
      if (client) client.release();
    }
  }

  async deactivate(id: string): Promise<PaymentLink> {
    let client: any = null;
    try {
      client = await this.pool.connect();
      const now = new Date();
      const result = await client.query(
        'UPDATE payment_links SET is_active = false, updated_at = $2 WHERE id = $1 RETURNING *',
        [id, now]
      );
      return this.mapRow(result.rows[0]);
    } catch (error) {
      this.logger.warn('DB unavailable on deactivate, using in-memory', { error: error instanceof Error ? error.message : 'Unknown error' });
      const existing = this.memoryLinks.get(id);
      if (!existing) {
        throw error instanceof Error ? error : new Error('Link not found');
      }
      const updated: PaymentLink = { ...existing, isActive: false, updatedAt: new Date() };
      this.memoryLinks.set(id, updated);
      return updated;
    } finally {
      if (client) client.release();
    }
  }

  async listForMerchant(merchantId: string, page: number = 1, limit: number = 20): Promise<PaginatedResponse<PaymentLink>> {
    let client: any = null;
    try {
      client = await this.pool.connect();
      const offset = (page - 1) * limit;
      const countResult = await client.query('SELECT COUNT(*) as total FROM payment_links WHERE merchant_id = $1', [merchantId]);
      const total = parseInt(countResult.rows[0].total);
      const result = await client.query(
        'SELECT * FROM payment_links WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [merchantId, limit, offset]
      );
      return {
        items: result.rows.map((r: any) => this.mapRow(r)),
        total,
        page,
        limit,
        hasMore: page * limit < total
      };
    } catch (error) {
      this.logger.warn('DB unavailable on listForMerchant, using in-memory', { error: error instanceof Error ? error.message : 'Unknown error' });
      const items = Array.from(this.memoryLinks.values()).filter(l => l.merchantId === merchantId);
      const total = items.length;
      const start = (page - 1) * limit;
      const paginated = items.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(start, start + limit);
      return { items: paginated, total, page, limit, hasMore: page * limit < total };
    } finally {
      if (client) client.release();
    }
  }

  private mapRow(row: any): PaymentLink {
    const amount: Money = { amount: parseFloat(row.amount), currency: row.currency, precision: 2 };
    return {
      id: row.id,
      merchantId: row.merchant_id,
      amount,
      description: row.description || undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      maxUses: row.max_uses || undefined,
      currentUses: row.current_uses || 0,
      isActive: !!row.is_active,
      singleUse: !!row.single_use,
      url: row.url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
