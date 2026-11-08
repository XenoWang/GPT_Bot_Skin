@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\Start-CodexTheme.ps1" -WaitForExit
if errorlevel 1 pause
