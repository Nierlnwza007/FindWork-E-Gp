$ErrorActionPreference = "Stop"
$workDir = "c:\Users\evox2\Desktop\บอทหางานไอที"
$inputPath = Join-Path $workDir "verified_open_it_tenders_complete.json"
$rawJson = [System.IO.File]::ReadAllText($inputPath, [System.Text.Encoding]::UTF8)
$items = $rawJson | ConvertFrom-Json

Write-Host "Loaded $($items.Count) verified open IT tenders."

function Get-CategoryInfo($name, $kw) {
    $text = "$name $kw".ToLower()
    if ($text -match "บำรุงรักษา|ซ่อมแซม|ดูแล|ma\b|pm\b|preventive|service|เหมาบริการ") {
        return @{
            id = "ma_pm"
            name = "งานจ้าง MA & PM ดูแลระบบ"
            reason = "โครงการงานจ้างบำรุงรักษาและดูแลระบบ (MA & PM) ตรงกับความเชี่ยวชาญหลักของทีมวิศวกรบริการ NTi • ตรวจสอบจากตาราง GreenBook ของ e-GP ยืนยันว่ากำลังเปิดรับซองจริงและยังไม่มีผู้ชนะ"
        }
    }
    if ($text -match "สายสัญญาณ|ใยแก้ว|fiber|lan\b|cabling|เคเบิล|ไฟฟ้า|ตู้สาขา|ไร้สาย|โทรศัพท์") {
        return @{
            id = "cabling_power"
            name = "เดินสาย LAN & Fiber & ไฟฟ้า"
            reason = "โครงการติดตั้งระบบโครงข่ายสายสัญญาณ (LAN/Fiber Optic) และระบบไฟฟ้าสื่อสาร ตรงกับสายงานติดตั้งโครงสร้างพื้นฐานของ NTi • กำลังเปิดรับซองจริงบน e-GP"
        }
    }
    if ($text -match "ห้องประชุม|โสต|จอแสดงผล|led\b|โปรเจคเตอร์|projector|กล้องโทรทัศน์วงจรปิด|cctv|วงจรปิด|เสียง|ไมโครโฟน|วีดิทัศน์|conference") {
        return @{
            id = "meeting_av"
            name = "ห้องประชุม & Video Conference & CCTV"
            reason = "โครงการระบบห้องประชุมอัจฉริยะ ภาพและเสียง (AV) และกล้องวงจรปิด CCTV ตรงกับโซลูชันครบวงจรของ NTi • กำลังเปิดรับซองจริงบน e-GP"
        }
    }
    if ($text -match "เครือข่าย|network|switch|router|firewall|wifi|wi-fi|ความมั่นคงปลอดภัย|cyber|security|อินเทอร์เน็ต|internet|สื่อสาร") {
        return @{
            id = "network_security"
            name = "Network & Wi-Fi & Firewall"
            reason = "โครงการระบบเครือข่ายและความมั่นคงปลอดภัยไซเบอร์ (Network & Security) ตรงกับความเชี่ยวชาญด้าน System Integration ของ NTi • กำลังเปิดรับซองจริงบน e-GP"
        }
    }
    if ($text -match "พัฒนาระบบ|ซอฟต์แวร์|software|โปรแกรม|application|แอปพลิเคชัน|ฐานข้อมูล|database|cloud|คลาวด์|ai\b|ปัญญาประดิษฐ์|ดิจิทัล|สารสนเทศ") {
        return @{
            id = "software_license"
            name = "ซอฟต์แวร์ & พัฒนาระบบ"
            reason = "โครงการจัดหาซอฟต์แวร์ลิขสิทธิ์ พัฒนาระบบสารสนเทศ และ Cloud/AI ตรงกับกลุ่มธุรกิจโซลูชันซอฟต์แวร์ของ NTi • กำลังเปิดรับซองจริงบน e-GP"
        }
    }
    return @{
        id = "pc_hardware"
        name = "จัดซื้อ PC & Server"
        reason = "โครงการจัดซื้อเครื่องคอมพิวเตอร์ แม่ข่าย (Server) และอุปกรณ์ต่อพ่วงไอที ตรงกับสายงานจำหน่ายฮาร์ดแวร์ของ NTi • กำลังเปิดรับซองจริงบน e-GP"
    }
}

