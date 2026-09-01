@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node.js 22 veya uzeri gerekli: https://nodejs.org/ & exit /b 1)
start "SEOAutoPilot" http://127.0.0.1:4173/
node server.js
