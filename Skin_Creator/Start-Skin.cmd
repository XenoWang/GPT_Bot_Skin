@echo off
powershell.exe -NoLogo -NoProfile -File "%~dp0runtime\scripts\Start-CodexTheme.ps1" -WaitForExit
if errorlevel 1 pause
