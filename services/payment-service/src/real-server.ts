import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

// Database setup
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-payment',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'payment_service',
  user: process.env.DB_USER || 'payment_user',
  password: process.env.DB_PASSWORD || 'postgres',
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    const allowed = ['http://localhost:5174', 'http://localhost:5173', 'http://localhost:3010'];
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(null, true); // Allow all for dev
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
  message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' }
});
app.use('/api/', limiter);

// Request ID middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-request-id'] as string || uuidv4();
  (req as any).correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'payment-service',
    version: '2.0.0-real',
    uptime: process.uptime()
  });
});

// ============== WALLET API ==============

// Get wallet balance
app.get('/api/v1/wallets/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const currency = req.query.currency as string || 'PYG';
    
    const result = await pool.query(
      'SELECT available, held, pending, (available + held + pending) as total FROM wallet_balances WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $1) AND currency = $2',
      [userId, currency]
    );
    
    if (result.rows.length === 0) {
      // Create wallet if doesn't exist
      const walletResult = await pool.query(
        'INSERT INTO wallets (user_id) VALUES ($1) RETURNING id',
        [userId]
      );
      const walletId = walletResult.rows[0].id;
      
      await pool.query(
        'INSERT INTO wallet_balances (wallet_id, currency, available) VALUES ($1, $2, 0)',
        [walletId, currency]
      );
      
      return res.json({
        success: true,
        data: { userId, currency, available: 0, held: 0, pending: 0, total: 0 }
      });
    }
    
    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        userId,
        currency,
        available: parseFloat(row.available),
        held: parseFloat(row.held),
        pending: parseFloat(row.pending),
        total: parseFloat(row.total)
      }
    });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get balance' } });
  }
});

// Deposit funds (cash-in for testing)
app.post('/api/v1/wallets/:userId/deposit', async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    const { amount, currency = 'PYG', description = 'Deposit' } = req.body;
    const idempotencyKey = req.body.idempotencyKey || uuidv4();
    
    await client.query('BEGIN');
    
    // Check idempotency
    const existing = await client.query(
      'SELECT id FROM wallet_transactions WHERE reference_id = $1 AND type = $2',
      [idempotencyKey, 'CREDIT']
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({ success: true, data: { message: 'Already processed' } });
    }
    
    // Get or create wallet
    let walletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [userId]);
    let walletId;
    if (walletResult.rows.length === 0) {
      walletResult = await client.query('INSERT INTO wallets (user_id) VALUES ($1) RETURNING id', [userId]);
    }
    walletId = walletResult.rows[0].id;
    
    // Update balance
    await client.query(
      `INSERT INTO wallet_balances (wallet_id, currency, available) 
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_id, currency) 
       DO UPDATE SET available = wallet_balances.available + $3, last_updated = NOW()`,
      [walletId, currency, amount]
    );
    
    // Record transaction
    await client.query(
      'INSERT INTO wallet_transactions (wallet_id, type, amount, currency, reference_id, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [walletId, 'CREDIT', amount, currency, idempotencyKey, description]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: { userId, amount, currency, type: 'CREDIT', description }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error depositing:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Deposit failed' } });
  } finally {
    client.release();
  }
});

// ============== PAYMENT API ==============

// Create payment
app.post('/api/v1/payments', async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, senderId, receiverId, type = 'DIRECT_PAYMENT', description, idempotencyKey } = req.body;
    const currency = (amount?.currency) || 'PYG';
    const amt = typeof amount === 'object' ? amount.amount : amount;
    
    await client.query('BEGIN');
    
    // Check idempotency
    const existing = await client.query(
      'SELECT * FROM payments WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        data: mapPaymentRow(existing.rows[0]),
        idempotency: 'REUSED'
      });
    }
    
    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (type, state, amount, currency, sender_id, receiver_id, description, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [type, 'PENDING', amt, currency, senderId, receiverId, description, idempotencyKey]
    );
    const payment = paymentResult.rows[0];
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      data: mapPaymentRow(payment)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating payment:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create payment' } });
  } finally {
    client.release();
  }
});

