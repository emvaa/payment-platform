#!/bin/bash

# Setup Script for Fintech Payment Platform
echo "🚀 Setting up Fintech Payment Platform..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create environment file
if [ ! -f "config/.env" ]; then
    echo "📝 Creating environment file..."
    cp config/.env.example config/.env
    echo "✅ Environment file created. Please edit config/.env with your settings."
fi

# Generate SSL certificates for local development
if [ ! -d "config/ssl" ]; then
    echo "🔐 Generating SSL certificates..."
    mkdir -p config/ssl
    openssl req -x509 -newkey rsa:4096 -keyout config/ssl/key.pem -out config/ssl/cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
fi

# Create network
echo "🌐 Creating Docker network..."
docker network create fintech-network 2>/dev/null || echo "Network already exists"

# Start infrastructure services
echo "🏗️ Starting infrastructure services..."
docker-compose up -d postgres-payment postgres-wallet eventstore redis rabbitmq

echo "⏳ Waiting for services to be ready..."
sleep 30

# Check if services are healthy
echo "🔍 Checking service health..."
docker-compose ps

echo "✅ Setup completed!"
echo ""
echo "🎯 Next steps:"
echo "1. Edit config/.env with your configuration"
echo "2. Run 'npm run migrate' to setup databases"
echo "3. Run 'npm run dev' to start all services"
echo "4. Access the application at http://localhost:3010"
echo ""
echo "📊 Monitoring dashboards:"
echo "- Grafana: http://localhost:3006 (admin/admin)"
echo "- Jaeger: http://localhost:16686"
echo "- RabbitMQ: http://localhost:15672 (admin/admin)"
