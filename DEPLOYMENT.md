# 🚀 Deployment Guide - Fintech Payment Platform

## 📋 Prerequisites

### Required Software
- **Docker Desktop** (v20.10+)
- **Docker Compose** (v2.0+)
- **Node.js** (v18+)
- **Go** (v1.21+)
- **Java** (v17+)
- **Python** (v3.11+)
- **PowerShell** (v7+) or **Bash** (v4+)

### Cloud Deployment Prerequisites
- **AWS CLI** (v2.0+)
- **kubectl** (v1.28+)
- **Terraform** (v1.5+)
- **Helm** (v3.12+)

## 🏠 Local Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/emvaa/payment-platform.git
cd payment-platform
```

### 2. Run Setup Script
**Windows PowerShell:**
```powershell
.\scripts\setup.ps1
```

**Linux/macOS:**
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 3. Configure Environment
```bash
# Edit environment variables
cp config/.env.example config/.env
# Edit config/.env with your settings
```

### 4. Run Database Migrations
**Windows PowerShell:**
```powershell
.\scripts\migrate.ps1
```

**Linux/macOS:**
```bash
chmod +x scripts/migrate.sh
./scripts/migrate.sh
```

### 5. Start Services
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 6. Access Applications
- **Web Frontend**: http://localhost:3010
- **API Gateway**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api-docs

### 7. Monitoring Dashboards
- **Grafana**: http://localhost:3006 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **RabbitMQ**: http://localhost:15672 (admin/admin)

## ☁️ Cloud Deployment (AWS)

### 1. Configure AWS CLI
```bash
aws configure
# Enter your AWS credentials
```

### 2. Deploy to Staging
**Windows PowerShell:**
```powershell
.\scripts\deploy.ps1 -Environment staging -Region us-east-1
```

**Linux/macOS:**
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh staging us-east-1
```

### 3. Deploy to Production
```bash
# Production deployment (requires additional approvals)
./scripts/deploy.sh production us-east-1
```

## 🏗️ Infrastructure Components

### Docker Services
- **postgres-payment**: PostgreSQL for payment service
- **postgres-wallet**: PostgreSQL for wallet service
- **eventstore**: EventStoreDB for ledger
- **redis**: Redis for caching and sessions
- **rabbitmq**: Message queue for async communication

### Kubernetes Services
- **api-gateway**: Kong/Nginx gateway
- **payment-service**: Payment processing
- **ledger-service**: Financial ledger
- **wallet-service**: Wallet management
- **anti-fraud-service**: Fraud detection
- **notification-service**: Notifications
- **reconciliation-service**: Reconciliation
- **audit-service**: Audit logging

## 🔧 Configuration

### Environment Variables
Key variables in `config/.env`:

```bash
# Database Configuration
POSTGRES_PASSWORD=your_secure_password
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Message Queue
RABBITMQ_URL=amqp://user:pass@host:5672

# Security
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_32_character_encryption_key

# External Services
STRIPE_SECRET_KEY=sk_test_...
PLAID_CLIENT_ID=your_plaid_client_id
```

### Service Configuration
Each service has its own configuration:
- **Payment Service**: Port 3001
- **Ledger Service**: Port 3003
- **Wallet Service**: Port 3002
- **Anti-Fraud Service**: Port 3004
- **Notification Service**: Port 3005
- **API Gateway**: Port 3000

## 📊 Monitoring & Observability

### Metrics Collection
- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **AlertManager**: Alerting and notifications

### Logging
- **ELK Stack**: Centralized logging
- **Structured Logs**: JSON format
- **Log Levels**: ERROR, WARN, INFO, DEBUG

### Tracing
- **Jaeger**: Distributed tracing
- **OpenTelemetry**: Instrumentation
- **Correlation IDs**: Request tracking

## 🔒 Security Configuration

