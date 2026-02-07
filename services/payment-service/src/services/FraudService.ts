import { Payment } from '../../../../shared/types';
import { Logger } from '../utils/Logger';

export interface FraudAssessment {
  id: string;
  userId: string;
  transactionId?: string;
  withdrawalId?: string;
  score: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rules: FraudRuleResult[];
  mlScore?: number;
  action: 'APPROVE' | 'HOLD' | 'REJECT' | 'MANUAL_REVIEW';
  reason: string;
  confidence: number;
  assessmentTimeMs: number;
  createdAt: Date;
  requiresManualReview: boolean;
}

export interface FraudRuleResult {
  ruleName: string;
  triggered: boolean;
  score: number;
  details: Record<string, any>;
}

export interface FraudDetectionRequest {
  userId: string;
  transaction?: any;
  withdrawalRequest?: any;
  context?: Record<string, any>;
  forceAssessment?: boolean;
}

export class FraudService {
  private logger: Logger;
  private baseUrl: string;

  constructor(logger: Logger, fraudServiceUrl?: string) {
    this.logger = logger;
    this.baseUrl = fraudServiceUrl || process.env.ANTI_FRAUD_SERVICE_URL || 'http://localhost:3004';
  }

  async assessPayment(payment: Payment): Promise<FraudAssessment> {
    try {
      const request: FraudDetectionRequest = {
        userId: payment.senderId,
        transaction: {
          id: payment.id,
          type: payment.type,
          amount: payment.amount,
          timestamp: payment.createdAt,
          metadata: payment.metadata
        },
        context: {
          service: 'payment-service',
          operation: 'payment_assessment'
        }
      };

      const response = await this.makeRequest('/assess/payment', 'POST', request);
      
      this.logger.info('Fraud assessment completed', {
        paymentId: payment.id,
        userId: payment.senderId,
        score: response.score,
        riskLevel: response.riskLevel,
        action: response.action
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error assessing payment fraud', {
        paymentId: payment.id,
        userId: payment.senderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // If fraud service fails, we should allow the payment to proceed
      // but log the error for investigation
      return this.getDefaultAssessment(payment.senderId, payment.id);
    }
  }

  async assessWithdrawal(userId: string, withdrawalRequest: any): Promise<FraudAssessment> {
    try {
      const request: FraudDetectionRequest = {
        userId,
        withdrawalRequest,
        context: {
          service: 'payment-service',
          operation: 'withdrawal_assessment'
        }
      };

      const response = await this.makeRequest('/assess/withdrawal', 'POST', request);
      
      this.logger.info('Withdrawal fraud assessment completed', {
        userId,
        score: response.score,
        riskLevel: response.riskLevel,
        action: response.action
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error assessing withdrawal fraud', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return this.getDefaultAssessment(userId, withdrawalRequest.id);
    }
  }

  async recordFailedConfirmation(paymentId: string): Promise<void> {
    try {
      await this.makeRequest('/events/failed-confirmation', 'POST', {
        paymentId,
        timestamp: new Date().toISOString(),
        context: {
          service: 'payment-service',
          operation: 'failed_confirmation'
        }
      });

      this.logger.info('Failed confirmation recorded', {
        paymentId
      });
      
    } catch (error) {
      this.logger.error('Error recording failed confirmation', {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getUserRiskProfile(userId: string): Promise<{
    userId: string;
    baseScore: number;
    transactionHistoryScore: number;
    ageScore: number;
    verificationLevel: string;
    disputeRate: number;
    velocityScore: number;
    lastUpdated: Date;
    totalTransactions: number;
    totalAmount: number;
    averageTransactionAmount: number;
    accountAgeDays: number;
    failedAttempts24h: number;
    riskLevel: string;
  }> {
    try {
      const response = await this.makeRequest(`/users/${userId}/risk-profile`, 'GET');
      
      this.logger.info('User risk profile retrieved', {
        userId,
        baseScore: response.baseScore,
        riskLevel: response.riskLevel
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting user risk profile', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async updateUserRiskProfile(userId: string, newScore: number): Promise<void> {
    try {
      await this.makeRequest(`/users/${userId}/risk-profile`, 'PUT', {
        score: newScore,
        timestamp: new Date().toISOString()
      });

      this.logger.info('User risk profile updated', {
        userId,
        newScore
      });
      
    } catch (error) {
      this.logger.error('Error updating user risk profile', {
        userId,
        newScore,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async addFraudRule(rule: {
    name: string;
    description: string;
    enabled: boolean;
    weight: number;
    conditions: Record<string, any>;
    action: string;
  }): Promise<void> {
    try {
      await this.makeRequest('/rules', 'POST', rule);
      
      this.logger.info('Fraud rule added', {
        ruleName: rule.name,
        enabled: rule.enabled
      });
      
    } catch (error) {
      this.logger.error('Error adding fraud rule', {
        ruleName: rule.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getFraudRules(): Promise<any[]> {
    try {
      const response = await this.makeRequest('/rules', 'GET');
      
      this.logger.info('Fraud rules retrieved', {
        ruleCount: response.length
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting fraud rules', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getFraudStatistics(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalAssessments: number;
    approvedCount: number;
    rejectedCount: number;
    manualReviewCount: number;
    averageScore: number;
    highRiskTransactions: number;
    fraudDetected: number;
    falsePositives: number;
    falseNegatives: number;
    accuracy: number;
    precision: number;
    recall: number;
  }> {
    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate.toISOString());
      if (options.endDate) params.append('endDate', options.endDate.toISOString());

      const response = await this.makeRequest(`/statistics?${params}`, 'GET');
      
      this.logger.info('Fraud statistics retrieved', {
        totalAssessments: response.totalAssessments,
        fraudDetected: response.fraudDetected
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting fraud statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async createFraudAlert(alert: {
    userId: string;
    assessmentId: string;
    alertType: string;
    severity: string;
    title: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.makeRequest('/alerts', 'POST', alert);
      
      this.logger.info('Fraud alert created', {
        userId,
        assessmentId: alert.assessmentId,
        alertType: alert.alertType,
        severity: alert.severity
      });
      
    } catch (error) {
      this.logger.error('Error creating fraud alert', {
        userId,
        assessmentId: alert.assessmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getFraudAlerts(userId?: string): Promise<any[]> {
    try {
      const endpoint = userId ? `/alerts/user/${userId}` : '/alerts';
      const response = await this.makeRequest(endpoint, 'GET');
      
      this.logger.info('Fraud alerts retrieved', {
        userId,
        alertCount: response.length
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting fraud alerts', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async blacklistDevice(deviceFingerprint: string, reason: string): Promise<void> {
    try {
      await this.makeRequest('/blacklist/device', 'POST', {
        fingerprint: deviceFingerprint,
        reason,
        timestamp: new Date().toISOString()
      });

      this.logger.info('Device blacklisted', {
        deviceFingerprint,
        reason
      });
      
    } catch (error) {
      this.logger.error('Error blacklisting device', {
        deviceFingerprint,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async isDeviceBlacklisted(deviceFingerprint: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/blacklist/device/${deviceFingerprint}`, 'GET');
      
      this.logger.info('Device blacklist check', {
        deviceFingerprint,
        isBlacklisted: response.isBlacklisted
      });

      return response.isBlacklisted;
      
    } catch (error) {
      this.logger.error('Error checking device blacklist', {
        deviceFingerprint,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async addWhitelistEntry(entry: {
    type: string;
    value: string;
    reason: string;
    expiresAt?: Date;
  }): Promise<void> {
    try {
      await this.makeRequest('/whitelist', 'POST', entry);
      
      this.logger.info('Whitelist entry added', {
        type: entry.type,
        value: entry.value
      });
      
    } catch (error) {
      this.logger.error('Error adding whitelist entry', {
        type: entry.type,
        value: entry.value,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async isWhitelisted(type: string, value: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/whitelist/${type}/${value}`, 'GET');
      
      this.logger.info('Whitelist check', {
        type,
        value,
        isWhitelisted: response.isWhitelisted
      });

      return response.isWhitelisted;
      
    } catch (error) {
      this.logger.error('Error checking whitelist', {
        type,
        value,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private getDefaultAssessment(userId: string, transactionId: string): FraudAssessment {
    return {
      id: `default_${Date.now()}`,
      userId,
      transactionId,
      score: 0.3, // Low risk default
      riskLevel: 'LOW',
      rules: [],
      mlScore: 0.3,
      action: 'APPROVE',
      reason: 'Fraud service unavailable - using default assessment',
      confidence: 0.5,
      assessmentTimeMs: 0,
      createdAt: new Date(),
      requiresManualReview: false
    };
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
      throw new Error(`Fraud service error: ${response.status} ${response.statusText}`);
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
      this.logger.error('Fraud service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}
