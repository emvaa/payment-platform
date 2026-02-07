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
import { IdempotencyService } from './services/IdempotencyService';
import { FraudService } from './services/FraudService';
import { LedgerService } from './services/LedgerService';
import { WalletService } from './services/WalletService';
import { NotificationService } from './services/NotificationService';

const logger = new Logger('payment-service');
const databasePool = new DatabasePool();
const paymentRepository = new PaymentRepository(databasePool, logger);
const idempotencyService = new IdempotencyService(null as any, logger); // Will be initialized with Redis
const fraudService = new FraudService(logger);
const ledgerService = new LedgerService(logger);
const walletService = new WalletService(logger);
const notificationService = new NotificationService(logger);
const paymentService = new PaymentService({
  paymentRepository,
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
  origin: process.env.CORS_ORIGIN || 'http://localhost:3010',
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
        field: req.query.sort as string || 'created_at',
        direction: req.query.direction as string || 'DESC'
      },
      pagination: {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20
      }
    };

    const result = await paymentRepository.findMany(options);
    
    res.json({
      success: true,
      data: result,
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
    const result = await paymentService.createPaymentLink(req.body);
    
    res.status(201).json({
      ...result,
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

app.get('/api/v1/payment-links/:linkId/pay', async (req, res) => {
  try {
    const { linkId } = req.params;
    const result = await paymentService.payViaLink(linkId, req.body);
    
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
app.use((error: any, req, res, next) => {
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
