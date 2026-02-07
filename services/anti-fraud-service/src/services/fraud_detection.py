import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report
import joblib
import redis
import asyncpg
from structlog import get_logger

from ..models.fraud_models import (
    FraudAssessment, FraudRuleResult, Transaction, UserRiskProfile,
    RiskLevel, FraudAction, DeviceFingerprint, GeoLocation, Money,
    VelocityCheck, FraudDetectionRequest, FraudDetectionResponse
)

logger = get_logger(__name__)


class FraudDetectionService:
    def __init__(
        self,
        db_pool: asyncpg.Pool,
        redis_client: redis.Redis,
        ml_model_path: str = "models/fraud_model.pkl"
    ):
        self.db_pool = db_pool
        self.redis = redis_client
        self.ml_model_path = ml_model_path
        self.ml_model = None
        self.scaler = None
        self.feature_names = []
        
        # Initialize fraud rules
        self.fraud_rules = self._initialize_fraud_rules()
        
        # Load ML model
        asyncio.create_task(self._load_ml_model())
        
        # Velocity checks configuration
        self.velocity_checks = {
            'hourly': VelocityCheck(window_minutes=60, max_transactions=10, max_amount=None),
            'daily': VelocityCheck(window_minutes=1440, max_transactions=50, max_amount=Money(amount=10000, currency='USD', precision=2)),
            'weekly': VelocityCheck(window_minutes=10080, max_transactions=200, max_amount=Money(amount=50000, currency='USD', precision=2))
        }

    async def _load_ml_model(self):
        """Load the ML model for fraud detection"""
        try:
            self.ml_model = joblib.load(self.ml_model_path)
            self.scaler = joblib.load(self.ml_model_path.replace('.pkl', '_scaler.pkl'))
            self.feature_names = joblib.load(self.ml_model_path.replace('.pkl', '_features.pkl'))
            logger.info("ML model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load ML model: {e}")
            # Create a simple model as fallback
            self._create_fallback_model()

    def _create_fallback_model(self):
        """Create a simple fallback model for fraud detection"""
        self.ml_model = IsolationForest(
            contamination=0.1,
            random_state=42,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        self.feature_names = [
            'amount', 'hour_of_day', 'day_of_week', 'user_age_days',
            'transaction_count_24h', 'avg_amount_24h', 'failed_attempts_24h',
            'geolocation_change', 'device_change', 'amount_deviation'
        ]
        logger.info("Fallback ML model created")

    def _initialize_fraud_rules(self) -> Dict[str, Dict]:
        """Initialize rule-based fraud detection rules"""
        return {
            'velocity_check': {
                'name': 'VELOCITY_CHECK',
                'description': 'Check transaction velocity limits',
                'weight': 0.3,
                'action': FraudAction.HOLD,
                'enabled': True
            },
            'amount_anomaly': {
                'name': 'AMOUNT_ANOMALY',
                'description': 'Detect unusual transaction amounts',
                'weight': 0.25,
                'action': FraudAction.MANUAL_REVIEW,
                'enabled': True
            },
            'geolocation_anomaly': {
                'name': 'GEOLOCATION_ANOMALY',
                'description': 'Detect unusual geographic locations',
                'weight': 0.2,
                'action': FraudAction.HOLD,
                'enabled': True
            },
            'device_fingerprint': {
                'name': 'DEVICE_FINGERPRINT',
                'description': 'Check for new or suspicious devices',
                'weight': 0.15,
                'action': FraudAction.MANUAL_REVIEW,
                'enabled': True
            },
            'time_pattern': {
                'name': 'TIME_PATTERN',
                'description': 'Detect unusual transaction timing',
                'weight': 0.1,
                'action': FraudAction.MANUAL_REVIEW,
                'enabled': True
            }
        }

    async def assess_transaction(self, request: FraudDetectionRequest) -> FraudDetectionResponse:
        """Assess a transaction for fraud risk"""
        start_time = time.time()
        correlation_id = f"fraud_{int(time.time())}"
        
        try:
            if not request.transaction:
                return FraudDetectionResponse(
                    success=False,
                    error="No transaction provided",
                    processing_time_ms=(time.time() - start_time) * 1000,
                    correlation_id=correlation_id
                )

            transaction = request.transaction
            user_profile = await self._get_user_risk_profile(transaction.user_id)
            
            # Execute rule-based checks
            rule_results = await self._execute_fraud_rules(transaction, user_profile)
            
            # Calculate ML score
            ml_score = await self._calculate_ml_score(transaction, user_profile)
            
            # Calculate final risk score
            final_score = self._calculate_final_score(rule_results, ml_score)
            
            # Determine risk level and action
            risk_level = self._determine_risk_level(final_score)
            action = self._determine_action(final_score, risk_level, rule_results)
            
            # Create assessment
            assessment = FraudAssessment(
                user_id=transaction.user_id,
                transaction_id=transaction.id,
                score=final_score,
                risk_level=risk_level,
                rules=rule_results,
                ml_score=ml_score,
                action=action,
                reason=self._generate_assessment_reason(rule_results, ml_score, final_score),
                confidence=self._calculate_confidence(rule_results, ml_score),
                assessment_time_ms=(time.time() - start_time) * 1000,
                requires_manual_review=action in [FraudAction.MANUAL_REVIEW]
            )
            
            # Store assessment
            await self._store_assessment(assessment)
            
            # Update user risk profile if needed
            await self._update_user_risk_profile(transaction.user_id, final_score)
            
            # Send alerts if needed
            if risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
                await self._send_fraud_alert(assessment)
            
            logger.info(
                "Fraud assessment completed",
                user_id=transaction.user_id,
                transaction_id=transaction.id,
                score=final_score,
                risk_level=risk_level,
                action=action,
                correlation_id=correlation_id
            )
            
            return FraudDetectionResponse(
                success=True,
                assessment=assessment,
                processing_time_ms=(time.time() - start_time) * 1000,
                correlation_id=correlation_id
            )
            
        except Exception as e:
            logger.error(
                "Error in fraud assessment",
                error=str(e),
                user_id=request.user_id,
                correlation_id=correlation_id
            )
            
            return FraudDetectionResponse(
                success=False,
                error=str(e),
                processing_time_ms=(time.time() - start_time) * 1000,
                correlation_id=correlation_id
            )

    async def _get_user_risk_profile(self, user_id: str) -> UserRiskProfile:
        """Get user risk profile from cache or database"""
        cache_key = f"user_risk_profile:{user_id}"
        
        # Try cache first
        cached_profile = self.redis.get(cache_key)
        if cached_profile:
            return UserRiskProfile.parse_raw(cached_profile)
        
        # Get from database
        query = """
        SELECT 
            u.id,
            u.created_at,
            u.verification_level,
            COALESCE(stats.total_transactions, 0) as total_transactions,
            COALESCE(stats.total_amount, 0) as total_amount,
            COALESCE(stats.avg_amount, 0) as avg_amount,
            COALESCE(stats.failed_attempts_24h, 0) as failed_attempts_24h
        FROM users u
        LEFT JOIN user_transaction_stats stats ON u.id = stats.user_id
        WHERE u.id = $1
        """
        
        row = await self.db_pool.fetchrow(query, user_id)
        if not row:
            # Create default profile for new user
            return self._create_default_user_profile(user_id)
        
        # Calculate risk scores
        account_age_days = (datetime.utcnow() - row['created_at']).days
        base_score = self._calculate_base_risk_score(
            account_age_days,
            row['verification_level'],
            row['total_transactions']
        )
        
        profile = UserRiskProfile(
            user_id=user_id,
            base_score=base_score,
            transaction_history_score=self._calculate_transaction_history_score(row['total_transactions']),
            age_score=self._calculate_age_score(account_age_days),
            verification_level=row['verification_level'],
            dispute_rate=0.0,  # Would come from disputes table
            velocity_score=0.0,  # Calculated dynamically
            last_updated=datetime.utcnow(),
            total_transactions=row['total_transactions'],
            total_amount=Money(amount=row['total_amount'], currency='USD', precision=2),
            average_transaction_amount=Money(amount=row['avg_amount'], currency='USD', precision=2),
            account_age_days=account_age_days,
            failed_attempts_24h=row['failed_attempts_24h'],
            risk_level=self._determine_risk_level(base_score)
        )
        
        # Cache for 5 minutes
        self.redis.setex(cache_key, 300, profile.json())
        
        return profile

    def _create_default_user_profile(self, user_id: str) -> UserRiskProfile:
        """Create default risk profile for new users"""
        return UserRiskProfile(
            user_id=user_id,
            base_score=0.7,  # Higher risk for new users
            transaction_history_score=0.0,
            age_score=0.8,  # High risk for new accounts
            verification_level='NONE',
            dispute_rate=0.0,
            velocity_score=0.0,
            last_updated=datetime.utcnow(),
            total_transactions=0,
            total_amount=Money(amount=0, currency='USD', precision=2),
            average_transaction_amount=Money(amount=0, currency='USD', precision=2),
            account_age_days=0,
            failed_attempts_24h=0,
            risk_level=RiskLevel.MEDIUM
        )

    async def _execute_fraud_rules(self, transaction: Transaction, user_profile: UserRiskProfile) -> List[FraudRuleResult]:
        """Execute all fraud detection rules"""
        results = []
        
        for rule_name, rule_config in self.fraud_rules.items():
            if not rule_config['enabled']:
                continue
                
            start_time = time.time()
            
            try:
                if rule_name == 'velocity_check':
                    result = await self._check_velocity_rules(transaction, rule_config)
                elif rule_name == 'amount_anomaly':
                    result = await self._check_amount_anomaly(transaction, user_profile, rule_config)
                elif rule_name == 'geolocation_anomaly':
                    result = await self._check_geolocation_anomaly(transaction, user_profile, rule_config)
                elif rule_name == 'device_fingerprint':
                    result = await self._check_device_fingerprint(transaction, user_profile, rule_config)
                elif rule_name == 'time_pattern':
                    result = await self._check_time_pattern(transaction, user_profile, rule_config)
                else:
                    continue
                
                result.execution_time_ms = (time.time() - start_time) * 1000
                results.append(result)
                
            except Exception as e:
                logger.error(f"Error executing rule {rule_name}: {e}")
                results.append(FraudRuleResult(
                    rule_name=rule_name,
                    triggered=False,
                    score=0.0,
                    details={'error': str(e)},
                    execution_time_ms=(time.time() - start_time) * 1000
                ))
        
        return results

    async def _check_velocity_rules(self, transaction: Transaction, rule_config: Dict) -> FraudRuleResult:
        """Check transaction velocity limits"""
        triggered = False
        score = 0.0
        details = {}
        
        for period, velocity_check in self.velocity_checks.items():
            # Get transaction count in window
            count = await self._get_transaction_count_in_window(
                transaction.user_id,
                velocity_check.window_minutes,
                transaction.timestamp
            )
            
            if count > velocity_check.max_transactions:
                triggered = True
                score = max(score, 0.8)
                details[period] = {
                    'count': count,
                    'limit': velocity_check.max_transactions,
                    'exceeded': True
                }
            
            # Check amount limits if specified
            if velocity_check.max_amount:
                total_amount = await self._get_transaction_amount_in_window(
                    transaction.user_id,
                    velocity_check.window_minutes,
                    transaction.timestamp
                )
                
                if total_amount > velocity_check.max_amount.amount:
                    triggered = True
                    score = max(score, 0.9)
                    details[f'{period}_amount'] = {
                        'total': total_amount,
                        'limit': velocity_check.max_amount.amount,
                        'exceeded': True
                    }
        
        return FraudRuleResult(
            rule_name=rule_config['name'],
            triggered=triggered,
            score=score * rule_config['weight'],
            details=details
        )

    async def _check_amount_anomaly(self, transaction: Transaction, user_profile: UserRiskProfile, rule_config: Dict) -> FraudRuleResult:
        """Check for unusual transaction amounts"""
        triggered = False
        score = 0.0
        details = {}
        
        # Compare with user's average transaction amount
        if user_profile.total_transactions > 0:
            avg_amount = user_profile.average_transaction_amount.amount
            current_amount = transaction.amount.amount
            
            # Calculate Z-score
            if avg_amount > 0:
                z_score = abs(current_amount - avg_amount) / avg_amount
                
                if z_score > 3:  # 3 standard deviations
                    triggered = True
                    score = min(0.8, z_score / 5)
                
                details = {
                    'current_amount': current_amount,
                    'average_amount': avg_amount,
                    'z_score': z_score,
                    'threshold': 3.0
                }
        
        return FraudRuleResult(
            rule_name=rule_config['name'],
            triggered=triggered,
            score=score * rule_config['weight'],
            details=details
        )

    async def _check_geolocation_anomaly(self, transaction: Transaction, user_profile: UserRiskProfile, rule_config: Dict) -> FraudRuleResult:
        """Check for unusual geographic locations"""
        triggered = False
        score = 0.0
        details = {}
        
        # Get user's typical locations
        typical_locations = await self._get_user_typical_locations(transaction.user_id)
        
        if typical_locations:
            # Calculate distance from typical locations
            min_distance = float('inf')
            for location in typical_locations:
                distance = self._calculate_distance(
                    transaction.geolocation.latitude,
                    transaction.geolocation.longitude,
                    location['latitude'],
                    location['longitude']
                )
                min_distance = min(min_distance, distance)
            
            # If distance is significant, flag as anomaly
            if min_distance > 1000:  # 1000 km threshold
                triggered = True
                score = min(0.7, min_distance / 5000)  # Scale score by distance
            
            details = {
                'current_location': {
                    'lat': transaction.geolocation.latitude,
                    'lon': transaction.geolocation.longitude,
                    'country': transaction.geolocation.country
                },
                'min_distance_km': min_distance,
                'threshold_km': 1000
            }
        else:
            # New user, no location history
            details = {'status': 'no_location_history'}
        
        return FraudRuleResult(
            rule_name=rule_config['name'],
            triggered=triggered,
            score=score * rule_config['weight'],
            details=details
        )

    async def _check_device_fingerprint(self, transaction: Transaction, user_profile: UserRiskProfile, rule_config: Dict) -> FraudRuleResult:
        """Check for new or suspicious devices"""
        triggered = False
        score = 0.0
        details = {}
        
        # Get user's known devices
        known_devices = await self._get_user_known_devices(transaction.user_id)
        
        if transaction.device_fingerprint.fingerprint not in known_devices:
            # New device detected
            triggered = True
            score = 0.5
            
            # Check if device is in blacklist
            if await self._is_device_blacklisted(transaction.device_fingerprint.fingerprint):
                triggered = True
                score = 1.0
            
            details = {
                'device_fingerprint': transaction.device_fingerprint.fingerprint,
                'is_known_device': False,
                'known_devices_count': len(known_devices),
                'is_blacklisted': await self._is_device_blacklisted(transaction.device_fingerprint.fingerprint)
            }
        else:
            details = {
                'device_fingerprint': transaction.device_fingerprint.fingerprint,
                'is_known_device': True,
                'known_devices_count': len(known_devices)
            }
        
        return FraudRuleResult(
            rule_name=rule_config['name'],
            triggered=triggered,
            score=score * rule_config['weight'],
            details=details
        )

    async def _check_time_pattern(self, transaction: Transaction, user_profile: UserRiskProfile, rule_config: Dict) -> FraudRuleResult:
        """Check for unusual transaction timing"""
        triggered = False
        score = 0.0
        details = {}
        
        # Get user's typical transaction hours
        typical_hours = await self._get_user_typical_transaction_hours(transaction.user_id)
        
        current_hour = transaction.timestamp.hour
        
        if typical_hours:
            # Check if current hour is unusual
            hour_frequency = typical_hours.get(str(current_hour), 0)
            total_frequency = sum(typical_hours.values())
            
            if total_frequency > 0:
                hour_probability = hour_frequency / total_frequency
                
                # If probability is very low, flag as anomaly
                if hour_probability < 0.05:  # Less than 5% of transactions happen at this hour
                    triggered = True
                    score = 0.4
                
                details = {
                    'current_hour': current_hour,
                    'hour_frequency': hour_frequency,
                    'total_frequency': total_frequency,
                    'hour_probability': hour_probability,
                    'threshold': 0.05
                }
        else:
            # New user, no transaction history
            details = {'status': 'no_transaction_history'}
        
        return FraudRuleResult(
            rule_name=rule_config['name'],
            triggered=triggered,
            score=score * rule_config['weight'],
            details=details
        )

    async def _calculate_ml_score(self, transaction: Transaction, user_profile: UserRiskProfile) -> Optional[float]:
        """Calculate ML-based fraud score"""
        if not self.ml_model:
            return None
        
        try:
            # Extract features
            features = self._extract_features(transaction, user_profile)
            
            # Scale features
            features_scaled = self.scaler.transform([features])
            
            # Predict
            if hasattr(self.ml_model, 'predict_proba'):
                # For classification models
                probabilities = self.ml_model.predict_proba(features_scaled)
                fraud_probability = probabilities[0][1]  # Probability of fraud class
            else:
                # For anomaly detection models
            anomaly_score = self.ml_model.decision_function(features_scaled)[0]
                fraud_probability = 1 / (1 + np.exp(-anomaly_score))  # Convert to probability
            
            return float(np.clip(fraud_probability, 0, 1))
            
        except Exception as e:
            logger.error(f"Error calculating ML score: {e}")
            return None

    def _extract_features(self, transaction: Transaction, user_profile: UserRiskProfile) -> List[float]:
        """Extract features for ML model"""
        features = []
        
        # Transaction features
        features.append(transaction.amount.amount)
        features.append(transaction.timestamp.hour)
        features.append(transaction.timestamp.weekday())
        
        # User features
        features.append(user_profile.account_age_days)
        features.append(user_profile.total_transactions)
        features.append(user_profile.average_transaction_amount.amount)
        features.append(user_profile.failed_attempts_24h)
        
        # Behavioral features
        features.append(1.0 if await self._is_new_geolocation(transaction.user_id, transaction.geolocation) else 0.0)
        features.append(1.0 if await self._is_new_device(transaction.user_id, transaction.device_fingerprint.fingerprint) else 0.0)
        features.append(abs(transaction.amount.amount - user_profile.average_transaction_amount.amount) / max(user_profile.average_transaction_amount.amount, 1))
        
        return features

    def _calculate_final_score(self, rule_results: List[FraudRuleResult], ml_score: Optional[float]) -> float:
        """Calculate final fraud score combining rules and ML"""
        rule_score = sum(result.score for result in rule_results)
        
        if ml_score is not None:
            # Weighted combination: 60% rules, 40% ML
            final_score = (rule_score * 0.6) + (ml_score * 0.4)
        else:
            final_score = rule_score
        
        return float(np.clip(final_score, 0, 1))

    def _determine_risk_level(self, score: float) -> RiskLevel:
        """Determine risk level from score"""
        if score >= 0.8:
            return RiskLevel.CRITICAL
        elif score >= 0.6:
            return RiskLevel.HIGH
        elif score >= 0.3:
            return RiskLevel.MEDIUM
        else:
            return RiskLevel.LOW

    def _determine_action(self, score: float, risk_level: RiskLevel, rule_results: List[FraudRuleResult]) -> FraudAction:
        """Determine action based on score and rules"""
        if score >= 0.8:
            return FraudAction.REJECT
        elif score >= 0.6:
            return FraudAction.HOLD
        elif score >= 0.3:
            # Check if any high-weight rules were triggered
            high_weight_triggered = any(
                result.triggered and result.score > 0.5 
                for result in rule_results
            )
            return FraudAction.MANUAL_REVIEW if high_weight_triggered else FraudAction.APPROVE
        else:
            return FraudAction.APPROVE

    def _generate_assessment_reason(self, rule_results: List[FraudRuleResult], ml_score: Optional[float], final_score: float) -> str:
        """Generate human-readable assessment reason"""
        reasons = []
        
        triggered_rules = [result for result in rule_results if result.triggered]
        if triggered_rules:
            reasons.append(f"Rules triggered: {', '.join(r.rule_name for r in triggered_rules)}")
        
        if ml_score is not None:
            reasons.append(f"ML score: {ml_score:.3f}")
        
        reasons.append(f"Final score: {final_score:.3f}")
        
        return "; ".join(reasons)

    def _calculate_confidence(self, rule_results: List[FraudRuleResult], ml_score: Optional[float]) -> float:
        """Calculate confidence in the assessment"""
        if not rule_results and ml_score is None:
            return 0.0
        
        # Higher confidence when multiple indicators agree
        indicators = []
        
        rule_confidence = sum(result.score for result in rule_results if result.triggered)
        if rule_confidence > 0:
            indicators.append(rule_confidence)
        
        if ml_score is not None:
            indicators.append(ml_score)
        
        if not indicators:
            return 0.5
        
        # Calculate agreement between indicators
        if len(indicators) == 1:
            return indicators[0]
        
        # If indicators are close, confidence is higher
        max_indicator = max(indicators)
        min_indicator = min(indicators)
        agreement = 1 - (max_indicator - min_indicator)
        
        return (sum(indicators) / len(indicators)) * agreement

    # Helper methods (implementations would go here)
    async def _get_transaction_count_in_window(self, user_id: str, window_minutes: int, timestamp: datetime) -> int:
        """Get transaction count in time window"""
        query = """
        SELECT COUNT(*) as count
        FROM transactions
        WHERE user_id = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
        """
        window_start = timestamp - timedelta(minutes=window_minutes)
        row = await self.db_pool.fetchrow(query, user_id, window_start, timestamp)
        return row['count'] if row else 0

    async def _get_transaction_amount_in_window(self, user_id: str, window_minutes: int, timestamp: datetime) -> float:
        """Get total transaction amount in time window"""
        query = """
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE user_id = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
        """
        window_start = timestamp - timedelta(minutes=window_minutes)
        row = await self.db_pool.fetchrow(query, user_id, window_start, timestamp)
        return float(row['total']) if row else 0.0

    async def _get_user_typical_locations(self, user_id: str) -> List[Dict]:
        """Get user's typical transaction locations"""
        query = """
        SELECT latitude, longitude, COUNT(*) as frequency
        FROM transactions t
        JOIN geolocations g ON t.geolocation_id = g.id
        WHERE t.user_id = $1
        AND t.timestamp >= $2
        GROUP BY latitude, longitude
        ORDER BY frequency DESC
        LIMIT 10
        """
        rows = await self.db_pool.fetch(query, user_id, datetime.utcnow() - timedelta(days=30))
        return [dict(row) for row in rows]

    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two coordinates in kilometers"""
        from math import radians, cos, sin, asin, sqrt
        
        # Convert to radians
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        
        # Radius of Earth in kilometers
        r = 6371
        
        return c * r

    # Additional helper methods would be implemented here...
    async def _get_user_known_devices(self, user_id: str) -> List[str]:
        """Get list of user's known device fingerprints"""
        # Implementation would query device_fingerprints table
        return []

    async def _is_device_blacklisted(self, fingerprint: str) -> bool:
        """Check if device is blacklisted"""
        # Implementation would check blacklist table
        return False

    async def _get_user_typical_transaction_hours(self, user_id: str) -> Dict[str, float]:
        """Get user's typical transaction hours"""
        # Implementation would analyze transaction timing patterns
        return {}

    async def _is_new_geolocation(self, user_id: str, geolocation: GeoLocation) -> bool:
        """Check if geolocation is new for user"""
        # Implementation would compare with known locations
        return True

    async def _is_new_device(self, user_id: str, fingerprint: str) -> bool:
        """Check if device is new for user"""
        # Implementation would compare with known devices
        return True

    def _calculate_base_risk_score(self, account_age_days: int, verification_level: str, total_transactions: int) -> float:
        """Calculate base risk score"""
        score = 0.5  # Base score
        
        # Account age factor
        if account_age_days < 7:
            score += 0.3
        elif account_age_days < 30:
            score += 0.2
        elif account_age_days < 90:
            score += 0.1
        
        # Verification level factor
        verification_scores = {
            'NONE': 0.3,
            'BASIC': 0.1,
            'ENHANCED': -0.1,
            'PREMIUM': -0.2
        }
        score += verification_scores.get(verification_level, 0.1)
        
        # Transaction history factor
        if total_transactions == 0:
            score += 0.2
        elif total_transactions < 10:
            score += 0.1
        elif total_transactions > 100:
            score -= 0.1
        
        return float(np.clip(score, 0, 1))

    def _calculate_transaction_history_score(self, total_transactions: int) -> float:
        """Calculate transaction history risk score"""
        if total_transactions == 0:
            return 0.8
        elif total_transactions < 10:
            return 0.6
        elif total_transactions < 50:
            return 0.3
        else:
            return 0.1

    def _calculate_age_score(self, account_age_days: int) -> float:
        """Calculate account age risk score"""
        if account_age_days < 7:
            return 0.9
        elif account_age_days < 30:
            return 0.7
        elif account_age_days < 90:
            return 0.4
        elif account_age_days < 365:
            return 0.2
        else:
            return 0.1

    async def _store_assessment(self, assessment: FraudAssessment):
        """Store fraud assessment in database"""
        query = """
        INSERT INTO fraud_assessments (
            id, user_id, transaction_id, score, risk_level, 
            rules, ml_score, action, reason, confidence,
            assessment_time_ms, requires_manual_review, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        """
        
        await self.db_pool.execute(
            query,
            assessment.id,
            assessment.user_id,
            assessment.transaction_id,
            assessment.score,
            assessment.risk_level,
            [rule.dict() for rule in assessment.rules],
            assessment.ml_score,
            assessment.action,
            assessment.reason,
            assessment.confidence,
            assessment.assessment_time_ms,
            assessment.requires_manual_review,
            assessment.created_at
        )

    async def _update_user_risk_profile(self, user_id: str, new_score: float):
        """Update user risk profile cache"""
        cache_key = f"user_risk_profile:{user_id}"
        self.redis.delete(cache_key)  # Invalidate cache

    async def _send_fraud_alert(self, assessment: FraudAssessment):
        """Send fraud alert to monitoring system"""
        # Implementation would send to alerting system
        logger.warning(
            "High-risk fraud alert",
            assessment_id=assessment.id,
            user_id=assessment.user_id,
            score=assessment.score,
            risk_level=assessment.risk_level
        )
