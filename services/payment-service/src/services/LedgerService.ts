import { Money, LedgerEntry, LedgerEventType, FraudAssessment, Payment } from '../models/types';
import { Logger } from '../utils/Logger';

export class LedgerService {
  private logger: Logger;
  private baseUrl: string;

  constructor(logger: Logger, ledgerServiceUrl?: string) {
    this.logger = logger;
    this.baseUrl = ledgerServiceUrl || process.env.LEDGER_SERVICE_URL || 'http://localhost:3003';
  }

  async createDebitEntry(
    accountId: string,
    amount: Money,
    paymentId: string,
    description: string,
    correlationId?: string
  ): Promise<LedgerEntry> {
    try {
      const entry: Partial<LedgerEntry> = {
        type: LedgerEventType.DEBIT,
        amount,
        accountId,
        paymentId,
        metadata: { description },
        version: 1,
        correlationId: correlationId || this.generateCorrelationId()
      };

      const response = await this.makeRequest('/entries', 'POST', entry);
      
      this.logger.info('Debit entry created', {
        accountId,
        amount,
        paymentId,
        entryId: response.id
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error creating debit entry', {
        accountId,
        amount,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const fallback: LedgerEntry = {
          id: `dev_debit_${Date.now()}`,
          type: LedgerEventType.DEBIT,
          amount,
          accountId,
          paymentId,
          timestamp: new Date(),
          metadata: { description, fallback: true },
          signature: 'dev-signature',
          version: 1
        } as any;
        return fallback;
      }
      throw error;
    }
  }

  async createCreditEntry(
    accountId: string,
    amount: Money,
    paymentId: string,
    description: string,
    correlationId?: string
  ): Promise<LedgerEntry> {
    try {
      const entry: Partial<LedgerEntry> = {
        type: LedgerEventType.CREDIT,
        amount,
        accountId,
        paymentId,
        metadata: { description },
        version: 1,
        correlationId: correlationId || this.generateCorrelationId()
      };

      const response = await this.makeRequest('/entries', 'POST', entry);
      
      this.logger.info('Credit entry created', {
        accountId,
        amount,
        paymentId,
        entryId: response.id
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error creating credit entry', {
        accountId,
        amount,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const fallback: LedgerEntry = {
          id: `dev_credit_${Date.now()}`,
          type: LedgerEventType.CREDIT,
          amount,
          accountId,
          paymentId,
          timestamp: new Date(),
          metadata: { description, fallback: true },
          signature: 'dev-signature',
          version: 1
        } as any;
        return fallback;
      }
      throw error;
    }
  }

  async createHoldEntry(
    accountId: string,
    amount: Money,
    paymentId: string,
    reason: string,
    releaseAt?: Date,
    correlationId?: string
  ): Promise<LedgerEntry> {
    try {
      const entry: Partial<LedgerEntry> = {
        type: LedgerEventType.HOLD,
        amount,
        accountId,
        paymentId,
        metadata: { reason, releaseAt: releaseAt?.toISOString() },
        version: 1,
        correlationId: correlationId || this.generateCorrelationId()
      };

      const response = await this.makeRequest('/entries', 'POST', entry);
      
      this.logger.info('Hold entry created', {
        accountId,
        amount,
        paymentId,
        reason,
        entryId: response.id
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error creating hold entry', {
        accountId,
        amount,
        paymentId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async createReleaseEntry(
    accountId: string,
    amount: Money,
    paymentId: string,
    reason: string,
    correlationId?: string
  ): Promise<LedgerEntry> {
    try {
      const entry: Partial<LedgerEntry> = {
        type: LedgerEventType.RELEASE,
        amount,
        accountId,
        paymentId,
        metadata: { reason },
        version: 1,
        correlationId: correlationId || this.generateCorrelationId()
      };

      const response = await this.makeRequest('/entries', 'POST', entry);
      
      this.logger.info('Release entry created', {
        accountId,
        amount,
        paymentId,
        reason,
        entryId: response.id
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error creating release entry', {
        accountId,
        amount,
        paymentId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async createReversalEntry(
    accountId: string,
    amount: Money,
    originalPaymentId: string,
    reason: string,
    correlationId?: string
  ): Promise<LedgerEntry> {
    try {
      const entry: Partial<LedgerEntry> = {
        type: LedgerEventType.REVERSAL,
        amount,
        accountId,
        referenceId: originalPaymentId,
        metadata: { reason, originalPaymentId },
        version: 1,
        correlationId: correlationId || this.generateCorrelationId()
      };

      const response = await this.makeRequest('/entries', 'POST', entry);
      
      this.logger.info('Reversal entry created', {
        accountId,
        amount,
        originalPaymentId,
        reason,
        entryId: response.id
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error creating reversal entry', {
        accountId,
        amount,
        originalPaymentId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getBalance(
    accountId: string,
    currency?: string,
    asOf?: Date
  ): Promise<{
    available: Money;
    held: Money;
    total: Money;
  }> {
    try {
      const params = new URLSearchParams();
      if (currency) params.append('currency', currency);
      if (asOf) params.append('asOf', asOf.toISOString());

      const response = await this.makeRequest(`/accounts/${accountId}/balance?${params}`, 'GET');
      
      this.logger.info('Balance retrieved', {
        accountId,
        currency,
        balance: response
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting balance', {
        accountId,
        currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getAccountHistory(
    accountId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    entries: LedgerEntry[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate.toISOString());
      if (options.endDate) params.append('endDate', options.endDate.toISOString());
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());

      const response = await this.makeRequest(`/accounts/${accountId}/history?${params}`, 'GET');
      
      this.logger.info('Account history retrieved', {
        accountId,
        entryCount: response.entries.length,
        total: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting account history', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getEntry(entryId: string): Promise<LedgerEntry> {
    try {
      const response = await this.makeRequest(`/entries/${entryId}`, 'GET');
      
      this.logger.info('Ledger entry retrieved', {
        entryId,
        type: response.type,
        amount: response.amount
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting ledger entry', {
        entryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async verifyEntry(entryId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/entries/${entryId}/verify`, 'POST');
      
      this.logger.info('Ledger entry verified', {
        entryId,
        isValid: response.isValid
      });

      return response.isValid;
      
    } catch (error) {
      this.logger.error('Error verifying ledger entry', {
        entryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getAccountSummary(
    accountId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    totalDebits: Money;
    totalCredits: Money;
    totalHolds: Money;
    totalReleases: Money;
    netBalance: Money;
    transactionCount: number;
  }> {
    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate.toISOString());
      if (options.endDate) params.append('endDate', options.endDate.toISOString());

      const response = await this.makeRequest(`/accounts/${accountId}/summary?${params}`, 'GET');
      
      this.logger.info('Account summary retrieved', {
        accountId,
        netBalance: response.netBalance,
        transactionCount: response.transactionCount
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting account summary', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': this.generateCorrelationId(),
        'X-Service-Name': 'payment-service'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Ledger service error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private generateCorrelationId(): string {
    return `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.makeRequest('/health', 'GET');
      return true;
    } catch (error) {
      this.logger.error('Ledger service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}
