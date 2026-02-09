# Fintech Payment Platform

A robust, auditable, idempotent, and error-resistant payment platform similar to PayPal/Stripe.

## Completed Features

### Backend Services
- ✅ Payment Service - Core payment processing with state machine
- ✅ Wallet Service - Balance management and transactions  
- ✅ Auth Service - JWT authentication with 2FA support
- ✅ Anti-Fraud Service - ML-based fraud detection
- ✅ Notification Service - Email, SMS, push notifications
- ✅ Ledger Service - Immutable financial records
- ✅ Audit Service - Comprehensive audit logging

### Frontend
- ✅ React web application with TypeScript
- ✅ Redux state management
- ✅ Material-UI components
- ✅ Dashboard, payments, wallet, profile pages
- ✅ Admin dashboard

### Infrastructure
- ✅ Docker containers
- ✅ Kubernetes manifests
- ✅ Terraform configuration
- ✅ PostgreSQL database with migrations
- ✅ Redis caching
- ✅ RabbitMQ message queue

### Testing
- ✅ Unit tests for services
- ✅ Integration tests
- ✅ E2E tests
- ✅ Test data seeding

### Documentation
- ✅ API documentation (OpenAPI 3.0)
- ✅ Architecture documentation
- ✅ Deployment guides
- ✅ Quick start guide

## Quick Start

```bash
# Clone repository
git clone https://github.com/emvaa/payment-platform.git
cd payment-platform

# Setup local environment
npm run setup:local

# Start all services
npm run dev

# Run tests
npm run test
```

## Architecture

- Microservices with domain separation
- Event sourcing for immutable ledger
- Payment state machine with strict transitions
- Fraud detection with rule-based and ML scoring
- Idempotency using Redis with TTL
- Wallet balances with available/held/pending amounts
- Comprehensive audit logging
- PCI-DSS, GDPR, SOX compliance

## Tech Stack

**Backend:**
- TypeScript/Node.js, Go, Java, Python
- Express, NestJS, Spring Boot
- PostgreSQL, Redis, EventStoreDB
- RabbitMQ, Kafka
- Docker, Kubernetes, Terraform

**Frontend:**
- React 18 + TypeScript
- Redux Toolkit + RTK Query
- Material-UI v5
- React Router v6
- React Hook Form

**Infrastructure:**
- AWS/GCP/Azure support
- Prometheus, Grafana
- Jaeger tracing
- ELK Stack logging

## Services

| Service | Language | Port | Description |
|---------|----------|------|-------------|
| API Gateway | Node.js | 3000 | Routing, auth, rate limiting |
| Payment | TypeScript | 3001 | Payment orchestration |
| Wallet | TypeScript | 3002 | Balance management |
| Auth | TypeScript | 3003 | Authentication |
| Anti-Fraud | Python | 3004 | Fraud detection |
| Notification | Go | 3005 | Notifications |
| Ledger | Java | 3006 | Financial records |
| Audit | TypeScript | 3007 | Audit logging |
| Frontend | React | 3010 | Web application |

## Database Schema

Complete PostgreSQL schema with:
- Users, wallets, payments tables
- Fraud rules and assessments
- Audit logs and system events
- Notification templates and queue
- API keys and rate limiting
- Exchange rates and reconciliation

## Security

- JWT authentication with refresh tokens
- Two-factor authentication (TOTP)
- Role-based access control (RBAC)
- Rate limiting and DDoS protection
- Input validation and sanitization
- SQL injection prevention
- XSS and CSRF protection
- Encryption at rest and in transit

## API Endpoints

### Payments
- `POST /api/v1/payments` - Create payment
- `GET /api/v1/payments/:id` - Get payment
- `POST /api/v1/payments/:id/process` - Process payment
- `POST /api/v1/payments/:id/confirm` - Confirm payment
- `POST /api/v1/payments/:id/cancel` - Cancel payment

