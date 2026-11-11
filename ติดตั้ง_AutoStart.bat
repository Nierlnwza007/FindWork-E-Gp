@echo off
chcp 65001 >nul
echo ==========================================================
echo   ติดตั้งระบบ NTi e-GP Downloader ให้ทำงานอัตโนมัติทุกครั้งที่เปิดเครื่อง
echo ==========================================================
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "EXE_PATH=%~dp0NTi_Tender_Server.exe"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $sc = $ws.CreateShortcut('%STARTUP_DIR%\NTi_Tender_Server.lnk'); ^
   $sc.TargetPath = '%EXE_PATH%'; ^
   $sc.Arguments = '--no-browser'; ^
   $sc.WorkingDirectory = '%~dp0'; ^
   $sc.Description = 'NTi Standalone e-GP File Downloader Server'; ^
   $sc.Save()"

echo.
echo [สำเร็จ] ติดตั้ง Auto-Start เรียบร้อยแล้ว!
echo เซอร์วิส NTi_Tender_Server.exe จะทำงานเบื้องหลังอัตโนมัติทุกครั้งที่เปิดเครื่อง
echo โดยไม่ต้องเปิด Antigravity อีกต่อไป
echo.
pause
