-- Ledger Double-Entry Accounting Schema
-- Creates proper double-entry bookkeeping tables

-- Ledger accounts chart
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    parent_id UUID REFERENCES ledger_accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Journal entries (each transaction)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reference_type VARCHAR(50) NOT NULL, -- 'PAYMENT', 'REFUND', 'FEE', etc
    reference_id UUID NOT NULL,
    description TEXT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    total_debit DECIMAL(20,8) NOT NULL,
    total_credit DECIMAL(20,8) NOT NULL,
    CHECK (total_debit = total_credit), -- Invariant: debits must equal credits
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Journal lines (individual debit/credit lines)
CREATE TABLE IF NOT EXISTS journal_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id),
    line_number INTEGER NOT NULL,
    description TEXT,
    debit_amount DECIMAL(20,8) DEFAULT 0 CHECK (debit_amount >= 0),
    credit_amount DECIMAL(20,8) DEFAULT 0 CHECK (credit_amount >= 0),
    CHECK (debit_amount > 0 OR credit_amount > 0), -- Must have either debit or credit
    CHECK (debit_amount = 0 OR credit_amount = 0), -- Cannot have both debit and credit on same line
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Account balances (materialized view of running balances)
CREATE TABLE IF NOT EXISTS account_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES ledger_accounts(id),
    currency VARCHAR(3) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    opening_balance DECIMAL(20,8) DEFAULT 0,
    total_debits DECIMAL(20,8) DEFAULT 0,
    total_credits DECIMAL(20,8) DEFAULT 0,
    closing_balance DECIMAL(20,8) DEFAULT 0,
    last_entry_id UUID REFERENCES journal_entries(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, currency, period_start, period_end)
);

-- Insert default chart of accounts for PayPal-like system
INSERT INTO ledger_accounts (code, name, type) VALUES
('1000', 'Customer Wallets (Liability)', 'LIABILITY'),
('2000', 'Merchant Payables', 'LIABILITY'),
('3000', 'Fee Revenue', 'REVENUE'),
('4000', 'Payment Processing Expense', 'EXPENSE'),
('5000', 'Suspense/Hold Account', 'ASSET'),
('9000', 'Equity', 'EQUITY')
ON CONFLICT (code) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_account_balances_account ON account_balances(account_id, currency);

-- Function to validate journal entry balances
CREATE OR REPLACE FUNCTION validate_journal_entry()
RETURNS TRIGGER AS $$
BEGIN
    -- Check that total debits equals total credits for this entry
    IF EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.id = NEW.entry_id
        AND (
            SELECT COALESCE(SUM(debit_amount), 0) 
            FROM journal_lines 
            WHERE entry_id = NEW.entry_id
        ) != (
            SELECT COALESCE(SUM(credit_amount), 0) 
            FROM journal_lines 
            WHERE entry_id = NEW.entry_id
        )
    ) THEN
        RAISE EXCEPTION 'Journal entry is not balanced: debits do not equal credits';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce balanced journal entries
DROP TRIGGER IF EXISTS trigger_validate_journal_entry ON journal_lines;
CREATE TRIGGER trigger_validate_journal_entry
    AFTER INSERT OR UPDATE ON journal_lines
    FOR EACH ROW EXECUTE FUNCTION validate_journal_entry();

-- Function to create a journal entry for payment
CREATE OR REPLACE FUNCTION create_payment_journal_entry(
    p_payment_id UUID,
    p_sender_id UUID,
    p_receiver_id UUID,
    p_amount DECIMAL(20,8),
    p_currency VARCHAR(3),
    p_description TEXT
) RETURNS UUID AS $$
DECLARE
    v_entry_id UUID;
    v_wallet_account_id UUID;
BEGIN
    -- Get the customer wallets account
    SELECT id INTO v_wallet_account_id FROM ledger_accounts WHERE code = '1000';
    
    -- Create the journal entry
    INSERT INTO journal_entries (
        reference_type, reference_id, description, currency, total_debit, total_credit
    ) VALUES (
        'PAYMENT', p_payment_id, p_description, p_currency, p_amount, p_amount
    ) RETURNING id INTO v_entry_id;
    
    -- Debit sender's wallet (decrease liability)
    INSERT INTO journal_lines (entry_id, account_id, line_number, description, debit_amount)
    VALUES (v_entry_id, v_wallet_account_id, 1, 'Debit from sender ' || p_sender_id::text, p_amount);
    
    -- Credit receiver's wallet (increase liability)
    INSERT INTO journal_lines (entry_id, account_id, line_number, description, credit_amount)
    VALUES (v_entry_id, v_wallet_account_id, 2, 'Credit to receiver ' || p_receiver_id::text, p_amount);
    
    RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;
