// Local types for payment-service (copied from shared/types to avoid build issues)

export interface Money {
  amount: number;
  currency: string;
  precision: number;
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
  
  // Business logic methods
  canTransitionTo(newState: PaymentState): boolean;
  transitionTo(newState: PaymentState, reason?: string): void;
  isExpired(): boolean;
  canBeRefunded(): boolean;
  getAvailableAmount(): Money;
  addHold(hold: PaymentHold): void;
  releaseHold(holdId: string): void;
  validate(): string[];
  toJSON(): PaymentDTO;
}

export interface PaymentDTO {
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

export enum LedgerEventType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE',
  REVERSAL = 'REVERSAL',
  ADJUSTMENT = 'ADJUSTMENT'
}

export interface LedgerEntry {
  id: string;
  type: LedgerEventType;
  amount: Money;
  accountId: string;
  paymentId?: string;
  referenceId?: string;
  timestamp: Date;
  metadata: Record<string, any>;
  signature: string;
  version: number;
  correlationId: string;
}

export interface FraudAssessment {
  action: 'APPROVE' | 'HOLD' | 'REJECT' | 'MANUAL_REVIEW';
  reason: string;
  score: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  correlationId?: string;
  timestamp?: Date;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FilterOptions {
  userId?: string;
  state?: string;
  type?: string;
  currency?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface PaymentLink {
  id: string;
  merchantId: string;
  amount: Money;
  description?: string;
  expiresAt?: Date;
  maxUses?: number;
  currentUses: number;
  isActive: boolean;
  singleUse: boolean;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}
