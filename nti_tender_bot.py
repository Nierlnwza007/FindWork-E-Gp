#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NTi IT-Tender Bot - บอทค้นหางานประมูลภาครัฐและเอกชนด้านไอที
สำหรับ บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด (New Technology Information Co.,Ltd.)
ใช้งานได้ทันทีด้วย Python Standard Library (ไม่ต้องติดตั้งแพ็กเกจเสริม)
"""

import os
import sys
import json
import csv
import urllib.request
import urllib.parse
from datetime import datetime

# กำหนดเส้นทางโฟลเดอร์หลัก
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "nti_config.json")
DB_FILE = os.path.join(BASE_DIR, "tenders_database.json")
CSV_OUTPUT = os.path.join(BASE_DIR, "tenders_latest.csv")
JSON_OUTPUT = os.path.join(BASE_DIR, "tenders_latest.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] ไม่สามารถอ่าน nti_config.json: {e}")
    return {}

def load_database():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] ไม่สามารถอ่าน tenders_database.json: {e}")
    return []

def calculate_match_score(title, budget, province, dept_name):
    score = 50
    reasons = []
    lower_title = title.lower()

    if any(k in lower_title for k in ["คอมพิวเตอร์", "pc", "desktop", "โน้ตบุ๊ก", "notebook", "server", "workstation"]):
        score += 25
        reasons.append("ตรงกับงานจำหน่าย PC/Hardware")
    if any(k in lower_title for k in ["บำรุงรักษา", "ma", "pm", "preventive", "ซ่อมบำรุง", "ซ่อมแซม"]):
        score += 25
        reasons.append("ตรงกับงานสัญญาบริการ MA & PM รายปี")
    if any(k in lower_title for k in ["สาย lan", "สายแลน", "utp", "cat6", "fiber", "ใยแก้ว", "ตู้ rack", "ups", "ระบบไฟ"]):
        score += 25
        reasons.append("ตรงกับงานเดินสาย LAN/Fiber และระบบไฟฟ้า Server")
    if any(k in lower_title for k in ["เครือข่าย", "network", "switch", "wi-fi", "firewall", "access point"]):
        score += 20
        reasons.append("ตรงกับงานวางระบบ Network & Security")
    if any(k in lower_title for k in ["ห้องประชุม", "video conference", "ประชุมทางไกล", "smart board", "interactive", "ภาพและเสียง"]):
        score += 25
        reasons.append("ตรงกับงานระบบห้องประชุม Smart Meeting Room")

    # โบนัสทำเล
    if "นนทบุรี" in province or "นนทบุรี" in dept_name:
        score += 15
        reasons.append("ทำเลนนทบุรี ใกล้ บจก. นิวเทคโนโลยี่อินฟอร์เมชั่น")
    elif any(p in province for p in ["กรุงเทพ", "ปทุมธานี", "สมุทรปราการ"]):
        score += 8
        reasons.append("ทำเลปริมณฑล สะดวก Onsite")

    # โบนัสงบประมาณ Sweet Spot (500,000 - 15,000,000 บาท)
    if 500000 <= budget <= 15000000:
        score += 10
        reasons.append("งบประมาณอยู่ในช่วง Sweet Spot")

    return min(100, max(40, score)), " • ".join(reasons)

def fetch_live_cgd(api_key, year=2568, keyword="คอมพิวเตอร์"):
    base_url = "https://opend.data.go.th/govspending/cgdcontract"
    query = urllib.parse.urlencode({
        "api-key": api_key,
        "year": year,
        "keyword": keyword,
        "limit": 30
    })
    req_url = f"{base_url}?{query}"
    req = urllib.request.Request(req_url, headers={"User-Agent": "NTi-TenderBot/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("result", [])
    except Exception as e:
        print(f"[!] เรียก CGD API ไม่สำเร็จ: {e}")
    return []

def main():
    print("=" * 72)
    print("    NTi IT-Tender Bot - บอทค้นหางานประมูลภาครัฐและเอกชนด้านไอที")
    print("    บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด (New Technology Information)")
    print("=" * 72)

    config = load_config()
    company_name = config.get("company_profile", {}).get("name_th", "บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด")
    api_key = config.get("api_settings", {}).get("api_key", "lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6")
    print(f"\n[✓] โหลดการตั้งค่าบริษัท: {company_name}")
    print(f"[✓] ติดตั้ง API Key: {api_key}")

    # โหลดฐานข้อมูลโครงการ
    tenders = load_database()
    print(f"[✓] เชื่อมโยงฐานข้อมูลโครงการประมูลไอที {len(tenders)} โครงการ")

    # กรองและจัดเรียงตาม NTi Match Score
    tenders.sort(key=lambda x: x.get("nti_match_score", 0), reverse=True)

    print("\n" + "-" * 72)
    print("  รายชื่อโครงการจัดซื้อจัดจ้างที่ตรงกับความเชี่ยวชาญของ NTi:")
    print("-" * 72)

    for i, t in enumerate(tenders, 1):
        budget_str = f"{t.get('budget', 0):,}"
        print(f"[{i:02d}] {t.get('project_name')}")
        print(f"     หน่วยงาน: {t.get('dept_name')} | จังหวัด: {t.get('province')}")
        print(f"     งบประมาณ: {budget_str} บาท | NTi Match: {t.get('nti_match_score')}%")
        print(f"     ลิงก์ e-GP: {t.get('egp_url')}")
        print()

    # บันทึกไฟล์ CSV (UTF-8 with BOM สำหรับ Excel)
    try:
        with open(CSV_OUTPUT, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["รหัสโครงการ e-GP", "ชื่อโครงการ", "หน่วยงาน", "จังหวัด", "งบประมาณ (บาท)", "NTi Match", "หมวดหมู่งาน", "วิธีจัดหา", "วันปิดรับซอง", "ลิงก์ e-GP"])
            for t in tenders:
                writer.writerow([
                    t.get("project_id"),
                    t.get("project_name"),
                    t.get("dept_name"),
                    t.get("province"),
                    t.get("budget"),
                    f"{t.get('nti_match_score')}%",
                    t.get("category_id"),
                    t.get("tender_method"),
                    t.get("closing_date"),
                    t.get("egp_url")
                ])
        print(f"[✓] ส่งออกไฟล์สรุป Excel/CSV สำเร็จ: {CSV_OUTPUT}")
    except Exception as e:
        print(f"[!] ไม่สามารถเขียน CSV: {e}")

    # บันทึกไฟล์ JSON
    try:
        with open(JSON_OUTPUT, "w", encoding="utf-8") as f:
            json.dump(tenders, f, ensure_ascii=False, indent=2)
        print(f"[✓] บันทึกไฟล์ JSON สำเร็จ: {JSON_OUTPUT}")
    except Exception as e:
        print(f"[!] ไม่สามารถเขียน JSON: {e}")

    print("\n" + "=" * 72)
    print("  ค้นหาเสร็จสิ้น! คุณสามารถดับเบิลคลิกไฟล์ 'start_dashboard.bat'")
    print("  หรือเปิด 'index.html' บนเบราว์เซอร์เพื่อใช้งานระบบ Interactive ค้นหาแบบเรียลไทม์")
    print("=" * 72)

if __name__ == "__main__":
    main()
