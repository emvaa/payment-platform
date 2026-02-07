import { Payment, PaymentState, PaymentType, PaymentHold, PaginatedResponse, FilterOptions, SortOptions } from '../../../../shared/types';
import { PaymentModel } from '../models/Payment';
import { Logger } from '../utils/Logger';
import { DatabasePool } from '../config/database';
import { Pool, PoolClient } from 'pg';

export class PaymentRepository {
  private pool: Pool;
  private logger: Logger;

  constructor(databasePool: DatabasePool, logger: Logger) {
    this.pool = databasePool.getPool();
    this.logger = logger;
  }

  async create(payment: PaymentModel): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO payments (
          id, type, state, amount, currency, sender_id, receiver_id,
          description, metadata, idempotency_key, created_at, updated_at,
          completed_at, expires_at, confirmation_code, failure_reason, risk_score
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) RETURNING *
      `;
      
      const values = [
        payment.id,
        payment.type,
        payment.state,
        payment.amount.amount,
        payment.amount.currency,
        payment.senderId,
        payment.receiverId || null,
        payment.description || null,
        JSON.stringify(payment.metadata),
        payment.idempotencyKey,
        payment.createdAt,
        payment.updatedAt,
        payment.completedAt || null,
        payment.expiresAt || null,
        payment.confirmationCode || null,
        payment.failureReason || null,
        payment.riskScore || null
      ];
      
      const result = await client.query(query, values);
      const savedPayment = result.rows[0];
      
      // Save holds if any
      if (payment.holds && payment.holds.length > 0) {
        for (const hold of payment.holds) {
          await this.insertHold(client, hold);
        }
      }
      
      await client.query('COMMIT');
      
      this.logger.info('Payment created successfully', { 
        paymentId: payment.id,
        state: payment.state 
      });
      
      return this.mapRowToPayment(savedPayment);
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error creating payment', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId: payment.id 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Payment | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          p.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', h.id,
                'paymentId', h.payment_id,
                'amount', h.amount,
                'currency', h.currency,
                'reason', h.reason,
                'releaseAt', h.release_at,
                'isReleased', h.is_released,
                'createdAt', h.created_at,
                'releasedAt', h.released_at
              )
            ) FILTER (WHERE h.id IS NOT NULL),
            '[]'::json
          ) as holds
        FROM payments p
        LEFT JOIN payment_holds h ON p.id = h.payment_id
        WHERE p.id = $1
        GROUP BY p.id
      `;
      
      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToPayment(result.rows[0]);
      
    } catch (error) {
      this.logger.error('Error finding payment by ID', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId: id 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          p.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', h.id,
                'paymentId', h.payment_id,
                'amount', h.amount,
                'currency', h.currency,
                'reason', h.reason,
                'releaseAt', h.release_at,
                'isReleased', h.is_released,
                'createdAt', h.created_at,
                'releasedAt', h.released_at
              )
            ) FILTER (WHERE h.id IS NOT NULL),
            '[]'::json
          ) as holds
        FROM payments p
        LEFT JOIN payment_holds h ON p.id = h.payment_id
        WHERE p.idempotency_key = $1
        GROUP BY p.id
      `;
      
      const result = await client.query(query, [idempotencyKey]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToPayment(result.rows[0]);
      
    } catch (error) {
      this.logger.error('Error finding payment by idempotency key', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        idempotencyKey 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async update(payment: PaymentModel): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const query = `
        UPDATE payments SET
          state = $2,
          description = $3,
          metadata = $4,
          updated_at = $5,
          completed_at = $6,
          failure_reason = $7,
          risk_score = $8
        WHERE id = $1
        RETURNING *
      `;
      
      const values = [
        payment.id,
        payment.state,
        payment.description || null,
        JSON.stringify(payment.metadata),
        payment.updatedAt,
        payment.completedAt || null,
        payment.failureReason || null,
        payment.riskScore || null
      ];
      
      const result = await client.query(query, values);
      const updatedPayment = result.rows[0];
      
      // Update holds
      if (payment.holds) {
        // Delete existing holds
        await client.query('DELETE FROM payment_holds WHERE payment_id = $1', [payment.id]);
        
        // Insert new holds
        for (const hold of payment.holds) {
          await this.insertHold(client, hold);
        }
      }
      
      await client.query('COMMIT');
      
      this.logger.info('Payment updated successfully', { 
        paymentId: payment.id,
        state: payment.state 
      });
      
      return this.mapRowToPayment(updatedPayment);
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error updating payment', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId: payment.id 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async findMany(options: {
    filters?: FilterOptions;
    sort?: SortOptions;
    pagination?: { page: number; limit: number };
  }): Promise<PaginatedResponse<Payment>> {
    const client = await this.pool.connect();
    try {
      let whereClause = 'WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      // Build WHERE clause from filters
      if (options.filters) {
        if (options.filters.userId) {
          whereClause += ` AND sender_id = $${paramIndex++}`;
          queryParams.push(options.filters.userId);
        }
        
        if (options.filters.state) {
          whereClause += ` AND state = $${paramIndex++}`;
          queryParams.push(options.filters.state);
        }
        
        if (options.filters.type) {
          whereClause += ` AND type = $${paramIndex++}`;
          queryParams.push(options.filters.type);
        }
        
        if (options.filters.currency) {
          whereClause += ` AND currency = $${paramIndex++}`;
          queryParams.push(options.filters.currency);
        }
        
        if (options.filters.startDate) {
          whereClause += ` AND created_at >= $${paramIndex++}`;
          queryParams.push(options.filters.startDate);
        }
        
        if (options.filters.endDate) {
          whereClause += ` AND created_at <= $${paramIndex++}`;
          queryParams.push(options.filters.endDate);
        }
        
        if (options.filters.minAmount) {
          whereClause += ` AND amount >= $${paramIndex++}`;
          queryParams.push(options.filters.minAmount);
        }
        
        if (options.filters.maxAmount) {
          whereClause += ` AND amount <= $${paramIndex++}`;
          queryParams.push(options.filters.maxAmount);
        }
      }
      
      // Build ORDER BY clause
      let orderClause = 'ORDER BY created_at DESC';
      if (options.sort) {
        const validSortFields = ['created_at', 'updated_at', 'amount', 'state'];
        if (validSortFields.includes(options.sort.field)) {
          orderClause = `ORDER BY ${options.sort.field} ${options.sort.direction}`;
        }
      }
      
      // Build LIMIT and OFFSET
      const limit = options.pagination?.limit || 20;
      const offset = ((options.pagination?.page || 1) - 1) * limit;
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM payments ${whereClause}`;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);
      
      // Get payments
      const query = `
        SELECT 
          p.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', h.id,
                'paymentId', h.payment_id,
                'amount', h.amount,
                'currency', h.currency,
                'reason', h.reason,
                'releaseAt', h.release_at,
                'isReleased', h.is_released,
                'createdAt', h.created_at,
                'releasedAt', h.released_at
              )
            ) FILTER (WHERE h.id IS NOT NULL),
            '[]'::json
          ) as holds
        FROM payments p
        LEFT JOIN payment_holds h ON p.id = h.payment_id
        ${whereClause}
        GROUP BY p.id
        ${orderClause}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      queryParams.push(limit, offset);
      
      const result = await client.query(query, queryParams);
      const payments = result.rows.map(row => this.mapRowToPayment(row));
      
      const totalPages = Math.ceil(total / limit);
      
      return {
        items: payments,
        pagination: {
          page: options.pagination?.page || 1,
          limit,
          total,
          totalPages,
          hasNext: (options.pagination?.page || 1) < totalPages,
          hasPrev: (options.pagination?.page || 1) > 1
        }
      };
      
    } catch (error) {
      this.logger.error('Error finding payments', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async findBySenderId(senderId: string, limit: number = 10): Promise<Payment[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          p.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', h.id,
                'paymentId', h.payment_id,
                'amount', h.amount,
                'currency', h.currency,
                'reason', h.reason,
                'releaseAt', h.release_at,
                'isReleased', h.is_released,
                'createdAt', h.created_at,
                'releasedAt', h.released_at
              )
            ) FILTER (WHERE h.id IS NOT NULL),
            '[]'::json
          ) as holds
        FROM payments p
        LEFT JOIN payment_holds h ON p.id = h.payment_id
        WHERE p.sender_id = $1
        GROUP BY p.id
        ORDER BY created_at DESC
        LIMIT $2
      `;
      
      const result = await client.query(query, [senderId, limit]);
      return result.rows.map(row => this.mapRowToPayment(row));
      
    } catch (error) {
      this.logger.error('Error finding payments by sender ID', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        senderId 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async getStats(startDate?: Date, endDate?: Date): Promise<{
    total: number;
    totalAmount: number;
    byState: Record<PaymentState, number>;
    byType: Record<PaymentType, number>;
  }> {
    const client = await this.pool.connect();
    try {
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      
      if (startDate) {
        whereClause += ' AND created_at >= $1';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += ' AND created_at <= $2';
        params.push(endDate);
      }
      
      const query = `
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(amount), 0) as totalAmount,
          COUNT(*) FILTER (WHERE state = 'PENDING') as pending_count,
          COUNT(*) FILTER (WHERE state = 'PROCESSING') as processing_count,
          COUNT(*) FILTER (WHERE state = 'COMPLETED') as completed_count,
          COUNT(*) FILTER (WHERE state = 'FAILED') as failed_count,
          COUNT(*) FILTER (WHERE state = 'CANCELLED') as cancelled_count,
          COUNT(*) FILTER (WHERE state = 'REFUNDED') as refunded_count,
          COUNT(*) FILTER (WHERE state = 'EXPIRED') as expired_count,
          COUNT(*) FILTER (WHERE type = 'PAYMENT_LINK') as payment_link_count,
          COUNT(*) FILTER (WHERE type = 'DIRECT_PAYMENT') as direct_payment_count,
          COUNT(*) FILTER (WHERE type = 'WITHDRAWAL') as withdrawal_count,
          COUNT(*) FILTER (WHERE type = 'DEPOSIT') as deposit_count,
          COUNT(*) FILTER (WHERE type = 'REFUND') as refund_count
        FROM payments ${whereClause}
      `;
      
      const result = await client.query(query, params);
      const row = result.rows[0];
      
      return {
        total: parseInt(row.total),
        totalAmount: parseFloat(row.totalamount),
        byState: {
          PENDING: parseInt(row.pending_count),
          PROCESSING: parseInt(row.processing_count),
          COMPLETED: parseInt(row.completed_count),
          FAILED: parseInt(row.failed_count),
          CANCELLED: parseInt(row.cancelled_count),
          REFUNDED: parseInt(row.refunded_count),
          EXPIRED: parseInt(row.expired_count),
          CHARGEBACK: 0,
          PENDING_CONFIRMATION: 0
        },
        byType: {
          PAYMENT_LINK: parseInt(row.payment_link_count),
          DIRECT_PAYMENT: parseInt(row.direct_payment_count),
          WITHDRAWAL: parseInt(row.withdrawal_count),
          DEPOSIT: parseInt(row.deposit_count),
          REFUND: parseInt(row.refund_count),
          CHARGEBACK: 0
        }
      };
      
    } catch (error) {
      this.logger.error('Error getting payment stats', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertHold(client: PoolClient, hold: PaymentHold): Promise<void> {
    const query = `
      INSERT INTO payment_holds (
        id, payment_id, amount, currency, reason, release_at, is_released, created_at, released_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    const values = [
      hold.id,
      hold.paymentId,
      hold.amount.amount,
      hold.amount.currency,
      hold.reason,
      hold.releaseAt || null,
      hold.isReleased,
      hold.createdAt,
      hold.releasedAt || null
    ];
    
    await client.query(query, values);
  }

  private mapRowToPayment(row: any): Payment {
    return {
      id: row.id,
      type: row.type as PaymentType,
      state: row.state as PaymentState,
      amount: {
        amount: parseFloat(row.amount),
        currency: row.currency,
        precision: 2
      },
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      description: row.description,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      idempotencyKey: row.idempotency_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      confirmationCode: row.confirmation_code,
      failureReason: row.failure_reason,
      riskScore: row.risk_score ? parseFloat(row.risk_score) : undefined,
      holds: row.holds || []
    };
  }
}
