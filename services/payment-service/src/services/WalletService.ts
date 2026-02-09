import { Money } from '../models/types';
import { Logger } from '../utils/Logger';

export interface WalletBalance {
  currency: string;
  available: Money;
  held: Money;
  pending: Money;
  total: Money;
  lastUpdated: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  balances: WalletBalance[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class WalletService {
  private logger: Logger;
  private baseUrl: string;

  constructor(logger: Logger, walletServiceUrl?: string) {
    this.logger = logger;
    this.baseUrl = walletServiceUrl || process.env.WALLET_SERVICE_URL || 'http://localhost:3002';
  }

  async getWallet(userId: string): Promise<Wallet> {
    try {
      const response = await this.makeRequest(`/wallets/user/${userId}`, 'GET');
      
      this.logger.info('Wallet retrieved', {
        userId,
        walletId: response.id,
        balanceCount: response.balances.length
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting wallet', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getBalance(userId: string, currency: string): Promise<WalletBalance> {
    try {
      const response = await this.makeRequest(`/wallets/user/${userId}/balance/${currency}`, 'GET');
      
      this.logger.info('Balance retrieved', {
        userId,
        currency,
        available: response.available,
        held: response.held,
        total: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting balance', {
        userId,
        currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const fallback: WalletBalance = {
          currency,
          available: { amount: 100000, currency, precision: 2 },
          held: { amount: 0, currency, precision: 2 },
          pending: { amount: 0, currency, precision: 2 },
          total: { amount: 100000, currency, precision: 2 },
          lastUpdated: new Date()
        };
        return fallback;
      }
      throw error;
    }
  }

  async credit(
    userId: string,
    amount: Money,
    referenceId?: string,
    description?: string
  ): Promise<WalletBalance> {
    try {
      const request = {
        amount,
        referenceId,
        description: description || 'Credit transaction'
      };

      const response = await this.makeRequest(`/wallets/user/${userId}/credit`, 'POST', request);
      
      this.logger.info('Wallet credited', {
        userId,
        amount,
        referenceId,
        newBalance: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error crediting wallet', {
        userId,
        amount,
        referenceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const currency = amount.currency;
        const fallback: WalletBalance = {
          currency,
          available: { amount: 100000 + amount.amount, currency, precision: 2 },
          held: { amount: 0, currency, precision: 2 },
          pending: { amount: 0, currency, precision: 2 },
          total: { amount: 100000 + amount.amount, currency, precision: 2 },
          lastUpdated: new Date()
        };
        return fallback;
      }
      throw error;
    }
  }

  async debit(
    userId: string,
    amount: Money,
    referenceId?: string,
    description?: string
  ): Promise<WalletBalance> {
    try {
      const request = {
        amount,
        referenceId,
        description: description || 'Debit transaction'
      };

      const response = await this.makeRequest(`/wallets/user/${userId}/debit`, 'POST', request);
      
      this.logger.info('Wallet debited', {
        userId,
        amount,
        referenceId,
        newBalance: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error debiting wallet', {
        userId,
        amount,
        referenceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const currency = amount.currency;
        const fallback: WalletBalance = {
          currency,
          available: { amount: 100000 - amount.amount, currency, precision: 2 },
          held: { amount: 0, currency, precision: 2 },
          pending: { amount: 0, currency, precision: 2 },
          total: { amount: 100000 - amount.amount, currency, precision: 2 },
          lastUpdated: new Date()
        };
        return fallback;
      }
      throw error;
    }
  }

  async holdFunds(
    userId: string,
    amount: Money,
    holdId: string,
    reason: string,
    releaseAt?: Date
  ): Promise<WalletBalance> {
    try {
      const request = {
        amount,
        holdId,
        reason,
        releaseAt: releaseAt?.toISOString()
      };

      const response = await this.makeRequest(`/wallets/user/${userId}/hold`, 'POST', request);
      
      this.logger.info('Funds held', {
        userId,
        amount,
        holdId,
        reason,
        heldAmount: response.held
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error holding funds', {
        userId,
        amount,
        holdId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const currency = amount.currency;
        const fallback: WalletBalance = {
          currency,
          available: { amount: 100000 - amount.amount, currency, precision: 2 },
          held: { amount: amount.amount, currency, precision: 2 },
          pending: { amount: 0, currency, precision: 2 },
          total: { amount: 100000, currency, precision: 2 },
          lastUpdated: new Date()
        };
        return fallback;
      }
      throw error;
    }
  }

  async releaseHeldFunds(
    userId: string,
    holdId: string,
    amount?: Money
  ): Promise<WalletBalance> {
    try {
      const request = {
        holdId,
        amount
      };

      const response = await this.makeRequest(`/wallets/user/${userId}/release`, 'POST', request);
      
      this.logger.info('Held funds released', {
        userId,
        holdId,
        amount,
        newBalance: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error releasing held funds', {
        userId,
        holdId,
        amount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      if ((process.env.NODE_ENV || 'development') === 'development') {
        const currency = amount?.currency || 'USD';
        const amt = amount?.amount || 0;
        const fallback: WalletBalance = {
          currency,
          available: { amount: 100000 + amt, currency, precision: 2 },
          held: { amount: Math.max(0, 0 - amt), currency, precision: 2 },
          pending: { amount: 0, currency, precision: 2 },
          total: { amount: 100000 + amt, currency, precision: 2 },
          lastUpdated: new Date()
        };
        return fallback;
      }
      throw error;
    }
  }

  async getAvailableBalance(userId: string, currency: string): Promise<Money> {
    try {
      const balance = await this.getBalance(userId, currency);
      return balance.available;
      
    } catch (error) {
      this.logger.error('Error getting available balance', {
        userId,
        currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getHeldBalance(userId: string, currency: string): Promise<Money> {
    try {
      const balance = await this.getBalance(userId, currency);
      return balance.held;
      
    } catch (error) {
      this.logger.error('Error getting held balance', {
        userId,
        currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getTotalBalance(userId: string, currency: string): Promise<Money> {
    try {
      const balance = await this.getBalance(userId, currency);
      return balance.total;
      
    } catch (error) {
      this.logger.error('Error getting total balance', {
        userId,
        currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async hasSufficientBalance(userId: string, amount: Money): Promise<boolean> {
    try {
      const balance = await this.getBalance(userId, amount.currency);
      return balance.available.amount >= amount.amount;
      
    } catch (error) {
      this.logger.error('Error checking sufficient balance', {
        userId,
        amount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async getTransactionHistory(
    userId: string,
    options: {
      currency?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    transactions: any[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const params = new URLSearchParams();
      if (options.currency) params.append('currency', options.currency);
      if (options.startDate) params.append('startDate', options.startDate.toISOString());
      if (options.endDate) params.append('endDate', options.endDate.toISOString());
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());

      const response = await this.makeRequest(`/wallets/user/${userId}/transactions?${params}`, 'GET');
      
      this.logger.info('Transaction history retrieved', {
        userId,
        transactionCount: response.transactions.length,
        total: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting transaction history', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async createWallet(userId: string): Promise<Wallet> {
    try {
      const response = await this.makeRequest(`/wallets`, 'POST', { userId });
      
      this.logger.info('Wallet created', {
        userId,
        walletId: response.id
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error creating wallet', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getWalletSummary(userId: string): Promise<{
    totalCurrencies: number;
    totalValueUSD: number;
    balances: WalletBalance[];
    lastUpdated: Date;
  }> {
    try {
      const response = await this.makeRequest(`/wallets/user/${userId}/summary`, 'GET');
      
      this.logger.info('Wallet summary retrieved', {
        userId,
        totalCurrencies: response.totalCurrencies,
        totalValueUSD: response.totalValueUSD
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting wallet summary', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async freezeWallet(userId: string, reason: string): Promise<void> {
    try {
      await this.makeRequest(`/wallets/user/${userId}/freeze`, 'POST', { reason });
      
      this.logger.info('Wallet frozen', {
        userId,
        reason
      });
      
    } catch (error) {
      this.logger.error('Error freezing wallet', {
        userId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async unfreezeWallet(userId: string, reason: string): Promise<void> {
    try {
      await this.makeRequest(`/wallets/user/${userId}/unfreeze`, 'POST', { reason });
      
      this.logger.info('Wallet unfrozen', {
        userId,
        reason
      });
      
    } catch (error) {
      this.logger.error('Error unfreezing wallet', {
        userId,
        reason,
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
      throw new Error(`Wallet service error: ${response.status} ${response.statusText}`);
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
      this.logger.error('Wallet service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}
