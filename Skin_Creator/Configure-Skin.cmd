@echo off
powershell.exe -NoLogo -NoProfile -File "%~dp0runtime\scripts\Configure-CodexSkin.ps1" -DesktopShortcut
if errorlevel 1 pause
