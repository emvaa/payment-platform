-- Seed data for Fintech Payment Platform
-- This file contains sample data for development and testing

-- ========================================
-- Sample Users
-- ========================================

-- Insert sample users with different verification levels
INSERT INTO users (id, email, phone, first_name, last_name, date_of_birth, kyc_level, verification_status, risk_score, created_at, updated_at, metadata, is_active, password_hash, salt, two_factor_enabled, email_verified, phone_verified, permissions) VALUES
-- Premium verified user
('550e8400-e29b-41d4-a716-446655440001', '+1-555-123-4567', '555-123-4567', '1985-05-15', 'PREMIUM', 'VERIFIED', 0.1500, NOW(), NOW(), '{"preferred_currency": "USD", "risk_tolerance": "high"}', true, '$2b$12$M$E$7x$K$8I9$V$J$g$H$M$u$Q$5$w$E$', 'salt', true, true, true, true, '["PAYMENTS_SEND", "PAYMENTS_RECEIVE", "WALLET_MANAGE", "PROFILE_VIEW", "ADMIN_ACCESS"]'),

-- Enhanced verified user
('550e8400-e29b-41d4-a716-446655440002', '+1-555-123-4568', 'Jane', 'Smith', '1992-03-20', 'ENHANCED', 'VERIFIED', 0.3500, NOW(), NOW(), '{"preferred_currency": "EUR", "risk_tolerance": "medium"}', true, '$2b$12$M$E$7x$K$8I9$V$J$g$H$M$u$Q$5$w$E$', 'salt', true, false, true, true, true, ["PAYMENTS_SEND", "PAYMENTS_RECEIVE", "WALLET_MANAGE", "PROFILE_VIEW"]'),

-- Basic verified user
('550e8400-e29b-41d4-a716-446655440003', '+1-555-123-4569', 'Bob', 'Johnson', '1995-08-10', 'BASIC', 'VERIFIED', 0.6500, NOW(), NOW(), '{"preferred_currency": "USD", "risk_tolerance": "low"}', true, '$2b$12$M$E$7x$K$8I9$V$J$g$H$M$u$Q$5$w$E$', 'salt', true, false, true, true, true, ["PAYMENTS_SEND", "PROFILE_VIEW"]'),

-- New user (unverified)
('550e8400-e29b-41d4-a716-446655440004', '+1-555-123-4570', 'Alice', 'Williams', '1998-12-01', 'NONE', 'PENDING', 0.8000, NOW(), NOW(), '{"preferred_currency": "USD", "risk_tolerance": "low"}', true, '$2b$12$M$E$7x$K$8I9$V$J$g$H$M$u$Q$5$w$E$', 'salt', true, false, false, true, false, []'),

-- High risk user
('550e8400-e29b-41d4-a716-446655440005', '+1-555-123-4571', 'Charlie', 'Brown', '1990-07-15', 'BASIC', 'PENDING', 0.8500, NOW(), NOW(), '{"preferred_currency": "USD", "risk_tolerance": "low"}', true, '$2b$12$M$E$7x$K$8I9$V$J$g$H$M$u$Q$5$w$E$', 'salt', true, false, true, true, true, ["PAYMENTS_SEND"]);

-- ========================================
-- Sample Wallets and Balances
-- ========================================

-- Create wallets for sample users
INSERT INTO wallets (id, user_id, is_active, created_at, updated_at, version) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440004', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', false, NOW(), NOW(), 1);

-- Insert wallet balances
INSERT INTO wallet_balances (id, wallet_id, currency, available, held, pending, last_updated) VALUES
-- Premium user wallets
('550e8400-e29b-41d44-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'USD', 50000.00000000, 0.00000000, 0.00000000, NOW()),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'EUR', 25000.00000000, 0.00000000, 0.00000000, NOW()),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'GBP', 15000.00000000, 0.00000000, 0.00000000, NOW()),

-- Enhanced user wallet
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440002', 'USD', 7500.00000000, 0.00000000, 0.00000000, NOW()),
('550e840-e29b-41d4-a716-446655440002', 'EUR', 5000.00000000, 0.00000000, 0.00000000, NOW()),

-- Basic user wallet
('550e840-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440003', 'USD', 1000.00000000, 0.00000000, 0.00000000, NOW()),

-- New user wallet
('550e840-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440004', true, NOW(), NOW(), 1),
('550e8400-e29b-41d4-a716-446655440004', '550e840-e29b-41d4-a716-446655440004', 'USD', 500.00000000, 0.00000000, 0.00000000, NOW()),

-- Inactive user wallet
('550e8400-e29b-41d4-a716-446655440005', '550e840-e29b-41d4-a716-446655440005', false, NOW(), NOW(), 1);

-- ========================================
-- Sample Exchange Rates
-- ========================================

INSERT INTO exchange_rates (id, from_currency, to_currency, rate, valid_from, valid_until, created_at, updated_at) VALUES
('rate_usd_eur', 'USD', 'EUR', 0.85, NOW(), NOW() + INTERVAL '1 year', NOW()),
('rate_usd_gbp', 'USD', 'GBP', 1.27, NOW(), NOW() + INTERVAL '1 year', NOW()),
('rate_usd_jpy', 'USD', 'JPY', 0.0070, NOW(), NOW() + INTERVAL '1 year', NOW()),
('rate_usd_cad', 'USD', 'CAD', 0.75, NOW(), NOW() + INTERVAL '1 year', NOW()),
('rate_eur_gbp', 'EUR', 'GBP', 1.15, NOW(), NOW() + INTERVAL '1 year', NOW()),
('rate_eur_usd', 'EUR', 'USD', 1.18, NOW(), NOW() + INTERVAL '1 year', NOW());

-- ========================================
-- Sample Payments
-- ========================================

-- Sample completed payments
INSERT INTO payments (id, type, state, amount, currency, sender_id, receiver_id, description, metadata, idempotency_key, created_at, updated_at, completed_at, risk_score, processed_by_ledger, notification_sent) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'DIRECT_PAYMENT', 'COMPLETED', 100.00, 'USD', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'Test payment from Alice to Bob', '{"invoice_id": "INV-001"}', 'idemp_test_001', NOW(), NOW(), NOW(), NOW(), 0.2500, false),

('550e8400-e29b-41d4-a716-446655440001', 'PAYMENT_LINK', 'COMPLETED', 250.00, 'USD', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'Payment for services', '{"service_type": "consulting"}', 'idemp_test_002', NOW(), NOW(), NOW(), NOW(), 0.3000, false),

('550e8400-e29b-41d4-a716-446655440001', 'WITHDRAWAL', 'COMPLETED', 500.00, 'USD', '550e840-e29b-41d4-a716-446655440001', NULL, 'Weekly withdrawal', '{"withdrawal_method": "bank_transfer"}', 'idemp_test_003', NOW(), NOW(), NOW(), NOW(), 0.4500, false),

('550e8400-e29b-41d4-a716-446655440001', 'DIRECT_PAYMENT', 'FAILED', 1000.00, 'USD', '550e840-e29b-41d4-a716-446655440001', '550e840-e29b-41d4-a716-446655440002', 'Failed payment', '{"error": "Insufficient funds"}', 'idemp_test_004', NOW(), NOW(), NOW(), NOW(), 0.7500, false),

('550e400-e29b-41d4-a716-446655440001', 'DIRECT_PAYMENT', 'COMPLETED', 75.00, 'USD', '550e840-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003', 'Small payment', '{"category": "coffee"}', 'idemp_test_005', NOW(), NOW(), NOW(), NOW(), 0.1000, false),

-- Pending payment
('550e8400-e29b-41d4-a716-446655440001', 'DIRECT_PAYMENT', 'PENDING', 200.00, 'USD', '550e840-e29b-41d4-a716-446655440002', '550e840-e29b-41d4-a716-446655440003', 'Pending payment', '{"priority": "normal"}', 'idemp_test_006', NOW(), NOW(), NOW(), NOW(), 0.2000, false),

-- Expired payment
('550e840-e29b-41d4-a716-446655440001', 'PAYMENT_LINK', 'EXPIRED', 50.00, 'USD', '550e840-e29b-41d4-a716-446655440001', 'Expired payment link', '{"link_id": "link-001"}', 'idemp_test_007', NOW(), NOW() - INTERVAL '1 day', NOW(), NOW(), 0.1000, false);

-- ========================================
-- Sample Payment Holds
-- ========================================

INSERT INTO payment_holds (id, payment_id, amount, currency, reason, release_at, is_released, created_at, released_at) VALUES
('hold_001', '550e840-e29b-41d4-a716-446655440001', 100.00, 'USD', 'Fraud review required', NOW() + INTERVAL '7 days', NOW(), false),

('hold_002', '550e840-e29b-41d4-a716-446655440001', 50.00, 'USD', 'High transaction amount', NOW() + INTERVAL '3 days', NOW(), false),

('hold_003', '550e840-e29b-41d4-a716-446655440001', 25.00, 'USD', 'New user hold', NOW() + INTERVAL '1 day', NOW(), false),

-- Released holds
UPDATE payment_holds SET is_released = true, released_at = NOW() WHERE id = 'hold_003';

-- ========================================
-- Sample Payment Links
-- ========================================

INSERT INTO payment_links (id, payment_id, url, expires_at, max_uses, current_uses, is_active, metadata, created_at, updated_at) VALUES
('link_001', '550e840-e29b-41d4-a716-446655440001', 'https://pay.fintech-platform.com/link/link-001', NOW() + INTERVAL '7 days', 10, 0, true, '{"source": "email_campaign"}', NOW(), NOW()),

('link_002', '550e840-e29b-41d4-a716-446655440002', 'https://pay.fintech-platform.com/link/link-002', NOW() + INTERVAL '30 days', 5, 0, true, '{"source": "social_media"}', NOW(), NOW()),

('link_003', '550e840-e29b-41d4-a716-446655440001', 'https://pay.fintech-platform.com/link/link-003', NULL, 1, 0, true, '{"source": "qr_code"}', NOW(), NOW()),

-- Expired link
UPDATE payment_links SET is_active = false WHERE id = 'link_001';

-- ========================================
-- Sample Fraud Assessments
-- ========================================

INSERT INTO fraud_assessments (id, user_id, transaction_id, score, risk_level, rules, ml_score, action, reason, confidence, assessment_time_ms, created_at, requires_manual_review) VALUES
('fraud_001', '550e840-e29b-41d4-a716-446655440001', '550e840-e29b-41d4-a716-446655440001', 0.8500, 'HIGH', '[{"ruleName": "amount_anomaly", "triggered": true, "score": 0.6, "details": {"multiplier": 8.0, "min_amount": 100}}]', 'MANUAL_REVIEW', 'High risk amount detected', 0.75, 150, NOW(), true),

('fraud_002', '550e840-e29b-41d4-a716-446655440002', '550e840-e29b-41d4-a716-446655440002', 0.1500, 'LOW', '[{"ruleName": "velocity_check", "triggered": false, "score": 0.1, "details": {"count": 2, "limit": 10}}]', 'APPROVE', 'Low risk user', 0.90, 80, NOW(), false),

('fraud_003', '550e840-e29b-41d4-a716-446655440003', '550e840-e29b-41d4-a716-446655440003', 0.9500, 'CRITICAL', '[{"ruleName": "device_fingerprint", "triggered": true, "score": 0.9, "details": {"new_device": true}}]', 'REJECT', 'New device detected', 0.95, 200, NOW(), true),

('fraud_004', '550e840-e29b-41d4-a716-446655440004', '550e840-e29b-41d4-a716-446655440004', '550840-e29b-41d4-a716-446655440004', '550840-e29b-41d4-a716-446655440004', 0.4500, 'MEDIUM', '[{"ruleName": "geolocation_anomaly", "triggered": true, "score": 0.3, "details": {"distance_km": 1500}}]', 'HOLD', 'Unusual location detected', 0.80, 120, NOW(), false),

('fraud_005', '550e840-e29b-41d4-a716-446655440001', '550e840-e29b-41d4-a716-446655440001', 0.2500, 'LOW', '[{"ruleName": "time_pattern", "triggered": false, "score": 0.1, "details": {"unusual_hours": [2, 3, 4]}]', 'APPROVE', 'Normal transaction pattern', 0.85, 60, NOW(), false);

-- ========================================
-- Sample Fraud Alerts
-- ========================================

INSERT INTO fraud_alerts (id, assessment_id, user_id, alert_type, severity, title, description, metadata, is_resolved, created_at) VALUES
('alert_001', 'fraud_001', '550e840-e29b-41d4-a716-446655440001', 'HIGH_RISK', 'High Risk Transaction', 'Transaction requires manual review', '{"amount": 1000, "risk_score": 0.85}', 'CRITICAL', NOW(), false),

('alert_002', 'fraud_003', '550e840-e29b-41d4-a716-446655440003', 'CRITICAL', 'Security Alert', 'New device detected', '{"device_fingerprint": "unknown"}', 'CRITICAL', NOW(), false);

-- ========================================
-- Sample Notification Templates
-- ========================================

INSERT INTO notification_templates (id, type, channel, language, subject_template, content_template, metadata, is_active, created_at, updated_at) VALUES
('template_verification_code', 'SMS', 'en', 'Verification Code', 'Your verification code is: {{code}}', 'Enter {{code}} to verify your identity. This code will expire in 10 minutes.', NOW(), NOW(), true),

('template_password_reset', 'EMAIL', 'en', 'Password Reset', 'Your password has been reset successfully. If you didn\'t request this, please contact support immediately.', NOW(), NOW(), true),

('template_account_suspended', 'EMAIL', 'en', 'Account Suspended', 'Your account has been suspended due to suspicious activity. Please contact support for assistance.', NOW(), NOW(), true),

('template_kyc_approved', 'EMAIL', 'en', 'KYC Approved', 'Congratulations! Your identity verification has been approved. You now have access to enhanced features.', NOW(), NOW(), true),

('template_kyc_rejected', 'EMAIL', 'en', 'KYC Verification Failed', 'We were unable to verify your identity. Please contact support for assistance.', NOW(), NOW(), true);

-- ========================================
-- Sample Wallet Transactions
-- ========================================

-- Credit transactions (deposits)
INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, reference_id, description, created_at) VALUES
('wt_001', '550e840-e29b-41d4-a716-446655440001', 'CREDIT', 1000.00, 'USD', 'dep_001', 'Initial deposit', NOW()),
('wt_002', '550e40-e29b-41d4-a716-446655440001', 'CREDIT', 500.00, 'USD', 'dep_002', 'Salary deposit', NOW()),
('wt_003', '550e840-e29b-41d4-a716-446655440001', 'CREDIT', 250.00, 'USD', 'dep_003', 'Refund from failed payment', NOW()),
('wt_004', '550e400-e29b-41d4-a716-446655440001', 'CREDIT', 10000.00, 'USD', 'bonus_payment', NOW()),

-- Debit transactions (payments)
INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, reference_id, description, created_at) VALUES
('wt_005', '550e840-e29b-41d4-a716-446655440001', 'DEBIT', 100.00, 'USD', 'pay_001', 'Payment to Bob', NOW()),
('wt_006', '550e8400-e29b-41d4-a716-446655440001', 'DEBIT', 50.00, 'USD', 'pay_002', 'Coffee shop purchase', NOW()),
('wt_007', '550840-e29b-41d4-a716-446655440001', 'DEBIT', 25.00, 'USD', 'pay_003', 'Restaurant dinner', NOW()),
('wt_008', '550840-e29b-41d4-a716-446655440001', 'DEBIT', 75.00, 'USD', 'pay_004', 'Online subscription', NOW()),

