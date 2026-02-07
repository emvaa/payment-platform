import { Payment, PaymentState, PaymentType, Money, ApiResponse } from '../../../../shared/types';
import { PaymentModel } from '../models/Payment';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { IdempotencyService } from './IdempotencyService';
import { FraudService } from './FraudService';
import { LedgerService } from './LedgerService';
import { WalletService } from './WalletService';
import { NotificationService } from './NotificationService';
import { Logger } from '../utils/Logger';
import { v4 as uuidv4 } from 'uuid';

export interface CreatePaymentRequest {
  type: PaymentType;
  amount: Money;
  senderId: string;
  receiverId?: string;
  description?: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
  expiresAt?: Date;
}

export interface UpdatePaymentRequest {
  state?: PaymentState;
  description?: string;
  metadata?: Record<string, any>;
  failureReason?: string;
}

export class PaymentService {
  private paymentRepository: PaymentRepository;
  private idempotencyService: IdempotencyService;
  private fraudService: FraudService;
  private ledgerService: LedgerService;
  private walletService: WalletService;
  private notificationService: NotificationService;
  private logger: Logger;

  constructor(dependencies: {
    paymentRepository: PaymentRepository;
    idempotencyService: IdempotencyService;
    fraudService: FraudService;
    ledgerService: LedgerService;
    walletService: WalletService;
    notificationService: NotificationService;
    logger: Logger;
  }) {
    this.paymentRepository = dependencies.paymentRepository;
    this.idempotencyService = dependencies.idempotencyService;
    this.fraudService = dependencies.fraudService;
    this.ledgerService = dependencies.ledgerService;
    this.walletService = dependencies.walletService;
    this.notificationService = dependencies.notificationService;
    this.logger = dependencies.logger;
  }