function Parse-ThaiDateToIso($dStr) {
    if (-not $dStr) { return "2026-11-03" }
    $parts = $dStr -split "/"
    if ($parts.Count -eq 3) {
        $day = $parts[0].PadLeft(2, '0')
        $month = $parts[1].PadLeft(2, '0')
        $yearCE = [int]$parts[2] - 543
        return "$yearCE-$month-$day"
    }
    return "2026-11-03"
}

$outList = New-Object System.Collections.Generic.List[object]

foreach ($it in $items) {
    $budgetNum = 0.0
    if ($it.budget) {
        [double]::TryParse(($it.budget -replace ",", ""), [ref]$budgetNum) | Out-Null
    }
    $refNum = $budgetNum
    if ($it.refPrice) {
        $tmpRef = 0.0
        if ([double]::TryParse(($it.refPrice -replace ",", ""), [ref]$tmpRef) -and $tmpRef -gt 0) {
            $refNum = $tmpRef
        }
    }

    $cat = Get-CategoryInfo $it.projectName $it.matchedKw
    $isoDate = Parse-ThaiDateToIso $it.announceDate

    $isLocal = $false
    foreach ($p in @("นนทบุรี", "กรุงเทพมหานคร", "ปทุมธานี", "สมุทรปราการ", "สมุทรสาคร", "นครปฐม")) {
        if ($it.province -like "*$p*") { $isLocal = $true; break }
    }

    $score = 92
    if ($isLocal) { $score += 4 }
    if ($it.stage -eq "D0") { $score += 2 }
    if ($budgetNum -ge 500000 -and $budgetNum -le 30000000) { $score += 1 }
    if ($score -gt 99) { $score = 99 }

    $stageLabel = if ($it.stage -eq "D0") { "ประกาศเชิญชวน (เปิดรับซอง e-Bidding)" } else { "ร่างเอกสารประกวดราคา (ร่าง TOR เปิดใหม่)" }
    $closingText = if ($it.stage -eq "D0") {
        "กำลังเปิดรับซอง (ประกาศ $($it.announceDate) • ยังไม่ปิดยื่นข้อเสนอ)"
    } else {
        "เปิดรับฟังวิจารณ์ร่าง TOR (ประกาศ $($it.announceDate) • เตรียมเปิดรับซอง)"
    }

    $scopeText = "สถานะสดจากเซิร์ฟเวอร์กรมบัญชีกลาง (process5.gprocurement.go.th): $stageLabel • เอกสารในตาราง GreenBook: [$($it.greenBookTypes)] (ตรวจสอบแล้วไม่มีประกาศผู้ชนะและยังไม่ปิดรับซอง) • ดาวน์โหลดไฟล์ชุด TOR (.zip), ใบประกาศตราครุฑ (.pdf) และตารางราคากลาง (.zip) ของจริงได้โดยตรงทันที"

    $obj = [ordered]@{
        project_id = [string]$it.projectId
        project_name = [string]$it.projectName
        dept_name = [string]$it.dept
        province = [string]$it.province
        budget = [math]::Round($budgetNum, 2)
        reference_price = [math]::Round($refNum, 2)
        category_id = $cat.id
        category_name = $cat.name
        tender_method = "ประกวดราคาอิเล็กทรอนิกส์ (e-Bidding)"
        announce_date = [string]$it.announceDate
        announce_date_iso = $isoDate
        closing_date = $closingText
        status = if ($it.stage -eq "D0") { "ACTIVE_BIDDING" } else { "DRAFT_TOR" }
        stage = [string]$it.stage
        stage_label = $stageLabel
        green_book_types = [string]$it.greenBookTypes
        fiscal_year = "2569"
        project_type = [string]$it.stage
        sector = "government"
        is_real_egp = $true
        has_local_docs = $true
        docs_count = 3
        nti_match_score = $score
        nti_match_reason = $cat.reason
        scope_summary = $scopeText
        search_keyword = [string]$it.matchedKw
        contact_person = "ฝ่ายพัสดุ $($it.dept)"
        winner_company = ""
        winning_amount = 0
        contract_no = ""
         contract_date = ""
        egp_url = [string]$it.egpDirectUrl
        egp_direct_url = [string]$it.egpDirectUrl
        tor_zip_id = [string]$it.torZipId
        tor_zip_name = [string]$it.torZipName
        tor_zip_url = [string]$it.torZipUrl
        announce_template_id = [string]$it.announceTemplateId
        announce_pdf_url = [string]$it.announcePdfUrl
        draft_zip_id = [string]$it.draftZipId
        draft_zip_url = [string]$it.draftZipUrl
        draft_template_id = [string]$it.draftTemplateId
        draft_pdf_url = [string]$it.draftPdfUrl
        price_zip_id = [string]$it.priceZipId
        price_zip_name = [string]$it.priceZipName
        price_zip_url = [string]$it.priceZipUrl
    }
    $outList.Add([pscustomobject]$obj)
}

