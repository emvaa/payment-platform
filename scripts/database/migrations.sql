-- Fintech Payment Platform Database Schema
-- Complete database schema for all services

-- ========================================
-- Payment Service Database
-- ========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    kyc_level VARCHAR(20) DEFAULT 'NONE' CHECK (kyc_level IN ('NONE', 'BASIC', 'ENHANCED', 'PREMIUM')),
    verification_status VARCHAR(20) DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'REVIEW_REQUIRED')),
    risk_score DECIMAL(5,4) DEFAULT 0.0000 CHECK (risk_score >= 0 AND risk_score <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_attempts INTEGER DEFAULT 0,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    two_factor_secret VARCHAR(255),
    two_factor_enabled BOOLEAN DEFAULT false,
    permissions JSONB DEFAULT '[]',
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    id_document_number VARCHAR(50),
    id_document_type VARCHAR(20),
    address JSONB,
    profile_picture_url VARCHAR(500)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('PAYMENT_LINK', 'DIRECT_PAYMENT', 'WITHDRAWAL', 'DEPOSIT', 'REFUND', 'CHARGEBACK')),
    state VARCHAR(50) NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'CHARGEBACK', 'PENDING_CONFIRMATION')),
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    sender_id UUID NOT NULL,
    receiver_id UUID,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    confirmation_code VARCHAR(10),
    failure_reason TEXT,
    risk_score DECIMAL(5,4) CHECK (risk_score >= 0 AND risk_score <= 1),
    fraud_assessment_id UUID,
    processed_by_ledger BOOLEAN DEFAULT false,
    notification_sent BOOLEAN DEFAULT false
);

-- Payment holds table
CREATE TABLE IF NOT EXISTS payment_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    reason TEXT NOT NULL,
    release_at TIMESTAMP WITH TIME ZONE,
    is_released BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    released_at TIMESTAMP WITH TIME ZONE
);

-- Payment links table
CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment notifications table
CREATE TABLE IF NOT EXISTS payment_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')),
    channel VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    state VARCHAR(20) DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

-- ========================================
-- Wallet Service Database
-- ========================================

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version BIGINT DEFAULT 1
);

-- Wallet balances table
CREATE TABLE IF NOT EXISTS wallet_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL,
    available DECIMAL(20,8) DEFAULT 0.00000000 CHECK (available >= 0),
    held DECIMAL(20,8) DEFAULT 0.00000000 CHECK (held >= 0),
    pending DECIMAL(20,8) DEFAULT 0.00000000 CHECK (pending >= 0),
    total DECIMAL(20,8) GENERATED ALWAYS AS (available + held + pending) STORED,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_id, currency)
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE')),
    amount DECIMAL(20,8) NOT NULL CHECK (amount != 0),
    currency VARCHAR(3) NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exchange rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(18,8) NOT NULL CHECK (rate > 0),
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(from_currency, to_currency)
);

-- ========================================
-- Anti-Fraud Service Database
-- ========================================

-- Fraud rules table
CREATE TABLE IF NOT EXISTS fraud_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    weight DECIMAL(3,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    conditions JSONB NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('APPROVE', 'HOLD', 'REJECT', 'MANUAL_REVIEW')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fraud assessments table
CREATE TABLE IF NOT EXISTS fraud_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    withdrawal_id UUID,
    score DECIMAL(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    rules JSONB DEFAULT '[]',
    ml_score DECIMAL(5,4) CHECK (ml_score >= 0 AND ml_score <= 1),
    action VARCHAR(50) NOT NULL CHECK (action IN ('APPROVE', 'HOLD', 'REJECT', 'MANUAL_REVIEW')),
    reason TEXT NOT NULL,
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    assessment_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    requires_manual_review BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT
);

-- Fraud alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES fraud_assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Whitelist table
CREATE TABLE IF NOT EXISTS whitelist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('USER', 'DEVICE', 'IP', 'EMAIL', 'DOMAIN')),
    value VARCHAR(255) NOT NULL,
    reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Blacklist table
