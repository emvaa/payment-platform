from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import uuid


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class FraudAction(str, Enum):
    APPROVE = "APPROVE"
    HOLD = "HOLD"
    REJECT = "REJECT"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class TransactionType(str, Enum):
    PAYMENT = "PAYMENT"
    WITHDRAWAL = "WITHDRAWAL"
    DEPOSIT = "DEPOSIT"
    REFUND = "REFUND"


class Money(BaseModel):
    amount: float = Field(gt=0, description="Amount must be positive")
    currency: str = Field(min_length=3, max_length=3, description="ISO 4217 currency code")
    precision: int = Field(default=2, ge=0, le=8, description="Decimal precision")


class GeoLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    country: str
    city: Optional[str] = None
    region: Optional[str] = None


class DeviceFingerprint(BaseModel):
    fingerprint: str
    user_agent: str
    ip_address: str
    screen_resolution: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    platform: Optional[str] = None


class UserRiskProfile(BaseModel):
    user_id: str
    base_score: float = Field(ge=0, le=1, description="Base risk score 0-1")
    transaction_history_score: float = Field(ge=0, le=1)
    age_score: float = Field(ge=0, le=1)
    verification_level: str = Field(description="User verification level")
    dispute_rate: float = Field(ge=0, le=1)
    velocity_score: float = Field(ge=0, le=1)
    last_updated: datetime
    total_transactions: int = Field(ge=0)
    total_amount: Money
    average_transaction_amount: Money
    account_age_days: int = Field(ge=0)
    failed_attempts_24h: int = Field(ge=0)
    risk_level: RiskLevel


class FraudRule(BaseModel):
    name: str
    description: str
    enabled: bool = True
    weight: float = Field(ge=0, le=1, description="Rule weight in final score")
    conditions: Dict[str, Any]
    action: FraudAction
    created_at: datetime
    updated_at: datetime


class FraudRuleResult(BaseModel):
    rule_name: str
    triggered: bool
    score: float = Field(ge=0, le=1)
    details: Dict[str, Any]
    execution_time_ms: float


class Transaction(BaseModel):
    id: str
    user_id: str
    type: TransactionType
    amount: Money
    timestamp: datetime
    device_fingerprint: DeviceFingerprint
    geolocation: GeoLocation
    recipient_id: Optional[str] = None
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class FraudAssessment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    transaction_id: Optional[str] = None
    withdrawal_id: Optional[str] = None
    score: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    rules: List[FraudRuleResult]
    ml_score: Optional[float] = Field(None, ge=0, le=1)
    action: FraudAction
    reason: str
    confidence: float = Field(ge=0, le=1)
    assessment_time_ms: float
    created_at: datetime = Field(default_factory=datetime.utcnow)
    requires_manual_review: bool = False
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None


class FraudPattern(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    pattern_type: str  # e.g., "VELOCITY", "AMOUNT_ANOMALY", "GEOLOCATION", "DEVICE"
    detection_algorithm: str
    parameters: Dict[str, Any]
    confidence_threshold: float = Field(ge=0, le=1)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class FraudAlert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    assessment_id: str
    user_id: str
    alert_type: str
    severity: RiskLevel
    title: str
    description: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    is_resolved: bool = False
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserBehaviorProfile(BaseModel):
    user_id: str
    typical_transaction_amounts: Dict[str, Dict[str, float]]  # currency -> {mean, std, min, max}
    typical_locations: List[GeoLocation]
    typical_devices: List[str]
    transaction_frequency: Dict[str, float]  # hour_of_day -> frequency
    transaction_patterns: Dict[str, Any]
    last_updated: datetime
    confidence_score: float = Field(ge=0, le=1)


class VelocityCheck(BaseModel):
    window_minutes: int
    max_transactions: int
    max_amount: Optional[Money] = None
    cooldown_minutes: Optional[int] = None


class AnomalyDetection(BaseModel):
    z_score_threshold: float = Field(default=3.0, description="Z-score threshold for anomaly detection")
    isolation_forest_contamination: float = Field(default=0.1, description="Expected proportion of outliers")
    min_samples_for_detection: int = Field(default=5, description="Minimum samples needed for detection")


class FraudMLModel(BaseModel):
    id: str
    name: str
    version: str
    model_type: str  # e.g., "RANDOM_FOREST", "ISOLATION_FOREST", "NEURAL_NETWORK"
    features: List[str]
    accuracy: float = Field(ge=0, le=1)
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    f1_score: float = Field(ge=0, le=1)
    training_date: datetime
    is_active: bool = True
    model_path: str
    feature_importance: Dict[str, float]


class FraudDetectionRequest(BaseModel):
    user_id: str
    transaction: Optional[Transaction] = None
    withdrawal_request: Optional[Dict[str, Any]] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    force_assessment: bool = False


class FraudDetectionResponse(BaseModel):
    success: bool
    assessment: Optional[FraudAssessment] = None
    error: Optional[str] = None
    processing_time_ms: float
    correlation_id: str


class FraudStatistics(BaseModel):
    period_start: datetime
    period_end: datetime
    total_assessments: int
    approved_count: int
    rejected_count: int
    manual_review_count: int
    average_score: float
    high_risk_transactions: int
    fraud_detected: int
    false_positives: int
    false_negatives: int
    accuracy: float
    precision: float
    recall: float


class WhitelistEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # "USER", "DEVICE", "IP", "EMAIL", "DOMAIN"
    value: str
    reason: str
    expires_at: Optional[datetime] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True


class BlacklistEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # "USER", "DEVICE", "IP", "EMAIL", "DOMAIN"
    value: str
    reason: str
    expires_at: Optional[datetime] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True


class FraudInvestigation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    assessment_ids: List[str]
    investigation_status: str  # "OPEN", "IN_PROGRESS", "CLOSED", "ESCALATED"
    priority: RiskLevel
    assigned_to: Optional[str] = None
    findings: Optional[str] = None
    action_taken: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None


class ModelTrainingConfig(BaseModel):
    training_data_period_days: int = Field(default=90)
    validation_split: float = Field(default=0.2, ge=0, le=1)
    test_split: float = Field(default=0.1, ge=0, le=1)
    cross_validation_folds: int = Field(default=5, ge=2)
    random_state: int = Field(default=42)
    feature_selection_threshold: float = Field(default=0.01, ge=0, le=1)
    hyperparameter_tuning: bool = True
    model_retrain_threshold_days: int = Field(default=30)
