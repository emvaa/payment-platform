# PowerShell Database Migration Script
Write-Host "🗄️ Running database migrations..." -ForegroundColor Green

# Wait for databases to be ready
Write-Host "⏳ Waiting for databases..." -ForegroundColor Blue
Start-Sleep -Seconds 10

# Payment Service Database
Write-Host "💳 Migrating Payment Service database..." -ForegroundColor Blue
$paymentMigration = @"
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL,
    amount DECIMAL(20,8) NOT NULL,
    currency VARCHAR(3) NOT NULL,
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
    risk_score DECIMAL(5,4)
);

-- Payment holds table
CREATE TABLE IF NOT EXISTS payment_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    amount DECIMAL(20,8) NOT NULL,
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
    payment_id UUID NOT NULL REFERENCES payments(id),
    url VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_sender_id ON payments(sender_id);
CREATE INDEX IF NOT EXISTS idx_payments_receiver_id ON payments(receiver_id);
CREATE INDEX IF NOT EXISTS idx_payments_state ON payments(state);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_holds_payment_id ON payment_holds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_payment_id ON payment_links(payment_id);
"@

docker-compose exec -T postgres-payment psql -U payment_user -d payment_service -c $paymentMigration

# Wallet Service Database
Write-Host "💰 Migrating Wallet Service database..." -ForegroundColor Blue
$walletMigration = @"
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    kyc_level VARCHAR(20) DEFAULT 'NONE',
    verification_status VARCHAR(20) DEFAULT 'PENDING',
    risk_score DECIMAL(5,4) DEFAULT 0.0000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version BIGINT DEFAULT 1
);

-- Wallet balances table
CREATE TABLE IF NOT EXISTS wallet_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    currency VARCHAR(3) NOT NULL,
    available DECIMAL(20,8) DEFAULT 0.00000000,
    held DECIMAL(20,8) DEFAULT 0.00000000,
    pending DECIMAL(20,8) DEFAULT 0.00000000,
    total DECIMAL(20,8) GENERATED ALWAYS AS (available + held + pending) STORED,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_id, currency)
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    type VARCHAR(20) NOT NULL, -- CREDIT, DEBIT, HOLD, RELEASE
    amount DECIMAL(20,8) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_wallet_id ON wallet_balances(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_currency ON wallet_balances(currency);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
"@

docker-compose exec -T postgres-wallet psql -U wallet_user -d wallet_service -c $walletMigration

Write-Host "✅ Database migrations completed!" -ForegroundColor Green
Write-Host ""

# Create sample data
Write-Host "📊 Creating sample data..." -ForegroundColor Blue
$sampleData = @"
INSERT INTO users (id, email, first_name, last_name, date_of_birth, kyc_level, verification_status)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440000', 'john.doe@example.com', 'John', 'Doe', '1990-01-01', 'ENHANCED', 'VERIFIED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (id, user_id)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet_balances (wallet_id, currency, available)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 'USD', 10000.00)
ON CONFLICT (wallet_id, currency) DO UPDATE SET available = EXCLUDED.available;
"@

docker-compose exec -T postgres-wallet psql -U wallet_user -d wallet_service -c $sampleData

Write-Host "🎉 Sample data created!" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 Verify databases:" -ForegroundColor Cyan
Write-Host "- Payment DB: docker-compose exec postgres-payment psql -U payment_user -d payment_service -c `"SELECT COUNT(*) FROM payments;`"" -ForegroundColor Gray
Write-Host "- Wallet DB: docker-compose exec postgres-wallet psql -U wallet_user -d wallet_service -c `"SELECT COUNT(*) FROM users;`"" -ForegroundColor Gray
