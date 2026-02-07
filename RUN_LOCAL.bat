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
docker compose up -d postgres-payment postgres-wallet eventstore redis rabbitmq

if %errorlevel% neq 0 (
    echo ❌ Error al iniciar servicios con Docker Compose
    pause
    exit /b 1
)

echo ✅ Servicios de infraestructura iniciados
echo ⏳ Esperando 30 segundos para que los servicios estén listos...
timeout /t 30 /nobreak

REM Verificar estado
echo 🔍 Verificando estado de los servicios...
docker compose ps

REM Instalar dependencias
echo 📦 Instalando dependencias de Node.js...
npm install

REM Migrar bases de datos
echo 🗄️ Ejecutando migraciones de bases de datos...
powershell -ExecutionPolicy Bypass -File scripts\migrate.ps1

echo.
echo ✅ Setup completado!
echo.
echo 🌐 Acceso a las aplicaciones:
echo    Frontend: http://localhost:3010
echo    API: http://localhost:3000
echo    Grafana: http://localhost:3006 (admin/admin)
echo.
echo 📊 Para ver logs: docker compose logs -f
echo 🛑 Para detener: docker compose down
echo.
pause