  public async createPayment(request: CreatePaymentRequest): Promise<ApiResponse<Payment>> {
    const correlationId = uuidv4();
    
    try {
      this.logger.info('Creating payment', {
        correlationId,
        senderId: request.senderId,
        amount: request.amount,
        idempotencyKey: request.idempotencyKey
      });

      // Check idempotency
      const existingResult = await this.idempotencyService.check(request.idempotencyKey);
      if (existingResult) {
        this.logger.info('Payment already processed', { correlationId, idempotencyKey: request.idempotencyKey });
        return {
          success: true,
          data: existingResult,
          correlationId,
          timestamp: new Date()
        };
      }

      // Validate request
      const validationErrors = this.validateCreateRequest(request);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment request',
            details: { errors: validationErrors }
          },
          correlationId,
          timestamp: new Date()
        };
      }

      // Create payment model
      const payment = new PaymentModel({
        ...request,
        confirmationCode: this.generateConfirmationCode()
      });

      // Validate payment model
      const modelErrors = payment.validate();
      if (modelErrors.length > 0) {
        return {
          success: false,
          error: {
            code: 'MODEL_VALIDATION_ERROR',
            message: 'Invalid payment data',
            details: { errors: modelErrors }
          },
          correlationId,
          timestamp: new Date()
        };
      }

      // Fraud assessment
      const fraudAssessment = await this.fraudService.assessPayment(payment);
      payment.riskScore = fraudAssessment.score;

      if (fraudAssessment.action === 'REJECT') {
        payment.transitionTo(PaymentState.FAILED, `Fraud detection: ${fraudAssessment.reason}`);
        
        const savedPayment = await this.paymentRepository.save(payment);
        await this.idempotencyService.store(request.idempotencyKey, savedPayment.toJSON());
        
        return {
          success: false,
          error: {
            code: 'FRAUD_DETECTED',
            message: 'Payment rejected due to fraud detection',
            details: { reason: fraudAssessment.reason, score: fraudAssessment.score }
          },
          correlationId,
          timestamp: new Date()
        };
      }

      // Hold funds if required
      if (fraudAssessment.action === 'HOLD') {
        const holdAmount = Math.min(payment.amount.amount * 0.1, 1000); // 10% or $1000 max
        payment.addHold({
          id: uuidv4(),
          paymentId: payment.id,
          amount: { ...payment.amount, amount: holdAmount },
          reason: fraudAssessment.reason,
          releaseAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          isReleased: false,
          createdAt: new Date()
        });
      }

      // Save payment
      const savedPayment = await this.paymentRepository.save(payment);
      
      // Store idempotency result
      await this.idempotencyService.store(request.idempotencyKey, savedPayment.toJSON());

      // Send notifications
      await this.notificationService.sendPaymentCreatedNotification(savedPayment);

      this.logger.info('Payment created successfully', {
        correlationId,
        paymentId: savedPayment.id,
        state: savedPayment.state
      });

      return {
        success: true,
        data: savedPayment.toJSON(),
        correlationId,
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Error creating payment', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        },
        correlationId,
        timestamp: new Date()
      };
    }
  }

  public async processPayment(paymentId: string): Promise<ApiResponse<Payment>> {
    const correlationId = uuidv4();
    
    try {
      this.logger.info('Processing payment', { correlationId, paymentId });

      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return {
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found'
          },
          correlationId,
          timestamp: new Date()
        };
      }

      if (!payment.canTransitionTo(PaymentState.PROCESSING)) {
        return {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: `Cannot process payment in state: ${payment.state}`
          },
          correlationId,
          timestamp: new Date()
        };
      }

      // Check if expired
      if (payment.isExpired()) {
        payment.transitionTo(PaymentState.EXPIRED);
        await this.paymentRepository.save(payment);
        
        return {
          success: false,
          error: {
            code: 'PAYMENT_EXPIRED',
            message: 'Payment has expired'
          },
          correlationId,
          timestamp: new Date()
        };
      }

      // Transition to processing
      payment.transitionTo(PaymentState.PROCESSING);
      await this.paymentRepository.save(payment);

      // Check sender wallet balance
      const senderWallet = await this.walletService.getWallet(payment.senderId);
      if (!senderWallet || senderWallet.getAvailableBalance(payment.amount.currency) < payment.amount.amount) {
        payment.transitionTo(PaymentState.FAILED, 'Insufficient funds');
        await this.paymentRepository.save(payment);
        
        return {
          success: false,
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: 'Insufficient funds in wallet'
          },
          correlationId,
          timestamp: new Date()
        };
      }

      // Create ledger entries
      try {
        await this.ledgerService.createDebitEntry(
          payment.senderId,
          payment.amount,
          payment.id,
          'Payment processing'
        );

        if (payment.receiverId) {
          await this.ledgerService.createCreditEntry(
            payment.receiverId,
            payment.amount,
            payment.id,
            'Payment received'
          );
        }

        // Update wallet balances
        await this.walletService.debit(payment.senderId, payment.amount, payment.id);
        
        if (payment.receiverId) {
          await this.walletService.credit(payment.receiverId, payment.amount, payment.id);
        }

        // Complete payment
        payment.transitionTo(PaymentState.COMPLETED);
        const completedPayment = await this.paymentRepository.save(payment);

        // Send notifications
        await this.notificationService.sendPaymentCompletedNotification(completedPayment);

        this.logger.info('Payment processed successfully', {
          correlationId,
          paymentId: completedPayment.id
        });

        return {
          success: true,
          data: completedPayment.toJSON(),
          correlationId,
          timestamp: new Date()
        };

      } catch (ledgerError) {
        payment.transitionTo(PaymentState.FAILED, 'Ledger operation failed');
        await this.paymentRepository.save(payment);
        
        throw ledgerError;
      }

    } catch (error) {
      this.logger.error('Error processing payment', {
        correlationId,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        },
        correlationId,
        timestamp: new Date()
      };
    }
  }

  public async confirmPayment(paymentId: string, confirmationCode: string): Promise<ApiResponse<Payment>> {
    const correlationId = uuidv4();
    
    try {
      this.logger.info('Confirming payment', { correlationId, paymentId });

      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return {
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found'
          },
          correlationId,
          timestamp: new Date()
        };
      }

      if (payment.confirmationCode !== confirmationCode) {
        await this.fraudService.recordFailedConfirmation(paymentId);
        
        return {
          success: false,
          error: {
            code: 'INVALID_CONFIRMATION_CODE',
            message: 'Invalid confirmation code'
          },
          correlationId,
          timestamp: new Date()
        };
      }

      return await this.processPayment(paymentId);

    } catch (error) {
      this.logger.error('Error confirming payment', {
        correlationId,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        },
        correlationId,
        timestamp: new Date()
      };
    }
  }

  public async getPayment(paymentId: string): Promise<ApiResponse<Payment>> {
    const correlationId = uuidv4();
    
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      
      if (!payment) {
        return {
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found'
          },
          correlationId,
          timestamp: new Date()
        };
      }

      return {
        success: true,
        data: payment.toJSON(),
        correlationId,
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Error getting payment', {
        correlationId,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        },
        correlationId,
        timestamp: new Date()
      };
    }
  }

  private validateCreateRequest(request: CreatePaymentRequest): string[] {
    const errors: string[] = [];

    if (!request.type) {
      errors.push('Payment type is required');
    }

    if (!request.amount || request.amount.amount <= 0) {
      errors.push('Valid amount is required');
    }

    if (!request.senderId) {
      errors.push('Sender ID is required');
    }

    if (!request.idempotencyKey) {
      errors.push('Idempotency key is required');
    }

    if (request.expiresAt && request.expiresAt <= new Date()) {
      errors.push('Expiration date must be in the future');
    }

    return errors;
  }

  private generateConfirmationCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}
