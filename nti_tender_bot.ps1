# NTi IT-Tender Bot for Windows PowerShell
# Company: New Technology Information Co.,Ltd.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "    NTi IT-Tender Bot - Bidding & Procurement Search System" -ForegroundColor Yellow
Write-Host "    New Technology Information Co.,Ltd. (บจก. นิวเทคโนโลยี่อินฟอร์เมชั่น)" -ForegroundColor White
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "nti_config.json"
$DbFile = Join-Path $ScriptDir "tenders_database.json"
$CsvOut = Join-Path $ScriptDir "tenders_latest.csv"
$JsonOut = Join-Path $ScriptDir "tenders_latest.json"

$Config = $null
if (Test-Path $ConfigFile) {
    try {
        $ConfigRaw = [System.IO.File]::ReadAllText($ConfigFile, [System.Text.Encoding]::UTF8)
        $Config = $ConfigRaw | ConvertFrom-Json
        Write-Host "[OK] Configuration loaded: $($Config.company_profile.name_th)" -ForegroundColor Green
        $ApiKey = if ($Config.api_settings.api_key) { $Config.api_settings.api_key } else { "lPYPLgnzSqpkRiNyyt3mnGhDHQSoWQm6" }
        Write-Host "[OK] API Key configured: $ApiKey" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not parse config JSON" -ForegroundColor Yellow
    }
}

$Projects = @()

# Read projects from JSON database
if (Test-Path $DbFile) {
    try {
        $DbRaw = [System.IO.File]::ReadAllText($DbFile, [System.Text.Encoding]::UTF8)
        $Projects = $DbRaw | ConvertFrom-Json
        Write-Host "[OK] Loaded $($Projects.Count) tenders from database" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not parse tenders_database.json: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "------------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Matching Tenders for New Technology Information Co.,Ltd." -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------" -ForegroundColor Cyan

$CsvList = [System.Collections.ArrayList]::new()
$Index = 1

foreach ($p in $Projects) {
    $BudgetNum = [double]($p.budget)
    $BudgetFormatted = "{0:N0} บาท" -f $BudgetNum
    $EgpUrl = if ($p.egp_url) { $p.egp_url } else { "https://www.google.com/search?q=site%3Agprocurement.go.th+" + $p.project_id }

    Write-Host ("[$Index] [" + $p.fiscal_year + "] " + $p.project_name) -ForegroundColor Yellow
    Write-Host ("    Agency  : " + $p.dept_name + " (" + $p.province + ")") -ForegroundColor White
    Write-Host ("    Budget  : " + $BudgetFormatted + " | NTi Match: " + $p.nti_match_score + "%") -ForegroundColor Cyan
    Write-Host ("    Category: " + $p.category_id + " | Method: " + $p.tender_method) -ForegroundColor Gray
    Write-Host ("    e-GP URL: " + $EgpUrl) -ForegroundColor DarkCyan
    Write-Host ""

    $Row = [PSCustomObject]@{
        "FiscalYear"    = $p.fiscal_year
        "Type"          = $p.project_type
        "ProjectID"     = $p.project_id
        "ProjectName"   = $p.project_name
        "Department"    = $p.dept_name
        "Province"      = $p.province
        "Budget"        = $BudgetNum
        "NTiMatchScore" = "$($p.nti_match_score)%"
        "Category"      = $p.category_id
        "Method"        = $p.tender_method
        "ClosingDate"   = $p.closing_date
        "EgpURL"        = $EgpUrl
    }
    [void]$CsvList.Add($Row)
    $Index++
}

# Export to UTF-8 CSV with BOM for direct Excel compatibility
try {
    $CsvContent = $CsvList | ConvertTo-Csv -NoTypeInformation
    $Utf8WithBom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllLines($CsvOut, $CsvContent, $Utf8WithBom)
    Write-Host "[OK] Exported Excel/CSV to: $CsvOut" -ForegroundColor Green
} catch {
    Write-Host "[ERR] Failed to write CSV: $($_.Exception.Message)" -ForegroundColor Red
}

# Export to JSON
try {
    $JsonString = $Projects | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($JsonOut, $JsonString, [System.Text.Encoding]::UTF8)
    Write-Host "[OK] Saved JSON dataset to: $JsonOut" -ForegroundColor Green
} catch {
    Write-Host "[ERR] Failed to write JSON: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Search completed! Total: $($Projects.Count) projects." -ForegroundColor Green
Write-Host "  Open 'index.html' in your browser to view the Interactive Dashboard." -ForegroundColor Yellow
Write-Host "========================================================================" -ForegroundColor Cyan
