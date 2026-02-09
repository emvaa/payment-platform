import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';

import { Logger } from './utils/Logger';
import { DatabasePool } from './config/database';
import { PaymentService } from './services/PaymentService';
import { PaymentRepository } from './repositories/PaymentRepository';
import { PaymentLinkRepository } from './repositories/PaymentLinkRepository';
import { IdempotencyService } from './services/IdempotencyService';
import { FraudService } from './services/FraudService';
import { LedgerService } from './services/LedgerService';
import { WalletService } from './services/WalletService';
import { NotificationService } from './services/NotificationService';
import { createClient } from 'redis';
import type { Request, Response, NextFunction } from 'express';
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

const logger = new Logger('payment-service');
const databasePool = new DatabasePool();
const paymentRepository = new PaymentRepository(databasePool, logger);
const paymentLinkRepository = new PaymentLinkRepository(databasePool, logger);
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(() => {});
const idempotencyService = new IdempotencyService(redisClient as any, logger);
const fraudService = new FraudService(logger);
const ledgerService = new LedgerService(logger);
const walletService = new WalletService(logger);
const notificationService = new NotificationService(logger);
const paymentService = new PaymentService({
  paymentRepository,
  paymentLinkRepository,
  idempotencyService,
  fraudService,
  ledgerService,
  walletService,
  notificationService,
  logger
});

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-request-id'] as string || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    correlationId,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'payment-service',
    version: process.env.APP_VERSION || '1.0.0',
    uptime: process.uptime()
  });
});

