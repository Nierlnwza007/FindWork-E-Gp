@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo กำลังเริ่มระบบ NTi Standalone e-GP Server ณ โฟลเดอร์ปัจจุบัน: %~dp0
REM ล้าง Mark of the Web (Unblock) กรณีแตกไฟล์มาจาก .rar / .zip ที่ดาวน์โหลดจากเน็ต
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem '%~dp0' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
if exist "%~dp0NTi_Tender_Server.exe" (
    start "" "%~dp0NTi_Tender_Server.exe"
) else (
    powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0local_file_server.ps1\"'"
    start "" "%~dp0index.html"
)
