import request from 'supertest';
import app from '../src/index';

describe('Payment API Integration Tests', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Setup test user and get auth token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });
    
    authToken = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });

  describe('POST /api/v1/payments', () => {
    it('should create a new payment', async () => {
      const paymentData = {
        amount: {
          amount: 100,
          currency: 'USD',
          precision: 2
        },
        type: 'DIRECT_PAYMENT',
        senderId: userId,
        receiverId: 'receiver-id',
        description: 'Test payment',
        idempotencyKey: `test-${Date.now()}`
      };

      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Idempotency-Key', paymentData.idempotencyKey)
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.state).toBe('PENDING');
    });

    it('should return 400 for invalid payment data', async () => {
      const invalidData = {
        amount: { amount: -100, currency: 'USD' },
        type: 'INVALID_TYPE'
      };

      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should handle idempotency correctly', async () => {
      const idempotencyKey = `idem-${Date.now()}`;
      const paymentData = {
        amount: { amount: 50, currency: 'USD', precision: 2 },
        type: 'DIRECT_PAYMENT',
        senderId: userId,
        receiverId: 'receiver-id',
        idempotencyKey
      };

      // First request
      const firstResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .send(paymentData);

      // Second request with same key
      const secondResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .send(paymentData);

      expect(secondResponse.body.data.id).toBe(firstResponse.body.data.id);
    });
  });

  describe('GET /api/v1/payments/:paymentId', () => {
    it('should retrieve payment details', async () => {
      // First create a payment
      const createResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: { amount: 75, currency: 'USD', precision: 2 },
          type: 'DIRECT_PAYMENT',
          senderId: userId,
          receiverId: 'receiver-id',
          idempotencyKey: `get-test-${Date.now()}`
        });

      const paymentId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(paymentId);
    });

    it('should return 404 for non-existent payment', async () => {
      const response = await request(app)
        .get('/api/v1/payments/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });
  });

  describe('POST /api/v1/payments/:paymentId/process', () => {
    it('should process payment successfully', async () => {
      // Create payment first
      const createResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: { amount: 25, currency: 'USD', precision: 2 },
          type: 'DIRECT_PAYMENT',
          senderId: userId,
          receiverId: 'receiver-id',
          idempotencyKey: `process-test-${Date.now()}`
        });

      const paymentId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/v1/payments/${paymentId}/process`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should fail processing without sufficient funds', async () => {
      // Create high-value payment
      const createResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: { amount: 1000000, currency: 'USD', precision: 2 },
          type: 'DIRECT_PAYMENT',
          senderId: userId,
          receiverId: 'receiver-id',
          idempotencyKey: `funds-test-${Date.now()}`
        });

      const paymentId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/v1/payments/${paymentId}/process`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('POST /api/v1/payments/:paymentId/cancel', () => {
    it('should cancel pending payment', async () => {
      // Create payment
      const createResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: { amount: 30, currency: 'USD', precision: 2 },
          type: 'DIRECT_PAYMENT',
          senderId: userId,
          receiverId: 'receiver-id',
          idempotencyKey: `cancel-test-${Date.now()}`
        });

      const paymentId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/v1/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'User requested cancellation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.state).toBe('CANCELLED');
    });

    it('should not cancel completed payment', async () => {
      // Create and process payment
      const createResponse = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: { amount: 20, currency: 'USD', precision: 2 },
          type: 'DIRECT_PAYMENT',
          senderId: userId,
          receiverId: 'receiver-id',
          idempotencyKey: `cancel-completed-${Date.now()}`
        });

      const paymentId = createResponse.body.data.id;

      // Process it
      await request(app)
        .post(`/api/v1/payments/${paymentId}/process`)
        .set('Authorization', `Bearer ${authToken}`);

      // Try to cancel
      const response = await request(app)
        .post(`/api/v1/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Should fail' })
        .expect(200);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = Array(150).fill(null).map(() =>
        request(app)
          .get('/api/v1/payments')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication', () => {
    it('should reject requests without token', async () => {
      await request(app)
        .get('/api/v1/payments')
        .expect(401);
    });

    it('should reject requests with invalid token', async () => {
      await request(app)
        .get('/api/v1/payments')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = 'expired.jwt.token';
      
      await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
    });
  });
});