### Wallet
- `GET /api/v1/wallets/:id` - Get wallet
- `GET /api/v1/wallets/:id/balance` - Get balance
- `GET /api/v1/wallets/:id/transactions` - Get transactions

### Auth
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Register
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh` - Refresh token

## Scripts

```bash
npm run setup:local      # Setup local environment
npm run dev              # Start all services
npm run build            # Build all services
npm run test             # Run all tests
npm run test:unit        # Run unit tests
npm run test:integration # Run integration tests
npm run migrate          # Run database migrations
npm run seed             # Seed test data
npm run deploy:staging   # Deploy to staging
npm run deploy:prod      # Deploy to production
```

## Monitoring

- Health checks on all services
- Prometheus metrics collection
- Grafana dashboards
- Distributed tracing with Jaeger
- Centralized logging with ELK

## License

MIT License

## Support

For support, contact: support@fintech-platform.com

```
├── services/                 # Microservicios
│   ├── api-gateway/
│   ├── payment-service/
│   ├── ledger-service/
│   ├── wallet-service/
│   ├── anti-fraud-service/
│   ├── notification-service/
│   ├── reconciliation-service/
│   └── audit-service/
├── frontend/                 # Aplicaciones cliente
│   ├── web/
│   └── mobile/
├── shared/                   # Código compartido
│   ├── types/
│   └── utils/
├── infrastructure/           # Infraestructura como código
│   ├── docker/
│   ├── k8s/
│   └── terraform/
├── docs/                     # Documentación
│   ├── api/
│   └── architecture/
├── tests/                    # Tests
│   ├── integration/
│   └── e2e/
├── config/                   # Configuración
├── monitoring/               # Monitoring y alertas
└── scripts/                  # Scripts utilitarios
```

## Quick Start

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd fintech-payment-platform
```

2. **Iniciar servicios con Docker**
```bash
docker-compose up -d
```

3. **Ejecutar migraciones**
```bash
npm run migrate
```

4. **Iniciar frontend**
```bash
cd frontend/web
npm install
npm start
```

## API Documentation

La documentación de la API está disponible en:
- Swagger UI: http://localhost:3000/api-docs
- Postman Collection: `docs/api/postman-collection.json`

## Arquitectura Técnica

### Estados del Pago
```
PENDING → PROCESSING → COMPLETED
   ↓           ↓           ↓
FAILED → CANCELLED → REFUNDED
   ↓           ↓
EXPIRED → CHARGEBACK
```

### Ledger Events
```typescript
interface LedgerEvent {
  id: string;
  type: 'DEBIT' | 'CREDIT' | 'HOLD' | 'RELEASE';
  amount: Money;
  currency: string;
  accountId: string;
  paymentId: string;
  timestamp: ISO8601;
  metadata: Record<string, any>;
  signature: string;
  version: number;
}
```

## Security & Compliance

- 🔐 Firmas criptográficas SHA-256
- 🛡️ Protección contra replay attacks
- 📊 Auditoría inmutable con WORM storage
- 🔍 Reconstrucción histórica de balances
- ⚖️ Cumplimiento PCI-DSS Level 1

## Monitoring

- **Metrics**: Prometheus + Grafana
- **Logs**: ELK Stack
- **Tracing**: Jaeger
- **Alerts**: PagerDuty

## Development

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Go 1.21+
- Java 17+
- Python 3.11+

### Environment Setup
```bash
cp config/.env.example config/.env
# Edit config/.env with your settings
```

### Running Tests
```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## Deployment

### Staging
```bash
kubectl apply -f infrastructure/k8s/staging/
```

### Production
```bash
terraform apply infrastructure/terraform/production/
```

## Contributing

1. Fork del repositorio
2. Crear feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Abrir Pull Request

## License

Este proyecto está licenciado bajo la MIT License - ver el archivo [LICENSE](LICENSE) para detalles.

## Support

- 📧 Email: support@fintech-platform.com
- 💬 Slack: #fintech-platform-dev
- 📞 Emergency: +1-555-EMERGENCY
