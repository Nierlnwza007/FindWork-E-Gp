[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::DefaultConnectionLimit = 100
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

$workDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$baseDownloadDir = Join-Path $workDir "เอกสารโครงการ_eGP"
if (-not (Test-Path $baseDownloadDir)) {
    New-Item -ItemType Directory -Path $baseDownloadDir -Force | Out-Null
}

function Get-SafeFolderName([string]$projName, [string]$projId) {
    $clean = $projName -replace '[\\/:*?"<>|\r\n\t]+', ' '
    $clean = ($clean -replace '\s+', ' ').Trim()
    if ($clean.Length -gt 80) {
        $clean = $clean.Substring(0, 80).Trim()
    }
    if (-not $clean) {
        $clean = "โครงการ_eGP"
    }
    return "${clean}_${projId}"
}

function Extract-ZipSafely([string]$zipPath, [string]$destDir, [string]$prefix) {
    $extracted = @()
    try {
        $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
        foreach ($entry in $archive.Entries) {
            if (-not $entry.Name) { continue }
            $safeEntryName = $entry.Name -replace '[\\/:*?"<>|]+', '_'
            $outName = "${prefix}${safeEntryName}"
            $outPath = Join-Path $destDir $outName
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outPath, $true)
            $extracted += [PSCustomObject]@{
                name = $outName
                size = $entry.Length
                path = $outPath
            }
        }
        $archive.Dispose()
    } catch {
        Write-Warning "Extract error for ${zipPath}: $($_.Exception.Message)"
    }
    return $extracted
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8765/")
$listener.Prefixes.Add("http://localhost:8765/")
$listener.Start()
Write-Host "=========================================================="
Write-Host " NTi e-GP Real Document Downloader Server running on :8765"
Write-Host " Base Folder: $baseDownloadDir"
Write-Host "=========================================================="

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 200
            $res.Close()
            continue
        }

        $path = $req.Url.AbsolutePath

        if ($path -eq "/api/status") {
            $json = @{
                ok = $true
                service = "NTi e-GP Real Document Downloader"
                baseDir = $baseDownloadDir
            } | ConvertTo-Json -Depth 4
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/api/open-folder" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $bodyStr = $reader.ReadToEnd()
            $reader.Close()
            $payload = $bodyStr | ConvertFrom-Json
            if ($payload.client_work_dir -and (Test-Path $payload.client_work_dir)) {
                $workDir = $payload.client_work_dir
                $baseDownloadDir = Join-Path $workDir "เอกสารโครงการ_eGP"
                if (-not (Test-Path $baseDownloadDir)) {
                    New-Item -ItemType Directory -Path $baseDownloadDir -Force | Out-Null
                }
            }
            $targetFolder = if ($payload.folderPath -and (Test-Path $payload.folderPath)) { $payload.folderPath } else { $baseDownloadDir }
            Start-Process explorer.exe -ArgumentList "`"$targetFolder`""
            $json = @{ ok = $true; opened = $targetFolder } | ConvertTo-Json
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        if ($path -eq "/api/download-project" -and $req.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $bodyStr = $reader.ReadToEnd()
            $reader.Close()
            $p = $bodyStr | ConvertFrom-Json

            if ($p.client_work_dir -and (Test-Path $p.client_work_dir)) {
                $workDir = $p.client_work_dir
                $baseDownloadDir = Join-Path $workDir "เอกสารโครงการ_eGP"
                if (-not (Test-Path $baseDownloadDir)) {
                    New-Item -ItemType Directory -Path $baseDownloadDir -Force | Out-Null
                }
            }

            $projId = [string]$p.project_id
            $projName = [string]$p.project_name
            $folderName = Get-SafeFolderName $projName $projId
            $projDir = Join-Path $baseDownloadDir $folderName
            if (-not (Test-Path $projDir)) {
                New-Item -ItemType Directory -Path $projDir -Force | Out-Null
            }

            Write-Host "[Download] Project $projId -> $projDir"
            $downloadedFiles = New-Object System.Collections.Generic.List[object]

            # 1. ประกาศราคากลาง (Reference Price / BOQ ZIP)
            if ($p.price_zip_url) {
                try {
                    $priceZipFile = Join-Path $projDir "01_ประกาศราคากลาง_${projId}.zip"
                    Invoke-WebRequest -Uri $p.price_zip_url -OutFile $priceZipFile -UseBasicParsing -TimeoutSec 25
                    if (Test-Path $priceZipFile) {
                        $fInfo = Get-Item $priceZipFile
                        $downloadedFiles.Add([PSCustomObject]@{
                            name = $fInfo.Name
                            size = $fInfo.Length
                            type = "ZIP"
                            category = "ประกาศราคากลาง (ไฟล์ต้นฉบับ ZIP)"
                            path = $fInfo.FullName
                        })
                        $ext1 = Extract-ZipSafely $priceZipFile $projDir "01_ประกาศราคากลาง_"
                        foreach ($ef in $ext1) {
                            $downloadedFiles.Add([PSCustomObject]@{
                                name = $ef.name
                                size = $ef.size
                                type = ([System.IO.Path]::GetExtension($ef.name).TrimStart('.').ToUpper())
                                category = "ประกาศราคากลาง (แตกไฟล์แล้ว เปิดอ่านได้ทันที)"
                                path = $ef.path
                            })
                        }
                    }
                } catch {
                    Write-Warning "Failed to download price_zip_url: $($_.Exception.Message)"
                }
            }

            # 2. ร่างเอกสารประกวดราคา(e-Bidding) / เอกสารประกวดราคาและขอบเขตงาน TOR (ZIP)
            $hasExtractedAnnounDoc = $false
            if ($p.tor_zip_url) {
                try {
                    $torZipFile = Join-Path $projDir "02_ร่างเอกสารประกวดราคา_และ_TOR_${projId}.zip"
                    Invoke-WebRequest -Uri $p.tor_zip_url -OutFile $torZipFile -UseBasicParsing -TimeoutSec 35
                    if (Test-Path $torZipFile) {
                        $fInfo = Get-Item $torZipFile
                        $downloadedFiles.Add([PSCustomObject]@{
                            name = $fInfo.Name
                            size = $fInfo.Length
                            type = "ZIP"
                            category = "ร่างเอกสารประกวดราคา & TOR (ไฟล์ต้นฉบับ ZIP)"
                            path = $fInfo.FullName
                        })
                        $ext2 = Extract-ZipSafely $torZipFile $projDir "02_เอกสารประกวดราคา_TOR_"
                        foreach ($ef in $ext2) {
                            if ($ef.name -match 'annoudoc') { $hasExtractedAnnounDoc = $true }
                            $downloadedFiles.Add([PSCustomObject]@{
                                name = $ef.name
                                size = $ef.size
                                type = ([System.IO.Path]::GetExtension($ef.name).TrimStart('.').ToUpper())
                                category = "ร่างเอกสารประกวดราคา & TOR (แตกไฟล์แล้ว เปิดอ่านได้ทันที)"
                                path = $ef.path
                            })
                        }
                    }
                } catch {
                    Write-Warning "Failed to download tor_zip_url: $($_.Exception.Message)"
                }
            }

            # 3. ใบประกาศเชิญชวน / ร่างประกาศประกวดราคา ตราครุฑ (PDF) — โหลดแยกเฉพาะกรณีที่ใน ZIP ไม่มีไฟล์ annoudoc ติดมาด้วย
            if ($p.announce_pdf_url -and (-not $hasExtractedAnnounDoc)) {
                try {
                    $annPdfFile = Join-Path $projDir "03_ประกาศประกวดราคา_ตราครุฑ_${projId}.pdf"
                    Invoke-WebRequest -Uri $p.announce_pdf_url -OutFile $annPdfFile -UseBasicParsing -TimeoutSec 25
                    if (Test-Path $annPdfFile) {
                        $fInfo = Get-Item $annPdfFile
                        $downloadedFiles.Add([PSCustomObject]@{
                            name = $fInfo.Name
                            size = $fInfo.Length
                            type = "PDF"
                            category = "ใบประกาศประกวดราคา ตราครุฑ (PDF ทางการ)"
                            path = $fInfo.FullName
                        })
                    }
                } catch {
                    Write-Warning "Failed to download announce_pdf_url: $($_.Exception.Message)"
                }
            }

            # 4. หากร่างเอกสาร B0 แยกต่างหากจาก D0 ให้โหลดด้วย
            if ($p.draft_zip_url -and ($p.draft_zip_url -ne $p.tor_zip_url)) {
                try {
                    $draftZipFile = Join-Path $projDir "04_ร่างเอกสารประกวดราคา_B0_${projId}.zip"
                    Invoke-WebRequest -Uri $p.draft_zip_url -OutFile $draftZipFile -UseBasicParsing -TimeoutSec 30
                    if (Test-Path $draftZipFile) {
                        $fInfo = Get-Item $draftZipFile
                        $downloadedFiles.Add([PSCustomObject]@{
                            name = $fInfo.Name
                            size = $fInfo.Length
                            type = "ZIP"
                            category = "ร่างเอกสารประกวดราคา B0 (ZIP)"
                            path = $fInfo.FullName
                        })
                        $ext4 = Extract-ZipSafely $draftZipFile $projDir "04_ร่างTOR_B0_"
                        foreach ($ef in $ext4) {
                            $downloadedFiles.Add([PSCustomObject]@{
                                name = $ef.name
                                size = $ef.size
                                type = ([System.IO.Path]::GetExtension($ef.name).TrimStart('.').ToUpper())
                                category = "ร่างเอกสารประกวดราคา B0 (แตกไฟล์แล้ว)"
                                path = $ef.path
                            })
                        }
                    }
                } catch {}
            }

            if ($p.open_folder -ne $false) {
                Start-Process explorer.exe -ArgumentList "`"$projDir`""
            }

            $respObj = @{
                ok = $true
                projectId = $projId
                folderName = $folderName
                folderPath = $projDir
                relativeFolderPath = "เอกสารโครงการ_eGP\$folderName"
                filesCount = $downloadedFiles.Count
                files = $downloadedFiles
            }
            $json = $respObj | ConvertTo-Json -Depth 6
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = "application/json; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
        }

        $res.StatusCode = 404
        $res.Close()
    } catch {
        Write-Warning "Request error: $($_.Exception.Message)"
        try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch {}
    }
}