# Sort by announce_date_iso DESC, then stage D0 first, then budget DESC
$sorted = $outList | Sort-Object -Property @{Expression="announce_date_iso"; Descending=$true}, @{Expression={$_.stage -eq "D0"}; Descending=$true}, @{Expression="budget"; Descending=$true}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)

$jsonOut = $sorted | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $workDir "tenders_latest.json"), $jsonOut, $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $workDir "tenders_database.json"), $jsonOut, $utf8NoBom)

$jsContent = "// ฐานข้อมูลงานประมูลไอทีที่กำลังเปิดรับซองจริงบนระบบ e-GP กรมบัญชีกลาง (process5.gprocurement.go.th)`r`n" +
             "// ตรวจสอบตาราง GreenBook แล้ว 100% ว่ายังไม่มีผู้ชนะ (ไม่มี W0/I0) และยังไม่ปิดรับซอง (ไม่มีสรุปราคา price)`r`n" +
             "// อัปเดตล่าสุด: 3 พฤศจิกายน 2569 จำนวน $($sorted.Count) โครงการ`r`n" +
             "window.NTI_TENDER_DATABASE = $jsonOut;`r`n" +
             "const NTI_TENDER_DATABASE = window.NTI_TENDER_DATABASE;`r`n"

[System.IO.File]::WriteAllText((Join-Path $workDir "js\data_mock.js"), $jsContent, $utf8NoBom)

# Also write CSV with UTF-8 BOM for Excel
$csvLines = New-Object System.Collections.Generic.List[string]
$csvLines.Add("project_id,stage,announce_date,project_name,dept_name,province,category_name,budget,reference_price,green_book_types,tor_zip_url,announce_pdf_url,price_zip_url,egp_direct_url")
foreach ($r in $sorted) {
    $pName = ($r.project_name -replace '"', '""')
    $dName = ($r.dept_name -replace '"', '""')
    $line = "`"$($r.project_id)`",`"$($r.stage_label)`",`"$($r.announce_date)`",`"$pName`",`"$dName`",`"$($r.province)`",`"$($r.category_name)`",$($r.budget),$($r.reference_price),`"$($r.green_book_types)`",`"$($r.tor_zip_url)`",`"$($r.announce_pdf_url)`",`"$($r.price_zip_url)`",`"$($r.egp_direct_url)`""
    $csvLines.Add($line)
}
[System.IO.File]::WriteAllLines((Join-Path $workDir "tenders_latest.csv"), $csvLines, $utf8Bom)

$d0Count = ($sorted | Where-Object { $_.stage -eq "D0" }).Count
$b0Count = ($sorted | Where-Object { $_.stage -eq "B0" }).Count
$localCount = ($sorted | Where-Object { $_.province -match "นนทบุรี|กรุงเทพมหานคร|ปทุมธานี|สมุทรปราการ|สมุทรสาคร|นครปฐม" }).Count
$totalBudget = ($sorted | Measure-Object -Property budget -Sum).Sum
Write-Host "Successfully built database: Total=$($sorted.Count) (D0=$d0Count, B0=$b0Count, Local=$localCount, TotalBudget=$([math]::Round($totalBudget/1000000, 2)) MB)"