-- Hold transactions
INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, reference_id, description, created_at) VALUES
('wt_009', '550e840-e29b-41d4-a716-446655440001', 'HOLD', 1000.00, 'USD', 'hold_001', 'Payment hold for fraud review', NOW()),
('wt_010', '550840-e29b-41d4-a716-446655440001', 'HOLD', 50.00, 'USD', 'hold_002', 'Payment hold for new user', NOW()),

-- Release transactions
INSERT INTO wallet_transactions (id, wallet_id, type, amount, currency, reference_id, description, created_at) VALUES
('wt_011', '550e840-e29b-41d4-a716-446655440001', 'RELEASE', 1000.00, 'USD', 'hold_001', 'Fraud review completed', NOW()),

-- ========================================
-- Sample API Keys
-- ========================================

INSERT INTO api_keys (id, name, key_hash, permissions, rate_limit_per_minute, rate_limit_per_hour, is_active, created_at, expires_at, created_by) VALUES
('key_001', 'frontend_web', 'hashed_key_001', '["READ", "WRITE"], 1000, 60000, true, NOW(), NOW() + INTERVAL '1 year', '550e840-e29b-41d4-a716-446655440001'),
('key_002', 'mobile_app', 'hashed_key_002', '["READ", "WRITE"], 500, 30000, true, NOW(), NOW() + INTERVAL '6 months', '550e840-e29b-41d4-a716-446655440001'),
('key_003', 'admin_panel', 'hashed_key_003', '["READ", "WRITE", "DELETE", "ADMIN"], 10000, 5000, true, NOW(), NOW() + INTERVAL '2 years', '550e840-e29b-41d4-a716-446655440001');

-- ========================================
-- Sample Rate Limits
-- ========================================

-- Simulate some rate limiting data
INSERT INTO rate_limits (ip_address, user_id, endpoint, request_count, window_start, window_end, created_at) VALUES
('192.168.1.1', NULL, '/api/v1/payments', 5, NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 minute', NOW()),
('192.168.1.1', '550e840-e29b-41d4-a716-446655440001', '/api/v1/payments', 3, NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 minute', NOW()),
('192.168.1.1', '550e840-e29b-41d4-a716-446655440001', '/api/v1/payments', 15, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', NOW());

COMMIT;
