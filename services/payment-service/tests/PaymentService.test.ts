import { PaymentService } from '../src/services/PaymentService';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { IdempotencyService } from '../src/services/IdempotencyService';
import { FraudService } from '../src/services/FraudService';
import { LedgerService } from '../src/services/LedgerService';
import { WalletService } from '../src/services/WalletService';
import { NotificationService } from '../src/services/NotificationService';
import { Logger } from '../src/utils/Logger';

// Mock dependencies
jest.mock('../src/repositories/PaymentRepository');
jest.mock('../src/services/IdempotencyService');
jest.mock('../src/services/FraudService');
jest.mock('../src/services/LedgerService');
jest.mock('../src/services/WalletService');
jest.mock('../src/services/NotificationService');
jest.mock('../src/utils/Logger');

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockPaymentRepository: jest.Mocked<PaymentRepository>;
  let mockIdempotencyService: jest.Mocked<IdempotencyService>;
  let mockFraudService: jest.Mocked<FraudService>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockWalletService: jest.Mocked<WalletService>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockPaymentRepository = new PaymentRepository({} as any, {} as any) as jest.Mocked<PaymentRepository>;
    mockIdempotencyService = new IdempotencyService({} as any, {} as any) as jest.Mocked<IdempotencyService>;
    mockFraudService = new FraudService({} as any) as jest.Mocked<FraudService>;
    mockLedgerService = new LedgerService({} as any) as jest.Mocked<LedgerService>;
    mockWalletService = new WalletService({} as any) as jest.Mocked<WalletService>;
    mockNotificationService = new NotificationService({} as any) as jest.Mocked<NotificationService>;
    mockLogger = new Logger('test') as jest.Mocked<Logger>;

    paymentService = new PaymentService({
      paymentRepository: mockPaymentRepository,
      idempotencyService: mockIdempotencyService,
      fraudService: mockFraudService,
      ledgerService: mockLedgerService,
      walletService: mockWalletService,
      notificationService: mockNotificationService,
      logger: mockLogger
    });
  });

  describe('createPayment', () => {
    it('should create a payment successfully', async () => {
      const paymentData = {
        amount: { amount: 100, currency: 'USD', precision: 2 },
        senderId: 'user-1',
        receiverId: 'user-2',
        type: 'DIRECT_PAYMENT',
        idempotencyKey: 'key-1'
      };

      mockIdempotencyService.checkIdempotency.mockResolvedValue({ exists: false });
      mockFraudService.assessPayment.mockResolvedValue({
        score: 0.2,
        riskLevel: 'LOW',
        action: 'APPROVE',
        requiresManualReview: false
      } as any);
      mockPaymentRepository.create.mockResolvedValue({
        id: 'payment-1',
        ...paymentData,
        state: 'PENDING'
      } as any);

      const result = await paymentService.createPayment(paymentData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockPaymentRepository.create).toHaveBeenCalled();
    });

    it('should return existing payment for duplicate idempotency key', async () => {
      const paymentData = {
        amount: { amount: 100, currency: 'USD', precision: 2 },
        senderId: 'user-1',
        receiverId: 'user-2',
        type: 'DIRECT_PAYMENT',
        idempotencyKey: 'key-1'
      };

      const existingPayment = {
        id: 'payment-1',
        ...paymentData,
        state: 'PENDING'
      };

      mockIdempotencyService.checkIdempotency.mockResolvedValue({
        exists: true,
        data: existingPayment
      });

      const result = await paymentService.createPayment(paymentData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(existingPayment);
    });

    it('should reject payment with high fraud risk', async () => {
      const paymentData = {
        amount: { amount: 1000, currency: 'USD', precision: 2 },
        senderId: 'user-1',
        receiverId: 'user-2',
        type: 'DIRECT_PAYMENT',
        idempotencyKey: 'key-1'
      };

      mockIdempotencyService.checkIdempotency.mockResolvedValue({ exists: false });
      mockFraudService.assessPayment.mockResolvedValue({
        score: 0.9,
        riskLevel: 'HIGH',
        action: 'REJECT',
        requiresManualReview: true,
        reason: 'High risk transaction'
      } as any);

      const result = await paymentService.createPayment(paymentData);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FRAUD_REJECTED');
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const paymentId = 'payment-1';
      const payment = {
        id: paymentId,
        state: 'PENDING',
        senderId: 'user-1',
        receiverId: 'user-2',
        amount: { amount: 100, currency: 'USD' }
      };

      mockPaymentRepository.findById.mockResolvedValue(payment as any);
      mockWalletService.getBalance.mockResolvedValue({
        available: { amount: 500, currency: 'USD' }
      } as any);
      mockWalletService.holdFunds.mockResolvedValue({ success: true });
      mockLedgerService.createDebitEntry.mockResolvedValue({ id: 'entry-1' } as any);
      mockLedgerService.createCreditEntry.mockResolvedValue({ id: 'entry-2' });
      mockPaymentRepository.updateState.mockResolvedValue({
        ...payment,
        state: 'COMPLETED'
      } as any);

      const result = await paymentService.processPayment(paymentId);

      expect(result.success).toBe(true);
      expect(mockWalletService.holdFunds).toHaveBeenCalled();
      expect(mockLedgerService.createDebitEntry).toHaveBeenCalled();
    });

    it('should fail if payment not found', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      const result = await paymentService.processPayment('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('should fail if insufficient funds', async () => {
      const payment = {
        id: 'payment-1',
        state: 'PENDING',
        senderId: 'user-1',
        amount: { amount: 1000, currency: 'USD' }
      };

      mockPaymentRepository.findById.mockResolvedValue(payment as any);
      mockWalletService.getBalance.mockResolvedValue({
        available: { amount: 100, currency: 'USD' }
      } as any);

      const result = await paymentService.processPayment('payment-1');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment with valid code', async () => {
      const payment = {
        id: 'payment-1',
        state: 'PENDING_CONFIRMATION',
        confirmationCode: '123456',
        senderId: 'user-1',
        receiverId: 'user-2',
        amount: { amount: 100, currency: 'USD' }
      };

      mockPaymentRepository.findById.mockResolvedValue(payment as any);
      mockWalletService.holdFunds.mockResolvedValue({ success: true });
      mockLedgerService.createDebitEntry.mockResolvedValue({ id: 'entry-1' } as any);
      mockPaymentRepository.updateState.mockResolvedValue({
        ...payment,
        state: 'COMPLETED'
      } as any);

      const result = await paymentService.confirmPayment('payment-1', '123456');

      expect(result.success).toBe(true);
    });

    it('should fail with invalid confirmation code', async () => {
      const payment = {
        id: 'payment-1',
        state: 'PENDING_CONFIRMATION',
        confirmationCode: '123456'
      };

      mockPaymentRepository.findById.mockResolvedValue(payment as any);

      const result = await paymentService.confirmPayment('payment-1', '999999');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_CONFIRMATION_CODE');
    });
  });

  describe('cancelPayment', () => {
    it('should cancel pending payment', async () => {
      const payment = {
        id: 'payment-1',
        state: 'PENDING',
        senderId: 'user-1'
      };

      mockPaymentRepository.findById.mockResolvedValue(payment as any);
      mockPaymentRepository.updateState.mockResolvedValue({
        ...payment,
        state: 'CANCELLED'
      } as any);

      const result = await paymentService.cancelPayment('payment-1', 'User request');

      expect(result.success).toBe(true);
      expect(result.data?.state).toBe('CANCELLED');
    });

    it('should not cancel completed payment', async () => {
      const payment = {
        id: 'payment-1',
        state: 'COMPLETED',
        senderId: 'user-1'
      };

      mockPaymentRepository.findById.mockResolvedValue(payment as any);

      const result = await paymentService.cancelPayment('payment-1', 'User request');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_STATE_TRANSITION');
    });
  });
});
