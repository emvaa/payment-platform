@echo off
echo 🚀 Iniciando Plataforma de Pagos Fintech...
echo.

REM Verificar Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker no está instalado o no está en el PATH
    echo Por favor instala Docker Desktop desde: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo ✅ Docker encontrado

REM Iniciar servicios de infraestructura
echo 🏗️ Iniciando servicios de base de datos...
docker compose up -d postgres-payment redis rabbitmq

if %errorlevel% neq 0 (
    echo ❌ Error al iniciar servicios con Docker Compose
    pause
    exit /b 1
)

echo ✅ Servicios de infraestructura iniciados
echo ⏳ Esperando 30 segundos para que los servicios estén listos...
timeout /t 30 /nobreak

REM Iniciar microservicios (stack mínimo)
echo 🚀 Iniciando microservicios (mínimo funcional)...
docker compose up -d --build auth-service payment-service

if %errorlevel% neq 0 (
    echo ❌ Error al iniciar microservicios con Docker Compose
    pause
    exit /b 1
)

echo ✅ Microservicios iniciados

REM Verificar estado
echo 🔍 Verificando estado de los servicios...
docker compose ps

REM Instalar dependencias
echo 📦 Instalando dependencias de Node.js...
npm install

REM Migrar bases de datos
echo 🗄️ Ejecutando migraciones de bases de datos...
powershell -ExecutionPolicy Bypass -File scripts\migrate.ps1

REM Iniciar frontend
echo 🎨 Frontend iniciado en http://localhost:5174
npm --prefix frontend/web run dev -- --port 5174 --host

echo.
echo ✅ Setup completado!
echo.
echo    Frontend:  http://localhost:5174
echo    API:         http://localhost:3001
echo    Auth:        http://localhost:3007
echo    RabbitMQ:    http://localhost:15672 (admin/admin123)
echo.
echo 📱 Flujo de prueba:
echo    1. Ve a http://localhost:5174/wallet y deposita Gs. 100,000
echo    2. Ve a /send y envia dinero a otro usuario
echo    3. Crea un link de pago y compartelo
echo    4. Abre el link en otra pestaña y paga
echo    5. Revisa tu actividad en /activity
echo.
echo 📊 Logs: docker compose logs -f
echo 🛑 Detener: docker compose down
echo.
pause