CREATE TABLE IF NOT EXISTS blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('USER', 'DEVICE', 'IP', 'EMAIL', 'DOMAIN')),
    value VARCHAR(255) NOT NULL,
    reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- User risk profiles table
CREATE TABLE IF NOT EXISTS user_risk_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    base_score DECIMAL(5,4) NOT NULL CHECK (base_score >= 0 AND base_score <= 1),
    transaction_history_score DECIMAL(5,4) NOT NULL CHECK (transaction_history_score >= 0 AND transaction_history_score <= 1),
    age_score DECIMAL(5,4) NOT NULL CHECK (age_score >= 0 AND age_score <= 1),
    verification_level VARCHAR(20) NOT NULL,
    dispute_rate DECIMAL(5,4) NOT NULL CHECK (dispute_rate >= 0 AND dispute_rate <= 1),
    velocity_score DECIMAL(5,4) NOT NULL CHECK (velocity_score >= 0 AND velocity_score <= 1),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_transactions INTEGER DEFAULT 0,
    total_amount DECIMAL(20,8) DEFAULT 0.00000000,
    average_transaction_amount DECIMAL(20,8) DEFAULT 0.00000000,
    account_age_days INTEGER DEFAULT 0,
    failed_attempts_24h INTEGER DEFAULT 0,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

-- ========================================
-- Notification Service Database
-- ========================================

-- Notification templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')),
    channel VARCHAR(50) NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    subject_template TEXT NOT NULL,
    content_template TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification queue table
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')),
    channel VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    state VARCHAR(20) DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- Audit Service Database
-- ========================================

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    changes JSONB DEFAULT '{}',
    ip_address INET NOT NULL,
    user_agent TEXT,
    session_id VARCHAR(255),
    correlation_id VARCHAR(255) NOT NULL,
    risk_score DECIMAL(5,4),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System events table
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'INFO' CHECK (severity IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    correlation_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- Reconciliation Service Database
-- ========================================

-- Reconciliation reports table
CREATE TABLE IF NOT EXISTS reconciliation_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    summary JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    file_path VARCHAR(500),
    file_size BIGINT,
    record_count INTEGER,
    created_by UUID REFERENCES users(id)
);

-- Reconciliation discrepancies table
CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reconciliation_reports(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('AMOUNT_MISMATCH', 'MISSING_LEDGER_ENTRY', 'DUPLICATE_ENTRY', 'TIMING_DIFFERENCE')),
    expected_value JSONB NOT NULL,
    actual_value JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- API Gateway Database
-- ========================================

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    key_hash VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    rate_limit_per_minute INTEGER DEFAULT 1000,
    rate_limit_per_hour INTEGER DEFAULT 10000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id)
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address INET NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    window_end TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- Indexes for better performance
-- ========================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_kyc_level ON users(kyc_level);
CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_sender_id ON payments(sender_id);
CREATE INDEX IF NOT EXISTS idx_payments_receiver_id ON payments(receiver_id);
CREATE INDEX IF NOT EXISTS idx_payments_state ON payments(state);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payments_amount ON payments(amount);
CREATE INDEX IF NOT EXISTS idx_payments_currency ON payments(currency);

-- Payment holds indexes
CREATE INDEX IF NOT EXISTS idx_payment_holds_payment_id ON payment_holds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_holds_is_released ON payment_holds(is_released);

