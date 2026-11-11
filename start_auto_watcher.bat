@echo off
chcp 65001 >nul
title NTi IT-Tender Auto-Watcher - บอทเฝ้าระวังงานประมูลไอที
echo ========================================================================
echo   NTi IT-Tender Bot - Continuous Auto-Monitoring System
echo   บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด (New Technology Information Co.,Ltd.)
echo ========================================================================
echo.
echo กำลังเริ่มต้นระบบบอทเฝ้าระวังงานประมูลไอที e-GP กรมบัญชีกลาง (งบปี 2570 และ 2569)...
echo ระบบจะทำงานตรวจสอบงานใหม่อัตโนมัติทุกๆ 5 นาที
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_tender_watcher.ps1" -IntervalMinutes 5
pause
