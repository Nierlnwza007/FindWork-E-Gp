@echo off
chcp 65001 >nul
echo กำลังปิดและถอนการติดตั้ง Auto-Start ของ NTi_Tender_Server...
taskkill /F /IM NTi_Tender_Server.exe >nul 2>&1
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NTi_Tender_Server.lnk" >nul 2>&1
echo [สำเร็จ] ปิดเซอร์วิสและยกเลิก Auto-Start เรียบร้อยแล้ว
pause