// Process payment (execute transfer)
app.post('/api/v1/payments/:paymentId/process', async (req, res) => {
  const client = await pool.connect();
  try {
    const { paymentId } = req.params;
    
    await client.query('BEGIN');
    
    // Get payment
    const paymentResult = await client.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } });
    }
    const payment = paymentResult.rows[0];
    
    if (payment.state !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.json({ success: true, data: mapPaymentRow(payment) });
    }
    
    // Get sender wallet
    const senderWalletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [payment.sender_id]);
    if (senderWalletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: { code: 'NO_WALLET', message: 'Sender has no wallet' } });
    }
    const senderWalletId = senderWalletResult.rows[0].id;
    
    // Check sender balance
    const senderBalanceResult = await client.query(
      'SELECT available FROM wallet_balances WHERE wallet_id = $1 AND currency = $2',
      [senderWalletId, payment.currency]
    );
    const senderAvailable = senderBalanceResult.rows.length > 0 ? parseFloat(senderBalanceResult.rows[0].available) : 0;
    
    if (senderAvailable < parseFloat(payment.amount)) {
      await client.query('UPDATE payments SET state = $1, failure_reason = $2 WHERE id = $3', ['FAILED', 'Insufficient funds', paymentId]);
      await client.query('COMMIT');
      return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Sender has insufficient funds' } });
    }
    
    // Get or create receiver wallet
    let receiverWalletId;
    const receiverWalletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [payment.receiver_id]);
    if (receiverWalletResult.rows.length === 0) {
      const newWalletResult = await client.query('INSERT INTO wallets (user_id) VALUES ($1) RETURNING id', [payment.receiver_id]);
      receiverWalletId = newWalletResult.rows[0].id;
    } else {
      receiverWalletId = receiverWalletResult.rows[0].id;
    }
    
    // Debit sender
    await client.query(
      `UPDATE wallet_balances SET available = available - $1, last_updated = NOW() 
       WHERE wallet_id = $2 AND currency = $3`,
      [payment.amount, senderWalletId, payment.currency]
    );
    
    // Credit receiver
    await client.query(
      `INSERT INTO wallet_balances (wallet_id, currency, available) VALUES ($1, $2, $3)
       ON CONFLICT (wallet_id, currency) DO UPDATE SET available = wallet_balances.available + $3, last_updated = NOW()`,
      [receiverWalletId, payment.currency, payment.amount]
    );
    
    // Record transactions
    await client.query(
      'INSERT INTO wallet_transactions (wallet_id, type, amount, currency, reference_id, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [senderWalletId, 'DEBIT', payment.amount, payment.currency, paymentId, `Payment to ${payment.receiver_id}`]
    );
    await client.query(
      'INSERT INTO wallet_transactions (wallet_id, type, amount, currency, reference_id, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [receiverWalletId, 'CREDIT', payment.amount, payment.currency, paymentId, `Payment from ${payment.sender_id}`]
    );
    
    // Update payment state
    await client.query(
      'UPDATE payments SET state = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2',
      ['COMPLETED', paymentId]
    );
    
    await client.query('COMMIT');
    
    const updatedPayment = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    res.json({ success: true, data: mapPaymentRow(updatedPayment.rows[0]) });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing payment:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Payment processing failed' } });
  } finally {
    client.release();
  }
});

// List payments
app.get('/api/v1/payments', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    let query = 'SELECT * FROM payments';
    const params: any[] = [];
    
    if (userId) {
      query += ' WHERE sender_id = $1 OR receiver_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows.map(mapPaymentRow) });
  } catch (error) {
    console.error('Error listing payments:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list payments' } });
  }
});

// ============== PAYMENT LINKS API ==============

// Create payment link
app.post('/api/v1/payment-links', async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, currency = 'PYG', description, receiverId, expiresInHours = 168, singleUse = false } = req.body;
    const idempotencyKey = req.body.idempotencyKey || uuidv4();
    
    await client.query('BEGIN');
    
    // Check idempotency
    const existing = await client.query(
      'SELECT * FROM payment_links WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.status(201).json({ success: true, data: mapLinkRow(existing.rows[0]), idempotency: 'REUSED' });
    }
    
    const linkId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    
    const result = await client.query(
      `INSERT INTO payment_links (id, merchant_id, amount, currency, description, expires_at, single_use, url, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [linkId, receiverId, amount, currency, description, expiresAt, singleUse, `http://localhost:5174/pay/${linkId}`, idempotencyKey]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({ success: true, data: mapLinkRow(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating link:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create link' } });
  } finally {
    client.release();
  }
});

// Get payment link
app.get('/api/v1/payment-links/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const result = await pool.query('SELECT * FROM payment_links WHERE id = $1', [linkId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }
    
    res.json({ success: true, data: mapLinkRow(result.rows[0]) });
  } catch (error) {
    console.error('Error getting link:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get link' } });
  }
});