// Readiness check endpoint
app.get('/ready', async (req, res) => {
  try {
    const dbHealthy = await databasePool.healthCheck();
    const fraudHealthy = await fraudService.healthCheck();
    const ledgerHealthy = await ledgerService.healthCheck();
    const walletHealthy = await walletService.healthCheck();
    
    const isReady = dbHealthy && fraudHealthy && ledgerHealthy && walletHealthy;
    
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy,
        fraudService: fraudHealthy,
        ledgerService: ledgerHealthy,
        walletService: walletHealthy
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Payment routes
app.post('/api/v1/payments', async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payment request',
          details: { errors: errors.array() }
        },
        correlationId: req.correlationId,
        timestamp: new Date()
      });
    }

    const result = await paymentService.createPayment(req.body);
    
    res.status(201).json({
      ...result,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error creating payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.get('/api/v1/payments', async (req, res) => {
  try {
    const options = {
      filters: {
        userId: req.query.userId as string,
        state: req.query.state as string,
        type: req.query.type as string,
        currency: req.query.currency as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined
      },
      sort: {
      field: (req.query.sort as string) || 'created_at',
        direction: ((req.query.direction as string) === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC'
      },
      pagination: {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20
      }
    };

    const result = await paymentRepository.findMany(options);
    
    res.json({
      success: true,
      data: (result as any).items || [],
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error getting payments', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.get('/api/v1/payments/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await paymentService.getPayment(paymentId);
    
    if (!result.success && result.error?.code === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json(result);
    }
    
    res.json({
      ...result,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error getting payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: req.params.paymentId,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.post('/api/v1/payments/:paymentId/process', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await paymentService.processPayment(paymentId);
    
    res.json({
      ...result,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error processing payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: req.params.paymentId,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

// Wallet development deposit (admin-only)
app.post('/api/v1/wallets/:userId/deposit', async (req: Request, res: Response) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || '';
    const headerEmail = (req.headers['x-admin-email'] as string) || '';
    if (!adminEmail || headerEmail !== adminEmail) {
      return res.status(403).json({
        success: false,
        error: { code: 'ADMIN_REQUIRED', message: 'Solo el admin puede depositar fondos de desarrollo' },
        correlationId: req.correlationId,
        timestamp: new Date()
      });
    }
    const { userId } = req.params;
    const amountRaw = req.body?.amount;
    const currency = (req.body?.currency as string) || 'PYG';
    const description = (req.body?.description as string) || 'Depósito de desarrollo';
    const idempotencyKey = (req.body?.idempotencyKey as string) || uuidv4();
    const amount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw));
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Monto inválido para depósito' },
        correlationId: req.correlationId,
        timestamp: new Date()
      });
    }
    const balance = await walletService.credit(
      userId,
      { amount, currency, precision: 0 },
      idempotencyKey,
      description
    );
    return res.json({
      success: true,
      data: {
        userId,
        amount,
        currency,
        newBalance: balance.available
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error in dev deposit', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'No se pudo depositar' },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.post('/api/v1/payments/:paymentId/confirm', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { confirmationCode } = req.body;
    
    const result = await paymentService.confirmPayment(paymentId, confirmationCode);
    
    res.json({
      ...result,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error confirming payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: req.params.paymentId,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.post('/api/v1/payments/:paymentId/authorize', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await paymentService.authorizePayment(paymentId);
    res.json({ ...result, correlationId: req.correlationId, timestamp: new Date() });
  } catch (error) {
    logger.error('Error authorizing payment', { error: error instanceof Error ? error.message : 'Unknown error', paymentId: req.params.paymentId, correlationId: req.correlationId });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId: req.correlationId, timestamp: new Date() });
  }
});

app.post('/api/v1/payments/:paymentId/capture', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await paymentService.capturePayment(paymentId);
    res.json({ ...result, correlationId: req.correlationId, timestamp: new Date() });
  } catch (error) {
    logger.error('Error capturing payment', { error: error instanceof Error ? error.message : 'Unknown error', paymentId: req.params.paymentId, correlationId: req.correlationId });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId: req.correlationId, timestamp: new Date() });
  }
});

app.post('/api/v1/payments/:paymentId/refund', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await paymentService.refundPayment(paymentId);
    res.json({ ...result, correlationId: req.correlationId, timestamp: new Date() });
  } catch (error) {
    logger.error('Error refunding payment', { error: error instanceof Error ? error.message : 'Unknown error', paymentId: req.params.paymentId, correlationId: req.correlationId });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId: req.correlationId, timestamp: new Date() });
  }
});

app.post('/api/v1/payments/:paymentId/chargeback', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const result = await paymentService.chargebackPayment(paymentId, reason || 'Chargeback');
    res.json({ ...result, correlationId: req.correlationId, timestamp: new Date() });
  } catch (error) {
    logger.error('Error chargeback payment', { error: error instanceof Error ? error.message : 'Unknown error', paymentId: req.params.paymentId, correlationId: req.correlationId });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, correlationId: req.correlationId, timestamp: new Date() });
  }
});
app.post('/api/v1/payments/:paymentId/cancel', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    
    const result = await paymentService.cancelPayment(paymentId, reason);
    
    res.json({
      ...result,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error cancelling payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: req.params.paymentId,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

// Payment links routes
app.post('/api/v1/payment-links', async (req, res) => {
  try {
    const body = req.body || {};
    const normalized = {
      merchantId: body.merchantId || body.receiverId,
      amount: typeof body.amount === 'object' && body.amount !== null
        ? body.amount
        : { amount: parseFloat(body.amount), currency: body.currency || 'PYG', precision: 0 },
      description: body.description,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      maxUses: body.maxUses,
      isActive: body.isActive,
      singleUse: !!body.singleUse
    };
    const result = await paymentService.createPaymentLink(normalized);
    
    res.status(201).json({
      success: result.success,
      data: result.success && result.data ? {
        id: result.data.id,
        merchantId: result.data.merchantId,
        amount: result.data.amount.amount,
        currency: result.data.amount.currency,
        description: result.data.description,
        url: (result.data as any).url,
        isActive: (result.data as any).isActive,
        currentUses: (result.data as any).currentUses,
        createdAt: result.timestamp
      } : undefined,
      error: result.success ? undefined : result.error,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error creating payment link', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.post('/api/v1/payment-links/:linkId/pay', async (req, res) => {
  try {
    const { linkId } = req.params;
    const body = req.body || {};
    const mapped = {
      payerId: body.payerId || body.senderId,
      idempotencyKey: body.idempotencyKey,
      metadata: body.metadata
    };
    const result = await paymentService.payViaLink(linkId, mapped);
    
    res.status(201).json({
      ...result,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error paying via link', {
      error: error instanceof Error ? error.message : 'Unknown error',
      linkId: req.params.linkId,
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.get('/api/v1/payment-links/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const link = await paymentLinkRepository.findById(linkId);
    if (!link) {
      return res.status(404).json({
        success: false,
        error: { code: 'LINK_NOT_FOUND', message: 'Payment link not found' },
        correlationId: req.correlationId,
        timestamp: new Date()
      });
    }
    res.json({
      success: true,
      data: {
        id: link.id,
        merchantId: link.merchantId,
        amount: link.amount.amount,
        currency: link.amount.currency,
        description: link.description,
        url: (link as any).url,
        isActive: (link as any).isActive,
        currentUses: (link as any).currentUses,
        createdAt: link.createdAt
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error getting payment link', {
      error: error instanceof Error ? error.message : 'Unknown error',
      linkId: req.params.linkId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

// Wallet passthrough endpoints for frontend
app.get('/api/v1/wallets/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const currency = (req.query.currency as string) || 'PYG';
    const balance = await walletService.getBalance(userId, currency);
    
    res.json({
      success: true,
      data: {
        userId,
        currency,
        available: balance.available.amount,
        held: balance.held.amount,
        pending: balance.pending.amount,
        total: balance.total.amount
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error getting wallet balance', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.params.userId,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: {
        userId: req.params.userId,
        currency: (req.query.currency as string) || 'PYG',
        available: 10000,
        held: 0,
        pending: 0,
        total: 10000
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.get('/api/v1/wallets/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const currency = req.query.currency as string | undefined;
    const history = await walletService.getTransactionHistory(userId, { currency });
    
    res.json({
      success: true,
      data: history.transactions || [],
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error getting wallet transactions', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.params.userId,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: [],
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

app.post('/api/v1/wallets/:userId/deposit', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, currency, description } = req.body || {};
    const money = typeof amount === 'object' && amount !== null
      ? amount
      : { amount: parseFloat(amount), currency: currency || 'PYG', precision: 0 };
    await ledgerService.createCreditEntry(userId, money, `dep_${Date.now()}`, description || 'Deposit');
    const balance = await walletService.credit(userId, money, `dep_${Date.now()}`, description || 'Deposit');
    res.status(201).json({
      success: true,
      data: {
        available: balance.available.amount,
        held: balance.held.amount,
        pending: balance.pending.amount,
        total: balance.total.amount
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Error depositing to wallet', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.params.userId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

// Statistics endpoint
app.get('/api/v1/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await paymentRepository.getStats(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    
    res.json({
      success: true,
      data: stats,
      correlationId: req.correlationId,
      timestamp: new Date()
    });
    
  } catch (error) {
    logger.error('Error getting stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId: req.correlationId,
      timestamp: new Date()
    });
  }
});

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    correlationId: req.correlationId
  });
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    },
    correlationId: req.correlationId,
    timestamp: new Date()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    },
    correlationId: req.correlationId,
    timestamp: new Date()
  });
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  logger.info(`Payment service started on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Payment service stopped');
    databasePool.close();
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Payment service stopped');
    databasePool.close();
  });
});

export default app;
