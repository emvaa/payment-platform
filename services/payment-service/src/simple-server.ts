import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Mock services for initial run
class MockPaymentService {
  private payments: any[] = [];
  private paymentLinks: any[] = [];
  private defaultCurrency = 'PYG';
  
  async createPayment(data: any) {
    const normalizedAmountValue = typeof data?.amount === 'object' ? data.amount?.amount : data?.amount;
    const normalizedCurrency = (typeof data?.amount === 'object' ? data.amount?.currency : data?.currency) || this.defaultCurrency;
    const payment = {
      id: uuidv4(),
      ...data,
      amount: typeof normalizedAmountValue === 'number' ? normalizedAmountValue : 0,
      currency: normalizedCurrency,
      precision: 0,
      state: 'PENDING',
      createdAt: new Date(),
      created_at: new Date().toISOString(),
      receiver_id: data?.receiverId ?? data?.receiver_id,
    };
    this.payments.push(payment);
    logger.info('Payment created', { paymentId: payment.id });
    return { success: true, data: payment };
  }
  
  async createPaymentLink(data: any) {
    const linkId = uuidv4();
    const normalizedCurrency = data?.currency || this.defaultCurrency;
    const paymentLink = {
      id: linkId,
      url: `http://localhost:5174/pay/${linkId}`,
      amount: data.amount,
      currency: normalizedCurrency,
      precision: 0,
      description: data.description,
      receiverId: data.receiverId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      isActive: true,
      createdAt: new Date(),
      payments: []
    };
    this.paymentLinks.push(paymentLink);
    logger.info('Payment link created', { linkId });
    return { success: true, data: paymentLink };
  }
  
  async getPaymentLink(id: string) {
    const link = this.paymentLinks.find(l => l.id === id);
    if (!link) return { success: false, error: 'Link not found' };
    if (!link.isActive) return { success: false, error: 'Link is not active' };
    if (new Date() > link.expiresAt) return { success: false, error: 'Link has expired' };
    return { success: true, data: link };
  }
  
  async payThroughLink(linkId: string, payerData: any) {
    const linkResult = await this.getPaymentLink(linkId);
    if (!linkResult.success) return linkResult;
    
    const payment = await this.createPayment({
      amount: linkResult.data.amount,
      currency: linkResult.data.currency,
      senderId: payerData.senderId,
      receiverId: linkResult.data.receiverId,
      description: `Payment via link: ${linkResult.data.description}`,
      type: 'PAYMENT_LINK',
      linkId: linkId
    });
    
    if (payment.success) {
      linkResult.data.payments.push(payment.data);
      await this.processPayment(payment.data.id);
    }
    
    return payment;
  }
  
  async listPaymentLinks() {
    return { success: true, data: this.paymentLinks };
  }
  
  async getPayment(id: string) {
    const payment = this.payments.find(p => p.id === id);
    return payment ? { success: true, data: payment } : { success: false, error: 'Not found' };
  }
  
  async processPayment(id: string) {
    const payment = this.payments.find(p => p.id === id);
    if (payment) {
      payment.state = 'COMPLETED';
      payment.completedAt = new Date();
      return { success: true, data: payment };
    }
    return { success: false, error: 'Not found' };
  }
  
  async listPayments() {
    return { success: true, data: this.payments };
  }
}

const paymentService = new MockPaymentService();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    const allowed = new Set([
      'http://localhost:5174',
      'http://localhost:5173',
      'http://localhost:3010',
    ]);
    if (!origin) return cb(null, true);
    if (allowed.has(origin)) return cb(null, true);
    return cb(null, true);
  },
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'payment-service', timestamp: new Date().toISOString() });
});

app.get('/ready', (req, res) => {
  res.json({ status: 'ready', service: 'payment-service' });
});

// Payment routes
app.post('/api/v1/payments', async (req, res) => {
  try {
    const result = await paymentService.createPayment(req.body);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating payment', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

app.get('/api/v1/payments/:id', async (req, res) => {
  try {
    const result = await paymentService.getPayment(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Error getting payment', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

app.post('/api/v1/payments/:id/process', async (req, res) => {
  try {
    const result = await paymentService.processPayment(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Error processing payment', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

app.get('/api/v1/payments', async (req, res) => {
  try {
    const result = await paymentService.listPayments();
    res.json(result);
  } catch (error) {
    logger.error('Error listing payments', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Payment Links routes
app.post('/api/v1/payment-links', async (req, res) => {
  try {
    const result = await paymentService.createPaymentLink(req.body);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating payment link', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

app.get('/api/v1/payment-links', async (req, res) => {
  try {
    const result = await paymentService.listPaymentLinks();
    res.json(result);
  } catch (error) {
    logger.error('Error listing payment links', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

app.get('/api/v1/payment-links/:id', async (req, res) => {
  try {
    const result = await paymentService.getPaymentLink(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Error getting payment link', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

app.post('/api/v1/payment-links/:id/pay', async (req, res) => {
  try {
    const result = await paymentService.payThroughLink(req.params.id, req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error paying through link', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Payment Service running on port ${PORT}`);
  console.log(`Payment Service running on http://localhost:${PORT}`);
});