-- Payment links indexes
CREATE INDEX IF NOT EXISTS idx_payment_links_payment_id ON payment_links(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_is_active ON payment_links(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_links_expires_at ON payment_links(expires_at);

-- Wallet balances indexes
CREATE INDEX IF NOT EXISTS idx_wallet_balances_wallet_id ON wallet_balances(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_currency ON wallet_balances(currency);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_last_updated ON wallet_balances(last_updated);

-- Wallet transactions indexes
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference_id ON wallet_transactions(reference_id);

-- Exchange rates indexes
CREATE INDEX IF NOT EXISTS idx_exchange_rates_from_currency ON exchange_rates(from_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_to_currency ON exchange_rates(to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_valid_from ON exchange_rates(valid_from);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_valid_until ON exchange_rates(valid_until);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);

-- System events indexes
CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_service_name ON system_events(service_name);

-- ========================================
-- Triggers for automatic timestamp updates
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for payments table
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for wallets table
CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for wallet_balances table
CREATE TRIGGER update_wallet_balances_last_updated
    BEFORE UPDATE ON wallet_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Initial data insertion
-- ========================================

-- Insert default notification templates
INSERT INTO notification_templates (id, type, channel, language, subject_template, content_template, metadata) VALUES
('template_welcome_email', 'EMAIL', 'en', 'Welcome to Fintech Platform', 'Welcome {{firstName}} {{lastName}}!', 'Thank you for joining our platform. Your account has been created successfully.'),
('template_payment_created', 'EMAIL', 'en', 'Payment Created', 'Payment {{amount}} {{currency}}', 'Your payment has been created successfully. Payment ID: {{paymentId}}'),
('template_payment_completed', 'EMAIL', 'en', 'Payment Completed', 'Your payment of {{amount}} {{currency}} has been completed successfully.'),
('template_payment_failed', 'EMAIL', 'en', 'Payment Failed', 'Your payment could not be processed. Reason: {{reason}}'),
('template_low_balance', 'EMAIL', 'en', 'Low Balance Alert', 'Your {{currency}} balance is running low. Current balance: {{balance}}'),
('template_security_alert', 'EMAIL', 'en', 'Security Alert', 'We detected suspicious activity on your account. Please secure your account immediately.'),
('template_fraud_alert', 'EMAIL', 'en', 'Fraud Alert', 'Suspicious activity detected for payment {{paymentId}}. Risk score: {{riskScore}}%');

-- Insert sample user for testing
INSERT INTO users (
    id, email, first_name, last_name, date_of_birth, password_hash, salt, 
    email_verified, phone_verified, created_at, updated_at
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'john.doe@example.com',
    'John',
    'Doe',
    '1990-01-01',
    '$2b$12$M$E$7x$K$8I9$V$J$g$H$M$u$Q$5$w$E$',
    'salt',
    true,
    true,
    NOW(),
    NOW()
);

-- Insert sample wallet
INSERT INTO wallets (id, user_id, created_at, updated_at, version) VALUES 
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW(), 1);

-- Insert sample wallet balance
INSERT INTO wallet_balances (id, wallet_id, currency, available, held, pending, last_updated) VALUES 
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'USD', 10000.00000000, 0.00000000, 0.00000000, NOW());

-- Insert sample fraud rules
INSERT INTO fraud_rules (id, name, description, enabled, weight, conditions, action, created_at, updated_at) VALUES
('rule_velocity_check', 'Check transaction velocity limits', true, 0.3, '{"max_per_hour": 10, "max_per_day": 50, "max_per_week": 200}', 'HOLD', NOW(), NOW()),
('rule_amount_anomaly', 'Detect unusual transaction amounts', true, 0.25, '{"multiplier": 5.0, "min_amount": 100}', 'MANUAL_REVIEW', NOW(), NOW()),
('rule_geolocation_anomaly', 'Detect unusual geographic locations', true, 0.2, '{"max_distance_km": 1000}', 'HOLD', NOW(), NOW()),
('rule_device_fingerprint', 'Check for new devices', true, 0.15, '{"require_verification": true}', 'MANUAL_REVIEW', NOW(), NOW()),
('rule_time_pattern', 'Detect unusual transaction timing', true, 0.1, '{"unusual_hours": [2, 3, 4, 5]}', 'MANUAL_REVIEW', NOW(), NOW());

COMMIT;
