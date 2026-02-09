@echo off
chcp 65001 >nul
cls
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║                  PayFlow - Deploy Local v2.0                  ║
echo ║           Sistema de Pagos tipo PayPal - Completo             ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

REM Check Docker
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker no está instalado
    echo Por favor instala Docker Desktop desde: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo ✅ Docker encontrado

REM Create .env if doesn't exist
if not exist .env (
    echo POSTGRES_PASSWORD=postgres> .env
    echo RABBITMQ_USER=admin>> .env
    echo RABBITMQ_PASSWORD=admin123>> .env
    echo JWT_SECRET=dev-local-secret>> .env
    echo GOOGLE_CLIENT_ID=>> .env
    echo SMTP_HOST=>> .env
    echo SMTP_PORT=>> .env
    echo SMTP_USER=>> .env
    echo SMTP_PASS=>> .env
    echo ✅ Archivo .env creado con valores por defecto
)

REM Stop existing containers
echo.
echo 🛑 Deteniendo contenedores existentes...
docker compose down --remove-orphans

REM Start infrastructure
echo.
echo 🏗️ Iniciando infraestructura...
docker compose up -d postgres-payment redis rabbitmq

if %errorlevel% neq 0 (
    echo ❌ Error al iniciar infraestructura
    pause
    exit /b 1
)

echo ✅ Infraestructura iniciada

REM Wait for PostgreSQL to be ready
echo.
echo ⏳ Esperando PostgreSQL (15 segundos)...
timeout /t 15 /nobreak >nul

REM Run migrations
echo.
echo 🗄️ Ejecutando migraciones...
docker compose exec -T postgres-payment psql -U payment_user -d payment_service -c "
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL,
    available DECIMAL(20,0) DEFAULT 0,
    held DECIMAL(20,0) DEFAULT 0,
    pending DECIMAL(20,0) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_id, currency)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE')),
    amount DECIMAL(20,0) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    reference_id VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    amount DECIMAL(20,0) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    sender_id VARCHAR(255) NOT NULL,
    receiver_id VARCHAR(255),
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

CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id VARCHAR(255) NOT NULL,
    amount DECIMAL(20,0) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    description TEXT,
    url VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    single_use BOOLEAN DEFAULT FALSE,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_sender ON payments(sender_id);
CREATE INDEX IF NOT EXISTS idx_payments_receiver ON payments(receiver_id);
CREATE INDEX IF NOT EXISTS idx_payments_state ON payments(state);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_merchant ON payment_links(merchant_id);
"

if %errorlevel% neq 0 (
    echo ⚠️ Algunas migraciones pueden haber fallado, continuando...
)

REM Build and start payment service
echo.
echo 🚀 Construyendo y levantando payment-service...
docker compose up -d --build payment-service

if %errorlevel% neq 0 (
    echo ❌ Error al levantar payment-service
    pause
    exit /b 1
)

echo ✅ Payment-service iniciado

REM Start auth service
echo.
echo 🔐 Levantando auth-service...
docker compose up -d --build auth-service

REM Wait for services
echo.
echo ⏳ Esperando servicios (10 segundos)...
timeout /t 10 /nobreak >nul

REM Health check
echo.
echo 🔍 Verificando servicios...
curl -s http://localhost:3001/health | findstr "healthy" >nul
if %errorlevel% equ 0 (
    echo ✅ Payment Service: OK
) else (
    echo ⚠️ Payment Service: No responde aún
)

curl -s http://localhost:3007/health | findstr "healthy" >nul
if %errorlevel% equ 0 (
    echo ✅ Auth Service: OK
) else (
    echo ⚠️ Auth Service: No responde aún
)

REM Install and start frontend
echo.
echo 🎨 Instalando dependencias del frontend...
cd frontend\web
call npm install --legacy-peer-deps 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ Algunos warnings de instalación, continuando...
)

echo.
echo 🚀 Iniciando frontend Vite...
start "PayFlow Frontend" cmd /k "npm run dev -- --port 5174 --host"
cd ..\..

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║                    ✅ DEPLOY COMPLETADO                       ║
echo ╠═══════════════════════════════════════════════════════════════╣
echo ║  🌐 Acceso a las aplicaciones:                               ║
echo ║                                                               ║
echo ║  Frontend:  http://localhost:5174                            ║
echo ║  Payment API: http://localhost:3001                            ║
echo ║  Auth API:   http://localhost:3007                           ║
echo ║  RabbitMQ:   http://localhost:15672  (admin/admin123)       ║
echo ║                                                               ║
echo ║  📱 Flujo de prueba:                                         ║
echo ║  1. Ve a /wallet y deposita Gs. 100,000                     ║
echo ║  2. Ve a /send y envía dinero a otro usuario                 ║
echo ║  3. Crea un link de pago y compártelo                        ║
echo ║  4. Abre el link en otra pestaña y paga                      ║
echo ║  5. Revisa tu actividad en /activity                         ║
echo ║                                                               ║
echo ║  📊 Logs: docker compose logs -f                             ║
echo ║  🛑 Detener: docker compose down                             ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
pause
