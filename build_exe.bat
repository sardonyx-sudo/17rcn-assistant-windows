@echo off
setlocal
cd /d "%~dp0"

title Rotary Charity Network - Build Standalone EXE

python --version >nul 2>&1
if errorlevel 1 goto NO_PYTHON

echo ========================================================
echo   Rotary Charity Network AI Assistant
echo   Packaging Windows Standalone Executable
echo ========================================================

python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 goto INSTALL_PYINSTALLER

goto BUILD

:NO_PYTHON
echo [ERROR] Python was not found in your system PATH!
echo Please install Python 3.10+ and rerun this script.
pause
exit /b 1

:INSTALL_PYINSTALLER
echo [INFO] Installing PyInstaller package...
python -m pip install pyinstaller
if errorlevel 1 goto BUILD_FAIL

:BUILD
echo [INFO] Building standalone executable with PyInstaller...
echo [INFO] This might take 1-2 minutes, please wait...

python -m PyInstaller --noconfirm --onedir --windowed --add-data "ui;ui" --name "RotaryAssistant" "%~dp0main.py"
if errorlevel 1 goto BUILD_FAIL

echo ========================================================
echo [SUCCESS] Build completed successfully!
echo Executable location:
echo   %~dp0dist\RotaryAssistant\RotaryAssistant.exe
echo ========================================================
echo.
pause
exit /b 0

:BUILD_FAIL
echo.
echo [ERROR] Build failed! Please review the error messages above.
pause
exit /b 1
