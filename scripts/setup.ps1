# PowerShell Setup Script for Fintech Payment Platform
Write-Host "🚀 Setting up Fintech Payment Platform..." -ForegroundColor Green

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    Write-Host "Download from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if Docker Compose is installed
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Create environment file
if (-not (Test-Path "config\.env")) {
    Write-Host "📝 Creating environment file..." -ForegroundColor Blue
    Copy-Item "config\.env.example" "config\.env"
    Write-Host "✅ Environment file created. Please edit config\.env with your settings." -ForegroundColor Green
} else {
    Write-Host "✅ Environment file already exists." -ForegroundColor Green
}

# Create SSL certificates for local development
if (-not (Test-Path "config\ssl")) {
    Write-Host "🔐 Generating SSL certificates..." -ForegroundColor Blue
    New-Item -ItemType Directory -Force -Path "config\ssl"
    
    # Check if OpenSSL is available
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        openssl req -x509 -newkey rsa:4096 -keyout "config\ssl\key.pem" -out "config\ssl\cert.pem" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        Write-Host "✅ SSL certificates generated." -ForegroundColor Green
    } else {
        Write-Host "⚠️ OpenSSL not found. SSL certificates not generated." -ForegroundColor Yellow
        Write-Host "You can generate certificates manually or use mkcert." -ForegroundColor Gray
    }
} else {
    Write-Host "✅ SSL certificates directory already exists." -ForegroundColor Green
}

# Create network
Write-Host "🌐 Creating Docker network..." -ForegroundColor Blue
try {
    docker network create fintech-network 2>$null
    Write-Host "✅ Docker network created." -ForegroundColor Green
} catch {
    Write-Host "ℹ️ Docker network already exists." -ForegroundColor Gray
}

# Start infrastructure services
Write-Host "🏗️ Starting infrastructure services..." -ForegroundColor Blue
docker-compose up -d postgres-payment postgres-wallet eventstore redis rabbitmq

Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Blue
Start-Sleep -Seconds 30

# Check if services are healthy
Write-Host "🔍 Checking service health..." -ForegroundColor Blue
docker-compose ps

# Install Node.js dependencies if package.json exists
if (Test-Path "package.json") {
    Write-Host "📦 Installing Node.js dependencies..." -ForegroundColor Blue
    npm install
}

# Install dependencies for each service
$services = @("payment-service", "anti-fraud-service")
foreach ($service in $services) {
    $servicePath = "services\$service"
    if (Test-Path $servicePath) {
        Set-Location $servicePath
        
        if (Test-Path "package.json") {
            Write-Host "📦 Installing dependencies for $service..." -ForegroundColor Blue
            npm install
        }
        
        if (Test-Path "requirements.txt") {
            Write-Host "📦 Installing Python dependencies for $service..." -ForegroundColor Blue
            pip install -r requirements.txt
        }
        
        if (Test-Path "go.mod") {
            Write-Host "📦 Installing Go dependencies for $service..." -ForegroundColor Blue
            go mod download
        }
        
        Set-Location ../..
    }
}

Write-Host "✅ Setup completed!" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Next steps:" -ForegroundColor Cyan
Write-Host "1. Edit config\.env with your configuration" -ForegroundColor Gray
Write-Host "2. Run '.\scripts\migrate.ps1' to setup databases" -ForegroundColor Gray
Write-Host "3. Run 'npm run dev' to start all services" -ForegroundColor Gray
Write-Host "4. Access the application at http://localhost:3010" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Monitoring dashboards:" -ForegroundColor Cyan
Write-Host "- Grafana: http://localhost:3006 (admin/admin)" -ForegroundColor Gray
Write-Host "- Jaeger: http://localhost:16686" -ForegroundColor Gray
Write-Host "- RabbitMQ: http://localhost:15672 (admin/admin)" -ForegroundColor Gray
Write-Host ""
Write-Host "🔧 Useful commands:" -ForegroundColor Cyan
Write-Host "- View logs: docker-compose logs -f <service-name>" -ForegroundColor Gray
Write-Host "- Stop services: docker-compose down" -ForegroundColor Gray
Write-Host "- Restart services: docker-compose restart" -ForegroundColor Gray
Write-Host "- Access database: docker-compose exec postgres-payment psql -U payment_user -d payment_service" -ForegroundColor Gray
