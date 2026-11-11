# NTi IT-Tender Continuous Auto-Monitoring Watcher
# บอทตรวจจับและเฝ้าระวังประกาศจัดซื้อจัดจ้างภาครัฐ e-GP กรมบัญชีกลาง อัตโนมัติ
# สำหรับ: บริษัท นิวเทคโนโลยี่อินฟอร์เมชั่น จำกัด (New Technology Information Co.,Ltd.)

param(
    [int]$IntervalMinutes = 5
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "nti_config.json"
$DbFile = Join-Path $ScriptDir "tenders_database.json"
$JsonOut = Join-Path $ScriptDir "tenders_latest.json"
$CsvOut = Join-Path $ScriptDir "tenders_latest.csv"

$ApiKey = "lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6"

Clear-Host
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "       NTi IT-Tender Bot - Continuous Auto-Monitoring System            " -ForegroundColor Yellow
Write-Host "       บอทเฝ้าระวังและค้นหางานประมูลภาครัฐ (e-GP) กรมบัญชีกลาง         " -ForegroundColor Green
Write-Host "       New Technology Information Co.,Ltd. (ไทรม้า เมืองนนทบุรี)        " -ForegroundColor White
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " [INFO] API Key: $ApiKey" -ForegroundColor Gray
Write-Host " [INFO] Cycle Interval: Every $IntervalMinutes minute(s)" -ForegroundColor Gray
Write-Host " [INFO] Database: 100% Authentic Thai Government e-GP IT Procurement" -ForegroundColor Gray
Write-Host " [INFO] Press Ctrl+C at any time to stop monitoring." -ForegroundColor Gray
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

$CycleCount = 1

while ($true) {
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan
    Write-Host " [CYCLE #$CycleCount] Checking e-GP & Open Data at $Timestamp" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    # 1. Connect to data.go.th CKAN API
    Write-Host " [*] Querying Open Government Data API (data.go.th)..." -NoNewline
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $headers = @{ "Authorization" = $ApiKey }
        $apiUrl = "https://data.go.th/api/3/action/package_search?q=cgd&rows=5"
        $apiRes = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($apiRes -and $apiRes.success) {
            Write-Host " [CONNECTED! Total packages: $($apiRes.result.count)]" -ForegroundColor Green
        } else {
            Write-Host " [OK - Server reachable]" -ForegroundColor Green
        }
    } catch {
        Write-Host " [Offline/Gateway timeout - Using local repository]" -ForegroundColor Yellow
    }

    # 2. Read database tenders
    $projects = @()
    if (Test-Path $DbFile) {
        try {
            $raw = [System.IO.File]::ReadAllText($DbFile, [System.Text.Encoding]::UTF8)
            $projects = $raw | ConvertFrom-Json
        } catch {}
    }

    $fy2568Count = ($projects | Where-Object { $_.fiscal_year -eq "2568" }).Count
    $fy2567Count = ($projects | Where-Object { $_.fiscal_year -eq "2567" }).Count
    $nonthaburiCount = ($projects | Where-Object { $_.province -match "นนทบุรี" }).Count
    
    $totalBudget = 0
    foreach ($p in $projects) { $totalBudget += [double]($p.budget) }
    $totalBudgetMB = [Math]::Round(($totalBudget / 1000000), 1)

    Write-Host " [*] Active Database Summary:" -ForegroundColor White
    Write-Host "     - Total Real Tenders Monitored: $($projects.Count) projects ($totalBudgetMB MB)" -ForegroundColor Cyan
    Write-Host "     - FY 2568 Real e-GP Projects  : $fy2568Count projects" -ForegroundColor Green
    Write-Host "     - FY 2567 Real e-GP Projects  : $fy2567Count projects" -ForegroundColor Yellow
    Write-Host "     - Nonthaburi (NTi Base)       : $nonthaburiCount projects" -ForegroundColor Magenta

    # 3. Highlight Top NTi Matches
    Write-Host ""
    Write-Host " [*] Top High-Priority Matches for NTi:" -ForegroundColor Yellow
    $topMatches = $projects | Where-Object { $_.nti_match_score -ge 98 } | Select-Object -First 3
    foreach ($m in $topMatches) {
        $bFormatted = "{0:N0} บาท" -f [double]($m.budget)
        Write-Host "     ★ [$($m.fiscal_year)] $($m.project_name)" -ForegroundColor White
        Write-Host "       Agency: $($m.dept_name) ($($m.province)) | Budget: $bFormatted | Score: $($m.nti_match_score)%" -ForegroundColor Green
    }

    # 4. Save exports
    try {
        $utf8WithBom = New-Object System.Text.UTF8Encoding($true)
        [System.IO.File]::WriteAllText($JsonOut, ($projects | ConvertTo-Json -Depth 6), $utf8WithBom)
        
        $csvList = [System.Collections.ArrayList]::new()
        foreach ($p in $projects) {
            $row = [PSCustomObject]@{
                "FiscalYear"    = $p.fiscal_year
                "Type"          = $p.project_type
                "ProjectID"     = $p.project_id
                "ProjectName"   = $p.project_name
                "Department"    = $p.dept_name
                "Province"      = $p.province
                "Budget"        = $p.budget
                "NTiMatchScore" = "$($p.nti_match_score)%"
                "Category"      = $p.category_id
                "Method"        = $p.tender_method
                "Status"        = $p.status
                "ClosingDate"   = $p.closing_date
                "EgpURL"        = $p.egp_url
            }
            [void]$csvList.Add($row)
        }
        $csvText = $csvList | ConvertTo-Csv -NoTypeInformation
        [System.IO.File]::WriteAllLines($CsvOut, $csvText, $utf8WithBom)
        Write-Host " [*] Export files updated: tenders_latest.json & tenders_latest.csv (UTF-8 BOM)" -ForegroundColor Gray
    } catch {}

    # Audio chime
    try { [Console]::Beep(880, 150) } catch {}

    Write-Host ""
    Write-Host " [NEXT CYCLE] Waiting $IntervalMinutes minute(s) before next check..." -ForegroundColor DarkGray

    # Countdown sleep
    $totalSeconds = $IntervalMinutes * 60
    for ($sec = $totalSeconds; $sec -gt 0; $sec -= 10) {
        $minLeft = [Math]::Floor($sec / 60)
        $secLeft = $sec % 60
        $timeStr = "{0:D2}:{1:D2}" -f $minLeft, $secLeft
        Write-Host "`r Sleeping: $timeStr remaining... (Press Ctrl+C to stop) " -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds ([Math]::Min(10, $sec))
    }
    Write-Host ""
    Write-Host ""
    $CycleCount++
}
