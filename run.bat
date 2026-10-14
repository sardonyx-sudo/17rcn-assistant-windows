@echo off
setlocal
cd /d "%~dp0"

title Rotary Charity Network AI Assistant - Windows Desktop

python --version >nul 2>&1
if errorlevel 1 goto NO_PYTHON

python -c "import webview, requests" >nul 2>&1
if errorlevel 1 goto INSTALL_DEPS

goto LAUNCH

:NO_PYTHON
echo ========================================================
echo [ERROR] Python was not found in your system PATH!
echo Please install Python 3.10+ and check "Add Python to PATH".
echo ========================================================
pause
exit /b 1

:INSTALL_DEPS
echo ========================================================
echo [INFO] Installing required dependencies (pywebview)...
echo ========================================================
python -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

:LAUNCH
echo ========================================================
echo   Rotary Charity Network AI Assistant
echo   Launching Dual Window Desktop App...
echo   Tip: Close the Assistant window or press Ctrl+C to exit.
echo ========================================================
python "%~dp0main.py"

if errorlevel 1 (
    echo.
    echo [ERROR] Program terminated with exit code %errorlevel%.
    pause
)