### SSL/TLS
```bash
# Local development certificates
openssl req -x509 -newkey rsa:4096 -keyout config/ssl/key.pem -out config/ssl/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### Secrets Management
- **Local**: Environment variables
- **Cloud**: AWS Secrets Manager / HashiCorp Vault
- **Kubernetes**: Secrets with encryption at rest

### Network Security
- **VPC**: Private networking
- **Security Groups**: Firewall rules
- **WAF**: Web Application Firewall
- **DDoS Protection**: AWS Shield

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database status
docker-compose ps postgres-payment

# View database logs
docker-compose logs postgres-payment

# Connect to database
docker-compose exec postgres-payment psql -U payment_user -d payment_service
```

#### Service Startup Issues
```bash
# View service logs
docker-compose logs payment-service

# Restart service
docker-compose restart payment-service

# Check service health
curl http://localhost:3001/health
```

#### Memory/CPU Issues
```bash
# Monitor resource usage
docker stats

# Check system resources
docker system df

# Clean up unused resources
docker system prune -a
```

### Performance Tuning

#### Database Optimization
```sql
-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Create indexes
CREATE INDEX CONCURRENTLY idx_payments_created_at 
ON payments(created_at);
```

#### Application Scaling
```bash
# Scale services
docker-compose up -d --scale payment-service=3

# Kubernetes scaling
kubectl scale deployment/payment-service --replicas=5 -n fintech-platform
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: Deploy
on:
  push:
    branches: [main, develop]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: npm test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to staging
        run: ./scripts/deploy.sh staging us-east-1
```

### Automated Testing
- **Unit Tests**: Jest, PyTest, JUnit
- **Integration Tests**: Docker Compose
- **E2E Tests**: Playwright/Cypress
- **Load Tests**: k6, Artillery

## 📈 Scaling Strategy

### Horizontal Scaling
- **Application Pods**: Kubernetes HPA
- **Database**: Read replicas, sharding
- **Cache**: Redis Cluster
- **Message Queue**: RabbitMQ Cluster

### Vertical Scaling
- **CPU/Memory**: Pod resource requests/limits
- **Storage**: EBS volumes, auto-scaling
- **Network**: Enhanced networking, VPC endpoints

## 🛡️ Backup & Recovery

### Database Backups
```bash
# PostgreSQL backups
docker-compose exec postgres-payment pg_dump -U payment_user payment_service > backup.sql

# Automated backups (AWS)
aws rds create-db-snapshot --db-instance-identifier payment-db --db-snapshot-identifier backup-$(date +%Y%m%d)
```

### Disaster Recovery
- **RTO**: 4 hours (Recovery Time Objective)
- **RPO**: 15 minutes (Recovery Point Objective)
- **Multi-AZ**: High availability
- **Cross-Region**: Disaster recovery

## 📋 Deployment Checklist

### Pre-deployment
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Security scans completed
- [ ] Performance tests passed
- [ ] Backup strategy verified

### Post-deployment
- [ ] Health checks passing
- [ ] Monitoring alerts configured
- [ ] Log aggregation working
- [ ] Load balancer configured
- [ ] SSL certificates valid

### Rollback Plan
- [ ] Previous version tagged
- [ ] Database rollback scripts ready
- [ ] Configuration backups available
- [ ] Communication plan prepared

## 🆘 Support

### Documentation
- **API Docs**: `/docs/api/`
- **Architecture**: `/docs/architecture/`
- **Service Guides**: `/services/*/README.md`

### Monitoring Alerts
- **Critical**: Service down, data loss
- **Warning**: High latency, error rates
- **Info**: Deployments, configuration changes

### Escalation
1. **Level 1**: On-call engineer
2. **Level 2**: Platform team
3. **Level 3**: Architecture team
4. **Emergency**: Management

---

## 🎯 Quick Start Commands

```bash
# Complete setup (one command)
curl -sSL https://raw.githubusercontent.com/emvaa/payment-platform/main/scripts/quick-start.sh | bash

# Development environment
npm run dev

# Production deployment
npm run deploy:prod

# Health check
npm run health:check

# View logs
npm run logs

# Run tests
npm run test
```

For additional support, create an issue in the GitHub repository or contact the platform team.
