@echo off
set OUTPUT_FILE=estructura_proyecto.txt

echo Generando estructura del proyecto... por favor espera un poquito. > %OUTPUT_FILE%
echo ======================================== >> %OUTPUT_FILE%
echo ESTRUCTURA DE CARPETAS - COSO DE PAGO >> %OUTPUT_FILE%
echo ======================================== >> %OUTPUT_FILE%
echo. >> %OUTPUT_FILE%

:: Esto lista las carpetas y archivos, pero ignora la pesada carpeta node_modules
tree /f /a | findstr /v /i "node_modules .git .next .gradle" >> %OUTPUT_FILE%

echo. >> %OUTPUT_FILE%
echo Finalizado el: %date% %time% >> %OUTPUT_FILE%

echo ¡Listo! Se ha creado un archivo llamado "estructura_proyecto.txt".
pause