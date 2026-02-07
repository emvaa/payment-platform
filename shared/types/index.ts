// Core Types for Fintech Payment Platform

export interface Money {
  amount: number;
  currency: string;
  precision: number;
}

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  kycLevel: 'NONE' | 'BASIC' | 'ENHANCED' | 'PREMIUM';
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVIEW_REQUIRED';
  riskScore: number;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface Wallet {
  id: string;
  userId: string;
  balances: WalletBalance[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface WalletBalance {
  currency: string;
  available: Money;
  held: Money;
  pending: Money;
  total: Money;
  lastUpdated: Date;
}

export enum PaymentState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
  CHARGEBACK = 'CHARGEBACK',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION'
}

export enum PaymentType {
  PAYMENT_LINK = 'PAYMENT_LINK',
  DIRECT_PAYMENT = 'DIRECT_PAYMENT',
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT',
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK'
}

export interface Payment {
  id: string;
  type: PaymentType;
  state: PaymentState;
  amount: Money;
  senderId: string;
  receiverId?: string;
  description?: string;
  metadata: Record<string, any>;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  confirmationCode?: string;
  failureReason?: string;
  riskScore?: number;
  holds?: PaymentHold[];
}

export interface PaymentHold {
  id: string;
  paymentId: string;
  amount: Money;
  reason: string;
  releaseAt?: Date;
  isReleased: boolean;
  createdAt: Date;
  releasedAt?: Date;
}

export interface PaymentLink {
  id: string;
  paymentId: string;
  url: string;
  expiresAt?: Date;
  maxUses?: number;
  currentUses: number;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum LedgerEventType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE',
  REVERSAL = 'REVERSAL',
  ADJUSTMENT = 'ADJUSTMENT'
}

export interface LedgerEvent {
  id: string;
  type: LedgerEventType;
  amount: Money;
  currency: string;
  accountId: string;
  paymentId?: string;
  referenceId?: string;
  timestamp: Date;
  metadata: Record<string, any>;
  signature: string;
  version: number;
  correlationId: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: Money;
  destination: WithdrawalDestination;
  state: WithdrawalState;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  failureReason?: string;
  requiresManualReview: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export enum WithdrawalState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface WithdrawalDestination {
  type: 'BANK_ACCOUNT' | 'CRYPTO_WALLET' | 'EXTERNAL_WALLET';
  identifier: string;
  network?: string;
  metadata: Record<string, any>;
}

export interface FraudAssessment {
  id: string;
  userId: string;
  paymentId?: string;
  withdrawalId?: string;
  score: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rules: FraudRuleResult[];
  mlScore?: number;
  action: 'APPROVE' | 'HOLD' | 'REJECT' | 'MANUAL_REVIEW';
  reason: string;
  createdAt: Date;
}

export interface FraudRuleResult {
  ruleName: string;
  triggered: boolean;
  score: number;
  details: Record<string, any>;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  channel: string;
  subject: string;
  content: string;
  metadata: Record<string, any>;
  state: NotificationState;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
}

export enum NotificationState {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  resourceId: string;
  changes: Record<string, any>;
  ip: string;
  userAgent: string;
  sessionId: string;
  correlationId: string;
  riskScore?: number;
  metadata: Record<string, any>;
}

export interface ReconciliationReport {
  id: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalTransactions: number;
    totalAmount: Money;
    matchedTransactions: number;
    unmatchedTransactions: number;
    discrepancies: ReconciliationDiscrepancy[];
  };
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  completedAt?: Date;
}

export interface ReconciliationDiscrepancy {
  id: string;
  paymentId: string;
  type: 'AMOUNT_MISMATCH' | 'MISSING_LEDGER_ENTRY' | 'DUPLICATE_ENTRY' | 'TIMING_DIFFERENCE';
  expectedValue: any;
  actualValue: any;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  correlationId: string;
  timestamp: Date;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FilterOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  state?: string;
  type?: string;
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface SearchRequest {
  query?: string;
  filters?: FilterOptions;
  sort?: SortOptions;
  pagination?: {
    page: number;
    limit: number;
  };
}

// Event Types for Message Queue
export enum EventType {
  PAYMENT_CREATED = 'PAYMENT_CREATED',
  PAYMENT_UPDATED = 'PAYMENT_UPDATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  WALLET_BALANCE_CHANGED = 'WALLET_BALANCE_CHANGED',
  LEDGER_EVENT_CREATED = 'LEDGER_EVENT_CREATED',
  FRAUD_ASSESSMENT_COMPLETED = 'FRAUD_ASSESSMENT_COMPLETED',
  USER_VERIFICATION_CHANGED = 'USER_VERIFICATION_CHANGED',
  WITHDRAWAL_REQUESTED = 'WITHDRAWAL_REQUESTED',
  WITHDRAWAL_COMPLETED = 'WITHDRAWAL_COMPLETED',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT'
}

export interface DomainEvent {
  id: string;
  type: EventType;
  aggregateId: string;
  aggregateType: string;
  data: Record<string, any>;
  metadata: {
    userId?: string;
    correlationId: string;
    causationId?: string;
    timestamp: Date;
    version: number;
  };
}

// Configuration Types
export interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  environment: 'development' | 'staging' | 'production';
  database: DatabaseConfig;
  redis: RedisConfig;
  messageQueue: MessageQueueConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  pool: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  ttl: number;
  maxSize: number;
}

export interface MessageQueueConfig {
  url: string;
  username: string;
  password: string;
  exchanges: ExchangeConfig[];
  queues: QueueConfig[];
}

export interface ExchangeConfig {
  name: string;
  type: 'direct' | 'topic' | 'fanout' | 'headers';
  durable: boolean;
}

export interface QueueConfig {
  name: string;
  durable: boolean;
  exclusive: boolean;
  autoDelete: boolean;
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'text';
  outputs: string[];
}

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  encryptionKey: string;
  bcryptRounds: number;
  corsOrigins: string[];
  rateLimiting: {
    windowMs: number;
    max: number;
  };
}
