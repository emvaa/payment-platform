import { Payment, PaymentDTO, PaymentState, PaymentType, Money, ApiResponse, PaymentHold, PaginatedResponse, FilterOptions, SortOptions, PaymentLink } from '../models/types';
import { PaymentModel } from '../models/Payment';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { PaymentLinkRepository } from '../repositories/PaymentLinkRepository';
import { IdempotencyService } from './IdempotencyService';
import { FraudService } from './FraudService';
import { LedgerService } from './LedgerService';
import { WalletService } from './WalletService';
import { NotificationService } from './NotificationService';
import { Logger } from '../utils/Logger';
import { MerchantWebhookService } from './MerchantWebhookService';
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
  private paymentLinkRepository?: PaymentLinkRepository;
  private idempotencyService: IdempotencyService;
  private fraudService: FraudService;
  private ledgerService: LedgerService;
  private walletService: WalletService;
  private notificationService: NotificationService;
  private logger: Logger;
  private merchantWebhookService: MerchantWebhookService;

  constructor(dependencies: {
    paymentRepository: PaymentRepository;
    paymentLinkRepository?: PaymentLinkRepository;
    idempotencyService: IdempotencyService;
    fraudService: FraudService;
    ledgerService: LedgerService;
    walletService: WalletService;
    notificationService: NotificationService;
    logger: Logger;
  }) {
    this.paymentRepository = dependencies.paymentRepository;
    this.paymentLinkRepository = dependencies.paymentLinkRepository;
    this.idempotencyService = dependencies.idempotencyService;
    this.fraudService = dependencies.fraudService;
    this.ledgerService = dependencies.ledgerService;
    this.walletService = dependencies.walletService;
    this.notificationService = dependencies.notificationService;
    this.logger = dependencies.logger;
    this.merchantWebhookService = new MerchantWebhookService(this.logger);
  }

  public async createPayment(request: CreatePaymentRequest): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    
    try {
      this.logger.info('Creating payment', {
        correlationId,
        senderId: request.senderId,
        amount: request.amount,
        idempotencyKey: request.idempotencyKey
      });

      let existingResult: any = null;
      try {
        if (this.idempotencyService && (this.idempotencyService as any).check) {
          existingResult = await this.idempotencyService.check(request.idempotencyKey);
        }
      } catch {}
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
        
        const savedPayment = await this.paymentRepository.create(payment);
        try {
          if (this.idempotencyService && (this.idempotencyService as any).store) {
            await this.idempotencyService.store(request.idempotencyKey, savedPayment.toJSON());
          }
        } catch {}
        
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
      const savedPayment = await this.paymentRepository.create(payment);
      
      // Store idempotency result
      try {
        if (this.idempotencyService && (this.idempotencyService as any).store) {
          await this.idempotencyService.store(request.idempotencyKey, savedPayment.toJSON());
        }
      } catch {}

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

  public async processPayment(paymentId: string): Promise<ApiResponse<PaymentDTO>> {
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
        await this.paymentRepository.update(payment);
        
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
      await this.paymentRepository.update(payment);

      const hasBalance = await this.walletService.hasSufficientBalance(payment.senderId, payment.amount);
      if (!hasBalance) {
        payment.transitionTo(PaymentState.FAILED, 'Insufficient funds');
        await this.paymentRepository.update(payment);
        
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
        const completedPayment = await this.paymentRepository.update(payment);

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
        await this.paymentRepository.update(payment);
        
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

  public async confirmPayment(paymentId: string, confirmationCode: string): Promise<ApiResponse<PaymentDTO>> {
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

  public async authorizePayment(paymentId: string): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return { success: false, error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }, correlationId, timestamp: new Date() };
      }
      if (!payment.canTransitionTo(PaymentState.PENDING_CONFIRMATION)) {
        return { success: false, error: { code: 'INVALID_STATE', message: `Cannot authorize payment in state: ${payment.state}` }, correlationId, timestamp: new Date() };
      }
      const hasBalance = await this.walletService.hasSufficientBalance(payment.senderId, payment.amount);
      if (!hasBalance) {
        payment.transitionTo(PaymentState.FAILED, 'Insufficient funds');
        const saved = await this.paymentRepository.update(payment);
        await this.notificationService.sendPaymentFailedNotification(saved, 'Insufficient funds');
        return { success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds in wallet' }, correlationId, timestamp: new Date() };
      }
      const holdId = `hold_${payment.id}`;
      await this.ledgerService.createHoldEntry(payment.senderId, payment.amount, payment.id, 'Authorization');
      await this.walletService.holdFunds(payment.senderId, payment.amount, holdId, 'Authorization');
      payment.addHold({ id: holdId, paymentId: payment.id, amount: payment.amount, reason: 'Authorization', isReleased: false, createdAt: new Date() });
      payment.transitionTo(PaymentState.PENDING_CONFIRMATION);
      const saved = await this.paymentRepository.update(payment);
      await this.notificationService.sendVerificationCodeNotification(saved.senderId, saved.confirmationCode as string, saved.id);
      return { success: true, data: saved.toJSON(), correlationId, timestamp: new Date() };
    } catch (error) {
      this.logger.error('Error authorizing payment', { correlationId, paymentId, error: error instanceof Error ? error.message : 'Unknown error' });
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId, timestamp: new Date() };
    }
  }

  public async capturePayment(paymentId: string): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return { success: false, error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }, correlationId, timestamp: new Date() };
      }
      if (payment.state !== PaymentState.PENDING_CONFIRMATION) {
        return { success: false, error: { code: 'INVALID_STATE', message: `Cannot capture payment in state: ${payment.state}` }, correlationId, timestamp: new Date() };
      }
      await this.walletService.releaseHeldFunds(payment.senderId, `hold_${payment.id}`);
      await this.ledgerService.createDebitEntry(payment.senderId, payment.amount, payment.id, 'Capture');
      await this.walletService.debit(payment.senderId, payment.amount, payment.id);
      if (payment.receiverId) {
        await this.ledgerService.createCreditEntry(payment.receiverId, payment.amount, payment.id, 'Capture');
        await this.walletService.credit(payment.receiverId, payment.amount, payment.id);
      }
      payment.transitionTo(PaymentState.COMPLETED);
      const completed = await this.paymentRepository.update(payment);
      await this.notificationService.sendPaymentCompletedNotification(completed);
      if (completed.receiverId) {
        await this.merchantWebhookService.sendEvent(completed.receiverId, 'payment.completed', completed.toJSON());
      }
      return { success: true, data: completed.toJSON(), correlationId, timestamp: new Date() };
    } catch (error) {
      this.logger.error('Error capturing payment', { correlationId, paymentId, error: error instanceof Error ? error.message : 'Unknown error' });
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId, timestamp: new Date() };
    }
  }

  public async refundPayment(paymentId: string): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return { success: false, error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }, correlationId, timestamp: new Date() };
      }
      if (!payment.canBeRefunded()) {
        return { success: false, error: { code: 'INVALID_STATE', message: 'Payment cannot be refunded' }, correlationId, timestamp: new Date() };
      }
      if (payment.receiverId) {
        await this.ledgerService.createReversalEntry(payment.receiverId, payment.amount, payment.id, 'Refund');
        await this.walletService.debit(payment.receiverId, payment.amount, payment.id, 'Refund');
      }
      await this.ledgerService.createCreditEntry(payment.senderId, payment.amount, payment.id, 'Refund');
      await this.walletService.credit(payment.senderId, payment.amount, payment.id, 'Refund');
      payment.transitionTo(PaymentState.REFUNDED, 'Refunded');
      const refunded = await this.paymentRepository.update(payment);
      await this.notificationService.sendPaymentCompletedNotification(refunded);
      await this.merchantWebhookService.sendEvent(refunded.receiverId || '', 'payment.refunded', refunded.toJSON());
      return { success: true, data: refunded.toJSON(), correlationId, timestamp: new Date() };
    } catch (error) {
      this.logger.error('Error refunding payment', { correlationId, paymentId, error: error instanceof Error ? error.message : 'Unknown error' });
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId, timestamp: new Date() };
    }
  }

  public async chargebackPayment(paymentId: string, reason: string): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return { success: false, error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }, correlationId, timestamp: new Date() };
      }
      if (payment.state !== PaymentState.COMPLETED) {
        return { success: false, error: { code: 'INVALID_STATE', message: 'Payment cannot be charged back' }, correlationId, timestamp: new Date() };
      }
      if (payment.receiverId) {
        await this.ledgerService.createReversalEntry(payment.receiverId, payment.amount, payment.id, 'Chargeback');
        await this.walletService.debit(payment.receiverId, payment.amount, payment.id, 'Chargeback');
      }
      await this.ledgerService.createCreditEntry(payment.senderId, payment.amount, payment.id, 'Chargeback');
      await this.walletService.credit(payment.senderId, payment.amount, payment.id, 'Chargeback');
      payment.transitionTo(PaymentState.CHARGEBACK, reason || 'Chargeback');
      const cb = await this.paymentRepository.update(payment);
      await this.notificationService.sendPaymentFailedNotification(cb, 'Chargeback');
      await this.merchantWebhookService.sendEvent(cb.receiverId || '', 'payment.chargeback', cb.toJSON());
      return { success: true, data: cb.toJSON(), correlationId, timestamp: new Date() };
    } catch (error) {
      this.logger.error('Error chargeback payment', { correlationId, paymentId, error: error instanceof Error ? error.message : 'Unknown error' });
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId, timestamp: new Date() };
    }
  }

  public async getPayment(paymentId: string): Promise<ApiResponse<PaymentDTO>> {
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

  public async cancelPayment(paymentId: string, reason?: string): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    try {
      this.logger.info('Cancelling payment', { correlationId, paymentId });
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return {
          success: false,
          error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (!payment.canTransitionTo(PaymentState.CANCELLED)) {
        return {
          success: false,
          error: { code: 'INVALID_STATE', message: `Cannot cancel payment in state: ${payment.state}` },
          correlationId,
          timestamp: new Date()
        };
      }
      payment.transitionTo(PaymentState.CANCELLED, reason || 'Cancelled');
      const saved = await this.paymentRepository.update(payment);
      await this.notificationService.sendPaymentFailedNotification(saved, reason || 'Cancelled');
      return {
        success: true,
        data: saved.toJSON(),
        correlationId,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Error cancelling payment', {
        correlationId,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        correlationId,
        timestamp: new Date()
      };
    }
  }

  public async createPaymentLink(request: {
    merchantId: string;
    amount: Money;
    description?: string;
    expiresAt?: Date;
    maxUses?: number;
    isActive?: boolean;
    singleUse?: boolean;
  }): Promise<ApiResponse<PaymentLink>> {
    const correlationId = uuidv4();
    try {
      const isActive = request.isActive !== undefined ? request.isActive : true;
      if (!this.paymentLinkRepository) {
        return {
          success: false,
          error: { code: 'LINKS_UNAVAILABLE', message: 'Payment link repository not configured' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (!request.merchantId || !request.amount || request.amount.amount <= 0) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payment link request' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (request.expiresAt && request.expiresAt <= new Date()) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Expiration must be in the future' },
          correlationId,
          timestamp: new Date()
        };
      }
      const link = await this.paymentLinkRepository.create({
        merchantId: request.merchantId,
        amount: request.amount,
        description: request.description,
        expiresAt: request.expiresAt,
        maxUses: request.maxUses,
        isActive,
        singleUse: request.singleUse || false
      });
      return {
        success: true,
        data: link,
        correlationId,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Error creating payment link', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        correlationId,
        timestamp: new Date()
      };
    }
  }

  public async payViaLink(linkId: string, body: {
    payerId: string;
    idempotencyKey: string;
    metadata?: Record<string, any>;
  }): Promise<ApiResponse<PaymentDTO>> {
    const correlationId = uuidv4();
    try {
      if (!this.paymentLinkRepository) {
        return {
          success: false,
          error: { code: 'LINKS_UNAVAILABLE', message: 'Payment link repository not configured' },
          correlationId,
          timestamp: new Date()
        };
      }
      const link = await this.paymentLinkRepository.findById(linkId);
      if (!link) {
        return {
          success: false,
          error: { code: 'LINK_NOT_FOUND', message: 'Payment link not found' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (!link.isActive) {
        return {
          success: false,
          error: { code: 'LINK_INACTIVE', message: 'Payment link is inactive' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
        await this.paymentLinkRepository.deactivate(link.id);
        return {
          success: false,
          error: { code: 'LINK_EXPIRED', message: 'Payment link has expired' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (link.maxUses && link.currentUses >= link.maxUses) {
        await this.paymentLinkRepository.deactivate(link.id);
        return {
          success: false,
          error: { code: 'LINK_MAX_USES', message: 'Payment link usage limit reached' },
          correlationId,
          timestamp: new Date()
        };
      }
      if (body.payerId === link.merchantId) {
        return {
          success: false,
          error: { code: 'SELF_PAYMENT_NOT_ALLOWED', message: 'Merchant cannot pay own link' },
          correlationId,
          timestamp: new Date()
        };
      }
      const idempKey = `${link.id}:${body.payerId}:${body.idempotencyKey}`;
      let existingResult: any = null;
      try {
        existingResult = await this.idempotencyService.check(idempKey);
      } catch {}
      if (existingResult) {
        return {
          success: true,
          data: existingResult,
          correlationId,
          timestamp: new Date()
        };
      }
      const payment = new PaymentModel({
        type: PaymentType.PAYMENT_LINK,
        amount: link.amount,
        senderId: body.payerId,
        receiverId: link.merchantId,
        description: link.description,
        metadata: { ...(body.metadata || {}), linkId: link.id, url: link.url },
        idempotencyKey: idempKey
      });
      const modelErrors = payment.validate();
      if (modelErrors.length > 0) {
        return {
          success: false,
          error: { code: 'MODEL_VALIDATION_ERROR', message: 'Invalid payment data', details: { errors: modelErrors } },
          correlationId,
          timestamp: new Date()
        };
      }
      const fraudAssessment = await this.fraudService.assessPayment(payment);
      payment.riskScore = fraudAssessment.score;
      if (fraudAssessment.action === 'REJECT') {
        payment.transitionTo(PaymentState.FAILED, `Fraud detection: ${fraudAssessment.reason}`);
        const saved = await this.paymentRepository.create(payment);
        try {
          await this.idempotencyService.store(idempKey, saved.toJSON());
        } catch {}
        await this.notificationService.sendPaymentFailedNotification(saved, fraudAssessment.reason);
        return {
          success: false,
          error: { code: 'FRAUD_DETECTED', message: 'Payment rejected due to fraud detection' },
          correlationId,
          timestamp: new Date()
        };
      }
      const hasBalance = await this.walletService.hasSufficientBalance(payment.senderId, payment.amount);
      if (!hasBalance) {
        payment.transitionTo(PaymentState.FAILED, 'Insufficient funds');
        const saved = await this.paymentRepository.create(payment);
        try {
          await this.idempotencyService.store(idempKey, saved.toJSON());
        } catch {}
        await this.notificationService.sendPaymentFailedNotification(saved, 'Insufficient funds');
        return {
          success: false,
          error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds in wallet' },
          correlationId,
          timestamp: new Date()
        };
      }
      payment.transitionTo(PaymentState.PROCESSING);
      await this.paymentRepository.create(payment);
      await this.ledgerService.createDebitEntry(payment.senderId, payment.amount, payment.id, 'Payment link');
      await this.walletService.debit(payment.senderId, payment.amount, payment.id);
      await this.ledgerService.createCreditEntry(payment.receiverId as string, payment.amount, payment.id, 'Payment link');
      await this.walletService.credit(payment.receiverId as string, payment.amount, payment.id);
      payment.transitionTo(PaymentState.COMPLETED);
      const completedPayment = await this.paymentRepository.update(payment);
      if (link.singleUse || (link.maxUses && link.currentUses + 1 >= link.maxUses)) {
        await this.paymentLinkRepository.deactivate(link.id);
      } else {
        await this.paymentLinkRepository.incrementUse(link.id);
      }
      await this.notificationService.sendPaymentCompletedNotification(completedPayment);
      try {
        await this.idempotencyService.store(idempKey, completedPayment.toJSON());
      } catch {}
      return {
        success: true,
        data: completedPayment.toJSON(),
        correlationId,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Error paying via link', {
        correlationId,
        linkId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        correlationId,
        timestamp: new Date()
      };
    }
  }
}
