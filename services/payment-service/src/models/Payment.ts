import { Payment, PaymentDTO, PaymentState, PaymentType, Money, PaymentHold } from './types';

export class PaymentModel implements Payment {
  public id: string;
  public type: PaymentType;
  public state: PaymentState;
  public amount: Money;
  public senderId: string;
  public receiverId?: string;
  public description?: string;
  public metadata: Record<string, any>;
  public idempotencyKey: string;
  public createdAt: Date;
  public updatedAt: Date;
  public completedAt?: Date;
  public expiresAt?: Date;
  public confirmationCode?: string;
  public failureReason?: string;
  public riskScore?: number;
  public holds?: PaymentHold[];

  constructor(data: Partial<Payment>) {
    this.id = data.id || this.generateId();
    this.type = data.type || PaymentType.DIRECT_PAYMENT;
    this.state = data.state || PaymentState.PENDING;
    this.amount = data.amount || { amount: 0, currency: 'USD', precision: 2 };
    this.senderId = data.senderId || '';
    this.receiverId = data.receiverId;
    this.description = data.description;
    this.metadata = data.metadata || {};
    this.idempotencyKey = data.idempotencyKey || this.generateIdempotencyKey();
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.completedAt = data.completedAt;
    this.expiresAt = data.expiresAt;
    this.confirmationCode = data.confirmationCode;
    this.failureReason = data.failureReason;
    this.riskScore = data.riskScore;
    this.holds = data.holds || [];
  }

  private generateId(): string {
    return `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateIdempotencyKey(): string {
    return `idemp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // State transitions with validation
  public canTransitionTo(newState: PaymentState): boolean {
    const validTransitions: Record<PaymentState, PaymentState[]> = {
      [PaymentState.PENDING]: [
        PaymentState.PROCESSING,
        PaymentState.FAILED,
        PaymentState.CANCELLED,
        PaymentState.EXPIRED
      ],
      [PaymentState.PROCESSING]: [
        PaymentState.COMPLETED,
        PaymentState.FAILED,
        PaymentState.CANCELLED
      ],
      [PaymentState.COMPLETED]: [
        PaymentState.REFUNDED,
        PaymentState.CHARGEBACK
      ],
      [PaymentState.FAILED]: [
        PaymentState.PROCESSING,
        PaymentState.CANCELLED
      ],
      [PaymentState.CANCELLED]: [],
      [PaymentState.REFUNDED]: [],
      [PaymentState.EXPIRED]: [
        PaymentState.CANCELLED
      ],
      [PaymentState.CHARGEBACK]: [],
      [PaymentState.PENDING_CONFIRMATION]: [
        PaymentState.COMPLETED,
        PaymentState.CANCELLED,
        PaymentState.EXPIRED
      ]
    };

    return validTransitions[this.state]?.includes(newState) || false;
  }

  public transitionTo(newState: PaymentState, reason?: string): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid state transition from ${this.state} to ${newState}`);
    }

    this.state = newState;
    this.updatedAt = new Date();

    if (newState === PaymentState.COMPLETED) {
      this.completedAt = new Date();
    }

    if (reason) {
      this.failureReason = reason;
    }
  }

  // Business logic methods
  public isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  public canBeRefunded(): boolean {
    return this.state === PaymentState.COMPLETED &&
           !!this.completedAt &&
           (Date.now() - this.completedAt.getTime()) <= (30 * 24 * 60 * 60 * 1000);
  }

  public getAvailableAmount(): Money {
    const heldAmount = this.holds?.reduce((total, hold) => 
      !hold.isReleased ? total + hold.amount.amount : total, 0) || 0;
    
    return {
      ...this.amount,
      amount: this.amount.amount - heldAmount
    };
  }

  public addHold(hold: PaymentHold): void {
    if (!this.holds) {
      this.holds = [];
    }
    
    const totalHeld = this.holds.reduce((total, existingHold) => 
      !existingHold.isReleased ? total + existingHold.amount.amount : total, 0);
    
    if (totalHeld + hold.amount.amount > this.amount.amount) {
      throw new Error('Hold amount exceeds payment amount');
    }
    
    this.holds.push(hold);
    this.updatedAt = new Date();
  }

  public releaseHold(holdId: string): void {
    if (!this.holds) return;
    
    const hold = this.holds.find(h => h.id === holdId);
    if (!hold) {
      throw new Error(`Hold with id ${holdId} not found`);
    }
    
    if (hold.isReleased) {
      throw new Error(`Hold with id ${holdId} is already released`);
    }
    
    hold.isReleased = true;
    hold.releasedAt = new Date();
    this.updatedAt = new Date();
  }

  // Validation methods
  public validate(): string[] {
    const errors: string[] = [];

    if (!this.senderId) {
      errors.push('Sender ID is required');
    }

    if (this.amount.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!this.amount.currency) {
      errors.push('Currency is required');
    }

    if (!Object.values(PaymentType).includes(this.type)) {
      errors.push('Invalid payment type');
    }

    if (!Object.values(PaymentState).includes(this.state)) {
      errors.push('Invalid payment state');
    }

    return errors;
  }

  // Serialization
  public toJSON(): PaymentDTO {
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      amount: this.amount,
      senderId: this.senderId,
      receiverId: this.receiverId,
      description: this.description,
      metadata: this.metadata,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      expiresAt: this.expiresAt,
      confirmationCode: this.confirmationCode,
      failureReason: this.failureReason,
      riskScore: this.riskScore,
      holds: this.holds
    };
  }

  public static fromJSON(data: PaymentDTO): PaymentModel {
    return new PaymentModel(data);
  }
}
