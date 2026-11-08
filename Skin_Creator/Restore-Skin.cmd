@echo off
powershell.exe -NoLogo -NoProfile -File "%~dp0runtime\scripts\Restore-CodexAppearance.ps1"
if errorlevel 1 pause