// Pay through link
app.post('/api/v1/payment-links/:linkId/pay', async (req, res) => {
  const client = await pool.connect();
  try {
    const { linkId } = req.params;
    const { senderId, idempotencyKey = uuidv4() } = req.body;
    
    await client.query('BEGIN');
    
    // Get link
    const linkResult = await client.query('SELECT * FROM payment_links WHERE id = $1', [linkId]);
    if (linkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    }
    const link = linkResult.rows[0];
    
    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      await client.query('UPDATE payment_links SET is_active = false WHERE id = $1', [linkId]);
      await client.query('COMMIT');
      return res.status(400).json({ success: false, error: { code: 'EXPIRED', message: 'Payment link has expired' } });
    }
    
    // Check if single use and already used
    if (link.single_use && link.current_uses > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: { code: 'ALREADY_USED', message: 'This link has already been used' } });
    }
    
    // Check max uses
    if (link.max_uses && link.current_uses >= link.max_uses) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: { code: 'MAX_USES', message: 'Maximum uses reached' } });
    }
    
    // Get sender wallet
    const senderWalletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [senderId]);
    if (senderWalletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: { code: 'NO_WALLET', message: 'You have no wallet. Please create one first.' } });
    }
    const senderWalletId = senderWalletResult.rows[0].id;
    
    // Check balance
    const balanceResult = await client.query(
      'SELECT available FROM wallet_balances WHERE wallet_id = $1 AND currency = $2',
      [senderWalletId, link.currency]
    );
    const available = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].available) : 0;
    
    if (available < parseFloat(link.amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' } });
    }
    
    // Get receiver wallet
    let receiverWalletId;
    const receiverWalletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [link.merchant_id]);
    if (receiverWalletResult.rows.length === 0) {
      const newWalletResult = await client.query('INSERT INTO wallets (user_id) VALUES ($1) RETURNING id', [link.merchant_id]);
      receiverWalletId = newWalletResult.rows[0].id;
    } else {
      receiverWalletId = receiverWalletResult.rows[0].id;
    }
    
    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (type, state, amount, currency, sender_id, receiver_id, description, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      ['PAYMENT_LINK', 'COMPLETED', link.amount, link.currency, senderId, link.merchant_id, `Payment via link: ${link.description}`, idempotencyKey]
    );
    const payment = paymentResult.rows[0];
    
    // Debit sender
    await client.query(
      'UPDATE wallet_balances SET available = available - $1 WHERE wallet_id = $2 AND currency = $3',
      [link.amount, senderWalletId, link.currency]
    );
    
    // Credit receiver
    await client.query(
      `INSERT INTO wallet_balances (wallet_id, currency, available) VALUES ($1, $2, $3)
       ON CONFLICT (wallet_id, currency) DO UPDATE SET available = wallet_balances.available + $3`,
      [receiverWalletId, link.currency, link.amount]
    );
    
    // Record transactions
    await client.query(
      'INSERT INTO wallet_transactions (wallet_id, type, amount, currency, reference_id, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [senderWalletId, 'DEBIT', link.amount, link.currency, payment.id, `Payment via link to ${link.merchant_id}`]
    );
    await client.query(
      'INSERT INTO wallet_transactions (wallet_id, type, amount, currency, reference_id, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [receiverWalletId, 'CREDIT', link.amount, link.currency, payment.id, `Payment via link from ${senderId}`]
    );
    
    // Update link usage
    await client.query(
      'UPDATE payment_links SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1',
      [linkId]
    );
    
    // If single use, mark inactive
    if (link.single_use) {
      await client.query('UPDATE payment_links SET is_active = false WHERE id = $1', [linkId]);
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: {
        payment: mapPaymentRow(payment),
        link: { id: linkId, amount: link.amount, currency: link.currency }
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error paying through link:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Payment failed' } });
  } finally {
    client.release();
  }
});

// List payment links
app.get('/api/v1/payment-links', async (req, res) => {
  try {
    const merchantId = req.query.merchantId as string;
    let query = 'SELECT * FROM payment_links';
    const params: any[] = [];
    
    if (merchantId) {
      query += ' WHERE merchant_id = $1';
      params.push(merchantId);
    }
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows.map(mapLinkRow) });
  } catch (error) {
    console.error('Error listing links:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list links' } });
  }
});

// Get transaction history
app.get('/api/v1/wallets/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const currency = req.query.currency as string;
    
    const walletResult = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [userId]);
    if (walletResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const walletId = walletResult.rows[0].id;
    
    let query = 'SELECT * FROM wallet_transactions WHERE wallet_id = $1';
    const params: any[] = [walletId];
    
    if (currency) {
      query += ' AND currency = $2';
      params.push(currency);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get transactions' } });
  }
});

// ============== HELPER FUNCTIONS ==============

function mapPaymentRow(row: any) {
  return {
    id: row.id,
    type: row.type,
    state: row.state,
    amount: { amount: parseFloat(row.amount), currency: row.currency, precision: 0 },
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    description: row.description,
    metadata: row.metadata || {},
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    confirmationCode: row.confirmation_code,
    failureReason: row.failure_reason,
    riskScore: row.risk_score
  };
}

function mapLinkRow(row: any) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    amount: parseFloat(row.amount),
    currency: row.currency,
    description: row.description,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    currentUses: row.current_uses,
    isActive: row.is_active,
    singleUse: row.single_use,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Start server
app.listen(PORT, () => {
  console.log(`Payment Service Real v2.0 running on port ${PORT}`);
  console.log(`Connected to PostgreSQL at ${process.env.DB_HOST || 'postgres-payment'}:5432`);
});

export default app;
