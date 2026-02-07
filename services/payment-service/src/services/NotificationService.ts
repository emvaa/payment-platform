import { Logger } from '../utils/Logger';

export interface NotificationRequest {
  userId: string;
  type: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  channel: string;
  subject: string;
  content: string;
  metadata?: Record<string, any>;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  scheduledAt?: Date;
}

export interface NotificationResponse {
  id: string;
  userId: string;
  type: string;
  channel: string;
  subject: string;
  content: string;
  state: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
}

export class NotificationService {
  private logger: Logger;
  private baseUrl: string;

  constructor(logger: Logger, notificationServiceUrl?: string) {
    this.logger = logger;
    this.baseUrl = notificationServiceUrl || process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
  }

  async sendPaymentCreatedNotification(payment: any): Promise<void> {
    try {
      await this.sendNotification({
        userId: payment.senderId,
        type: 'EMAIL',
        channel: 'payment',
        subject: 'Payment Created Successfully',
        content: this.generatePaymentCreatedContent(payment),
        metadata: {
          paymentId: payment.id,
          amount: payment.amount,
          type: payment.type
        }
      });

      this.logger.info('Payment created notification sent', {
        paymentId: payment.id,
        userId: payment.senderId
      });
      
    } catch (error) {
      this.logger.error('Error sending payment created notification', {
        paymentId: payment.id,
        userId: payment.senderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendPaymentCompletedNotification(payment: any): Promise<void> {
    try {
      await this.sendNotification({
        userId: payment.receiverId || payment.senderId,
        type: 'EMAIL',
        channel: 'payment',
        subject: 'Payment Completed',
        content: this.generatePaymentCompletedContent(payment),
        metadata: {
          paymentId: payment.id,
          amount: payment.amount,
          type: payment.type
        }
      });

      this.logger.info('Payment completed notification sent', {
        paymentId: payment.id,
        userId: payment.receiverId || payment.senderId
      });
      
    } catch (error) {
      this.logger.error('Error sending payment completed notification', {
        paymentId: payment.id,
        userId: payment.receiverId || payment.senderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendPaymentFailedNotification(payment: any, reason: string): Promise<void> {
    try {
      await this.sendNotification({
        userId: payment.senderId,
        type: 'EMAIL',
        channel: 'payment',
        subject: 'Payment Failed',
        content: this.generatePaymentFailedContent(payment, reason),
        metadata: {
          paymentId: payment.id,
          amount: payment.amount,
          type: payment.type,
          failureReason: reason
        },
        priority: 'HIGH'
      });

      this.logger.info('Payment failed notification sent', {
        paymentId: payment.id,
        userId: payment.senderId,
        reason
      });
      
    } catch (error) {
      this.logger.error('Error sending payment failed notification', {
        paymentId: payment.id,
        userId: payment.senderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendFraudAlertNotification(userId: string, paymentId: string, riskScore: number, action: string): Promise<void> {
    try {
      await this.sendNotification({
        userId,
        type: 'EMAIL',
        channel: 'fraud',
        subject: 'Security Alert - Suspicious Activity Detected',
        content: this.generateFraudAlertContent(paymentId, riskScore, action),
        metadata: {
          paymentId,
          riskScore,
          action,
          alertType: 'FRAUD_DETECTION'
        },
        priority: 'URGENT'
      });

      this.logger.info('Fraud alert notification sent', {
        userId,
        paymentId,
        riskScore,
        action
      });
      
    } catch (error) {
      this.logger.error('Error sending fraud alert notification', {
        userId,
        paymentId,
        riskScore,
        action,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendVerificationCodeNotification(userId: string, code: string, paymentId: string): Promise<void> {
    try {
      await this.sendNotification({
        userId,
        type: 'SMS',
        channel: 'verification',
        subject: 'Payment Verification Code',
        content: this.generateVerificationCodeContent(code),
        metadata: {
          paymentId,
          verificationCode: code
        },
        priority: 'HIGH'
      });

      this.logger.info('Verification code notification sent', {
        userId,
        paymentId
      });
      
    } catch (error) {
      this.logger.error('Error sending verification code notification', {
        userId,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendLowBalanceNotification(userId: string, currency: string, balance: number): Promise<void> {
    try {
      await this.sendNotification({
        userId,
        type: 'EMAIL',
        channel: 'wallet',
        subject: 'Low Balance Alert',
        content: this.generateLowBalanceContent(currency, balance),
        metadata: {
          currency,
          balance,
          alertType: 'LOW_BALANCE'
        },
        priority: 'MEDIUM'
      });

      this.logger.info('Low balance notification sent', {
        userId,
        currency,
        balance
      });
      
    } catch (error) {
      this.logger.error('Error sending low balance notification', {
        userId,
        currency,
        balance,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendNotification(request: NotificationRequest): Promise<NotificationResponse> {
    try {
      const response = await this.makeRequest('/notifications', 'POST', request);
      
      this.logger.info('Notification sent', {
        notificationId: response.id,
        userId: request.userId,
        type: request.type,
        channel: request.channel
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error sending notification', {
        userId: request.userId,
        type: request.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getNotificationStatus(notificationId: string): Promise<NotificationResponse> {
    try {
      const response = await this.makeRequest(`/notifications/${notificationId}`, 'GET');
      
      this.logger.info('Notification status retrieved', {
        notificationId,
        state: response.state
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting notification status', {
        notificationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getUserNotifications(
    userId: string,
    options: {
      type?: string;
      state?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    notifications: NotificationResponse[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const params = new URLSearchParams();
      if (options.type) params.append('type', options.type);
      if (options.state) params.append('state', options.state);
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());

      const response = await this.makeRequest(`/notifications/user/${userId}?${params}`, 'GET');
      
      this.logger.info('User notifications retrieved', {
        userId,
        notificationCount: response.notifications.length,
        total: response.total
      });

      return response;
      
    } catch (error) {
      this.logger.error('Error getting user notifications', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await this.makeRequest(`/notifications/${notificationId}/read`, 'POST', { userId });
      
      this.logger.info('Notification marked as read', {
        notificationId,
        userId
      });
      
    } catch (error) {
      this.logger.error('Error marking notification as read', {
        notificationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private generatePaymentCreatedContent(payment: any): string {
    return `
      <h2>Payment Created Successfully</h2>
      <p>Your payment has been created and is being processed.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <h3>Payment Details:</h3>
        <p><strong>Payment ID:</strong> ${payment.id}</p>
        <p><strong>Amount:</strong> ${payment.amount.currency} ${payment.amount.amount.toFixed(2)}</p>
        <p><strong>Type:</strong> ${payment.type}</p>
        <p><strong>Status:</strong> ${payment.state}</p>
        ${payment.description ? `<p><strong>Description:</strong> ${payment.description}</p>` : ''}
      </div>
      <p>You can track the status of your payment in your dashboard.</p>
      <p>Thank you for using our payment platform!</p>
    `;
  }

  private generatePaymentCompletedContent(payment: any): string {
    return `
      <h2>Payment Completed</h2>
      <p>Your payment has been successfully completed.</p>
      <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <h3>Payment Details:</h3>
        <p><strong>Payment ID:</strong> ${payment.id}</p>
        <p><strong>Amount:</strong> ${payment.amount.currency} ${payment.amount.amount.toFixed(2)}</p>
        <p><strong>Completed At:</strong> ${new Date(payment.completedAt).toLocaleString()}</p>
      </div>
      <p>The funds have been transferred successfully.</p>
      <p>Thank you for using our payment platform!</p>
    `;
  }

  private generatePaymentFailedContent(payment: any, reason: string): string {
    return `
      <h2>Payment Failed</h2>
      <p>We're sorry, but your payment could not be processed.</p>
      <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <h3>Payment Details:</h3>
        <p><strong>Payment ID:</strong> ${payment.id}</p>
        <p><strong>Amount:</strong> ${payment.amount.currency} ${payment.amount.amount.toFixed(2)}</p>
        <p><strong>Reason:</strong> ${reason}</p>
      </div>
      <p>Please check your payment details and try again.</p>
      <p>If you continue to experience issues, please contact our support team.</p>
    `;
  }

  private generateFraudAlertContent(paymentId: string, riskScore: number, action: string): string {
    return `
      <h2>🚨 Security Alert</h2>
      <p>We have detected suspicious activity on your account.</p>
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <h3>Security Details:</h3>
        <p><strong>Payment ID:</strong> ${paymentId}</p>
        <p><strong>Risk Score:</strong> ${(riskScore * 100).toFixed(1)}%</p>
        <p><strong>Action Taken:</strong> ${action}</p>
      </div>
      <p>If this wasn't you, please secure your account immediately:</p>
      <ul>
        <li>Change your password</li>
        <li>Enable two-factor authentication</li>
        <li>Review your recent transactions</li>
      </ul>
      <p>Contact support immediately if you notice any unauthorized activity.</p>
    `;
  }

  private generateVerificationCodeContent(code: string): string {
    return `
      <h2>Payment Verification Code</h2>
      <p>Your verification code is:</p>
      <div style="background: #007bff; color: white; padding: 20px; font-size: 24px; text-align: center; border-radius: 5px; margin: 20px 0; letter-spacing: 3px;">
        ${code}
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p>Please do not share this code with anyone.</p>
    `;
  }

  private generateLowBalanceContent(currency: string, balance: number): string {
    return `
      <h2>Low Balance Alert</h2>
      <p>Your wallet balance is running low.</p>
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <h3>Balance Details:</h3>
        <p><strong>Currency:</strong> ${currency}</p>
        <p><strong>Current Balance:</strong> ${currency} ${balance.toFixed(2)}</p>
      </div>
      <p>Consider adding funds to your wallet to avoid payment failures.</p>
      <p>You can add funds through your dashboard or mobile app.</p>
    `;
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
      throw new Error(`Notification service error: ${response.status} ${response.statusText}`);
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
      this.logger.error('Notification service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}
