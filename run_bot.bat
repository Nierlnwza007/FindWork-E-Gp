@echo off
chcp 65001 >nul
title NTi IT-Tender Bot
echo ========================================================================
echo   NTi IT-Tender Bot - บอทค้นหางานประมูลภาครัฐและเอกชนด้านไอที
echo   บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด (New Technology Information)
echo ========================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nti_tender_bot.ps1"
echo.
echo กดปุ่มใดๆ เพื่อปิดหน้าต่างนี้...
pause >nul
