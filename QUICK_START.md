# 🚀 Quick Start Guide - Fintech Payment Platform

## ⚠️ Prerrequisitos

Antes de comenzar, asegúrate de tener instalado:

### 1. Docker Desktop
- Descargar desde: https://www.docker.com/products/docker-desktop
- Instalar y reiniciar el sistema
- Verificar instalación: `docker --version`

### 2. Node.js (v18+)
- Descargar desde: https://nodejs.org/
- Verificar: `node --version`

### 3. Git
- Descargar desde: https://git-scm.com/
- Verificar: `git --version`

## 🏠 Setup Local (Paso a Paso)

### Paso 1: Configurar Variables de Entorno
```bash
# Copiar archivo de configuración
copy config\.env.example config\.env

# Editar con tu editor preferido
notepad config\.env
```

**Variables importantes a configurar:**
```bash
POSTGRES_PASSWORD=tu_password_seguro
JWT_SECRET=tu_jwt_secret_min_256_bits
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://admin:admin@localhost:5672
```

### Paso 2: Iniciar Infraestructura
```bash
# Iniciar servicios de base de datos
docker compose up -d postgres-payment postgres-wallet eventstore redis rabbitmq

# Esperar 30 segundos para que los servicios inicien
timeout /t 30

# Verificar estado
docker compose ps
```

### Paso 3: Migrar Bases de Datos
```bash
# Ejecutar migraciones (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\migrate.ps1

# O ejecutar manualmente los comandos SQL:
docker compose exec postgres-payment psql -U payment_user -d payment_service -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
docker compose exec postgres-wallet psql -U wallet_user -d wallet_service -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### Paso 4: Instalar Dependencias
```bash
# Instalar dependencias principales
npm install

# Instalar dependencias de servicios
cd services\payment-service && npm install && cd ..\..
cd services\anti-fraud-service && pip install -r requirements.txt && cd ..\..
cd services\ledger-service && go mod download && cd ..\..
cd services\wallet-service && (mvn install si usa Maven) && cd ..\..
```

### Paso 5: Iniciar Servicios
```bash
# Iniciar todos los servicios
docker compose up -d

# Ver logs
docker compose logs -f payment-service
```

## 🌐 Acceso a la Aplicación

Una vez iniciado:

### Aplicaciones Web
- **Frontend**: http://localhost:3010
- **API Gateway**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api-docs

### Monitoring
- **Grafana**: http://localhost:3006 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **RabbitMQ**: http://localhost:15672 (admin/admin)

### Bases de Datos
```bash
# Payment Service DB
docker compose exec postgres-payment psql -U payment_user -d payment_service

# Wallet Service DB
docker compose exec postgres-wallet psql -U wallet_user -d wallet_service
```

## 🔧 Comandos Útiles

### Gestión de Servicios
```bash
# Ver todos los servicios
docker compose ps

# Ver logs de un servicio
docker compose logs -f payment-service

# Reiniciar un servicio
docker compose restart payment-service

# Detener todos los servicios
docker compose down

# Limpiar todo
docker compose down -v --remove-orphans
```

### Verificación de Salud
```bash
# Verificar API Gateway
curl http://localhost:3000/health

# Verificar Payment Service
curl http://localhost:3001/health

# Verificar Wallet Service
curl http://localhost:3002/health
```

### Base de Datos
```bash
# Conectar a Payment DB
docker compose exec postgres-payment psql -U payment_user -d payment_service

# Ver tablas
\dt

# Ver datos
SELECT * FROM payments LIMIT 5;

# Salir
\q
```

## 🚨 Solución de Problemas

### Docker no encontrado
```bash
# Reinstalar Docker Desktop
# Asegurarse que Docker está iniciado
# Verificar en PowerShell: docker --version
```

### Error de conexión a base de datos
```bash
# Verificar si el contenedor está corriendo
docker compose ps postgres-payment

# Ver logs
docker compose logs postgres-payment

# Reiniciar base de datos
docker compose restart postgres-payment
```

### Puerto en uso
```bash
# Ver qué proceso usa el puerto
netstat -ano | findstr :3000

# Matar proceso
taskkill /PID <PID> /F
```

### Permisos en PowerShell
```bash
# Ejecutar como administrador
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## 📊 Datos de Prueba

El sistema incluye datos de prueba:

### Usuario
- **Email**: john.doe@example.com
- **Password**: (configurar en config/.env)
- **KYC Level**: ENHANCED
- **Verification Status**: VERIFIED

### Wallet
- **Balance**: $10,000 USD
- **Currency**: USD
- **Available**: $10,000

### API Keys
Las claves se configuran en `config/.env`:
```bash
STRIPE_SECRET_KEY=sk_test_...
PLAID_CLIENT_ID=your_client_id
JWT_SECRET=your_secret_key
```

## 🎯 Flujo Completo de Prueba

### 1. Crear Payment
```bash
curl -X POST http://localhost:3000/v1/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -d '{
    "type": "DIRECT_PAYMENT",
    "amount": {"amount": 100, "currency": "USD", "precision": 2},
    "senderId": "550e8400-e29b-41d4-a716-446655440000",
    "receiverId": "550e8400-e29b-41d4-a716-446655440001",
    "description": "Test payment",
    "idempotencyKey": "test_payment_001"
  }'
```

### 2. Verificar Estado
```bash
curl -X GET http://localhost:3000/v1/payments/<payment_id> \
  -H "Authorization: Bearer <your_jwt_token>"
```

### 3. Procesar Payment
```bash
curl -X POST http://localhost:3000/v1/payments/<payment_id>/process \
  -H "Authorization: Bearer <your_jwt_token>"
```

## 📈 Monitoreo en Tiempo Real

### Grafana Dashboards
- **System Overview**: http://localhost:3006/d/system-overview
- **Payment Metrics**: http://localhost:3006/d/payments
- **Database Performance**: http://localhost:3006/d/database
- **Infrastructure**: http://localhost:3006/d/infrastructure

### Alertas Configuradas
- Alta latencia (>200ms)
- Tasa de error (>5%)
- Servicios caídos
- Espacio en disco bajo (<10%)

## 🆘 Soporte Rápido

### Comandos de Diagnóstico
```bash
# Verificar todo el sistema
docker compose ps

# Ver recursos del sistema
docker stats

# Limpiar si es necesario
docker system prune -a

# Ver logs de errores
docker compose logs --tail=100 payment-service | grep ERROR
```

### Reset Completo
```bash
# Detener y limpiar todo
docker compose down -v --remove-orphans

# Limpiar imágenes Docker
docker system prune -a

# Volver a iniciar
docker compose up -d
```

---

## 🎉 ¡Listo para Usar!

Una vez completados estos pasos, tendrás:

✅ **Plataforma completa corriendo localmente**
✅ **Bases de datos con datos de prueba**
✅ **Sistema de monitoreo funcional**
✅ **API endpoints disponibles**
✅ **Documentación accesible**

**Próximo paso**: Comienza a probar los endpoints o integra el frontend con la API.
