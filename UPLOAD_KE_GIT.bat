@echo off
title Upload PNS VRA ke GitHub
color 0b
echo ======================================================================
echo   PNS ENTERPRISE - UPLOAD FINAL DASHBOARD KE GITHUB
echo   Target: https://github.com/appsmaheer-cloud/VRA
echo ======================================================================
echo.

cd /d "%~dp0"
set GIT_BIN="C:\laragon\bin\git\bin\git.exe"

if not exist %GIT_BIN% (
  set GIT_BIN=git
)

echo [1/3] Menyiapkan berkas git...
if not exist ".git" (
  echo Inisialisasi repository git lokal...
  %GIT_BIN% init -b main
  %GIT_BIN% remote add origin https://github.com/appsmaheer-cloud/VRA.git 2>nul
  %GIT_BIN% config user.name "PNS Admin"
  %GIT_BIN% config user.email "admin@pratamanusantara.co.id"
)

echo [2/3] Menambahkan berkas dan membuat commit...
%GIT_BIN% add .
%GIT_BIN% commit -m "Update PNS VRA Dashboard: Dark Gray theme, unit search, and architecture stabilization"

echo [3/3] Mengirim perubahan ke branch main GitHub...
%GIT_BIN% push -u origin main --force

echo.
echo ======================================================================
echo   Proses Selesai! Tekan sembarang tombol untuk menutup jendela ini.
echo ======================================================================
pause
