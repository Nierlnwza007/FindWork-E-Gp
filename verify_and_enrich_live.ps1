[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::DefaultConnectionLimit = 100
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Continue"

$excludeRegex = 'เอกซเรย์|เอ็กซเรย์|X-?ray|CT\s*Scan|CT-SCAN|MRI|คลื่นแม่เหล็กไฟฟ้า|รังสีวิทยา|สมรรถภาพปอด|ผ่าตัด|ทันตกรรม|เครื่องช่วยหายใจ|ล้างไต|อัลตราซาวด์|ครุภัณฑ์การแพทย์|เครื่องมือแพทย์|เวชภัณฑ์|ผู้ป่วย|กระตุกหัวใจ|ดมยาสลบ|ก่อสร้างถนน|ลาดยาง|คอนกรีตเสริมเหล็ก|ขุดลอก|สะพาน|ท่อระบายน้ำ|รถบรรทุก|รถยนต์|รถพยาบาล|ลิฟต์โดยสาร|เครื่องปรับอากาศ|แอร์|ทำความสะอาด|รักษาความปลอดภัย|รปภ\.|อาหารกลางวัน|นมโรงเรียน|ชุดฝึก'

$rawCandidates = [System.IO.File]::ReadAllText("$PWD\candidates_live_it_all.json", [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$candidates = @($rawCandidates | Where-Object { $_.projectName -notmatch $excludeRegex })
Write-Output "Filtered IT candidates (excluding medical/construction): $($candidates.Count) (from $($rawCandidates.Count))"

$h = @{"Content-Type"="application/json; charset=utf-8"; "noToken"="noToken"; "noDataProfile"="noDataProfile"}
$tokRes = Invoke-RestMethod -Uri "https://process5.gprocurement.go.th/egp-oann10-service/pb/a-egp-allt-project/announcement/generateToken" -Method Post -Headers $h -Body (@{ key = "EGP-ANNOUNCEMENT-KEY" } | ConvertTo-Json) -TimeoutSec 10
$sharedToken = $tokRes.data
Write-Output "Got shared token: $($sharedToken.Substring(0, 30))..."

$scriptBlock = {
    param($item, $sharedTok)
    [Net.ServicePointManager]::DefaultConnectionLimit = 100
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    function Invoke-CryptoJsEncrypt([string]$plainText, [string]$passphrase = "RDCrypto") {
        $salt = New-Object byte[] 8
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($salt)
        $passBytes = [System.Text.Encoding]::UTF8.GetBytes($passphrase)
        $md5 = [System.Security.Cryptography.MD5]::Create()
        $d_i = @()
        $derived = New-Object System.Collections.Generic.List[byte]
        while ($derived.Count -lt 48) {
            $inputBytes = New-Object byte[] ($d_i.Length + $passBytes.Length + $salt.Length)
            [Array]::Copy($d_i, 0, $inputBytes, 0, $d_i.Length)
            [Array]::Copy($passBytes, 0, $inputBytes, $d_i.Length, $passBytes.Length)
            [Array]::Copy($salt, 0, $inputBytes, $d_i.Length + $passBytes.Length, $salt.Length)
            $d_i = $md5.ComputeHash($inputBytes)
            $derived.AddRange($d_i)
        }
        $key = $derived.GetRange(0, 32).ToArray()
        $iv  = $derived.GetRange(32, 16).ToArray()
        $aes = [System.Security.Cryptography.Aes]::Create()
        $aes.Key = $key; $aes.IV = $iv; $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC; $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
        $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($plainText)
        $enc = $aes.CreateEncryptor().TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
        $saltedHeader = [System.Text.Encoding]::ASCII.GetBytes("Salted__")
        $outBytes = New-Object byte[] (16 + $enc.Length)
        [Array]::Copy($saltedHeader, 0, $outBytes, 0, 8); [Array]::Copy($salt, 0, $outBytes, 8, 8); [Array]::Copy($enc, 0, $outBytes, 16, $enc.Length)
        return [System.Uri]::EscapeDataString([Convert]::ToBase64String($outBytes))
    }

    try {
        $projId = $item.projectId
        $h = @{"Content-Type"="application/json; charset=utf-8"; "noToken"="noToken"; "noDataProfile"="noDataProfile"}
        $hTok = @{"Content-Type"="application/json; charset=utf-8"; "noToken"="noToken"; "noDataProfile"="noDataProfile"; "X-Announcement-Token"=$sharedTok}

        # 1. Fast GreenBook check
        $gb = Invoke-RestMethod -Uri "https://process5.gprocurement.go.th/egp-oann10-service/pb/a-egp-allt-project/announcement/greenBook?mode=LINK&methodId=16&tempProjectId=$projId&pageAnnounceType=$($item.stage)" -Headers $hTok -TimeoutSec 10
        $gbList = @()
        if ($gb.data -and $gb.data.greenBookAnnouncementTypeLinkDto) {
            $gbList = @($gb.data.greenBookAnnouncementTypeLinkDto)
        }
        if ($gbList.Count -eq 0) { return $null }

        # CRITICAL CHECK: Reject if bidding already closed (price = สรุปข้อมูลการเสนอราคาเบื้องต้น) or winner announced (W0/W1/W2) or contracted (I0) or cancelled
        $closedEntries = @($gbList | Where-Object {
            $_.announceType -in @("price","W0","W1","W2","I0","D1","B1") -or
            $_.announceTypeDesc -match 'ผู้ชนะ|เสนอราคาเบื้องต้น|สัญญา|ผู้ยื่นเอกสาร|ยกเลิก' -or
            $_.projectGovStatus -eq "R"
        })
        if ($closedEntries.Count -gt 0) {
            return $null
        }

        $gbTypes = ($gbList | ForEach-Object { $_.announceType }) -join ","
        $actualStage = if (@($gbList | Where-Object { $_.announceType -eq "D0" }).Count -gt 0) { "D0" } elseif (@($gbList | Where-Object { $_.announceType -eq "B0" }).Count -gt 0) { "B0" } else { $item.stage }

        $annDateStr = $item.announceDate
        $latestGb = $gbList | Where-Object { $_.announceDate } | Sort-Object announceDate -Descending | Select-Object -First 1
        if ($latestGb -and $latestGb.announceDate) {
            $dt = ([DateTime]$latestGb.announceDate).ToLocalTime()
            $annDateStr = "{0:D2}/{1:D2}/{2}" -f $dt.Day, $dt.Month, ($dt.Year + 543)
        }

        # 2. Fetch Document ZIP & PDF Template IDs ONLY for verified open projects
        $zipId = $null; $zipName = $null; $templateId = $null
        $draftZipId = $null; $draftZipName = $null; $draftTemplateId = $null

        if ($actualStage -eq "D0") {
            try {
                $docZip = Invoke-RestMethod -Uri "https://process5.gprocurement.go.th/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=$projId" -Headers $h -TimeoutSec 8
                if ($docZip.data) {
                    $zipId = $docZip.data.zipId
                    $zipName = $docZip.data.buildName1
                    $templateId = $docZip.data.buildName2
                }
            } catch {}
        }

        if (-not $zipId -or $actualStage -eq "B0" -or $gbTypes -match "B0") {
            try {
                $docTemp = Invoke-RestMethod -Uri "https://process5.gprocurement.go.th/egp-approval-service/apv-common/infoProcureDocAnnounZipTemp?projectId=$projId" -Headers $h -TimeoutSec 8
                if ($docTemp.data) {
                    $draftZipId = $docTemp.data.zipId
                    $draftZipName = $docTemp.data.buildName1
                    $draftTemplateId = $docTemp.data.buildName2
                    if (-not $zipId) { $zipId = $draftZipId; $zipName = $draftZipName }
                    if (-not $templateId) { $templateId = $draftTemplateId }
                }
            } catch {}
        }

        $priceZipId = $null; $priceZipName = $null
        try {
            $priceRes = Invoke-RestMethod -Uri "https://process5.gprocurement.go.th/egp-doc-price-estimate-service/dpe-common/infoDocPriceestZipHis?projectId=$projId" -Headers $h -TimeoutSec 8
            if ($priceRes.data) {
                $priceZipId = $priceRes.data.zipFileId
                $priceZipName = $priceRes.data.zipFileName
            }
        } catch {}

        $encParam = Invoke-CryptoJsEncrypt "{`"projectId`":`"$projId`"}" "RDCrypto"

        return [PSCustomObject]@{
            projectId = $projId
            projectName = $item.projectName
            dept = $item.dept
            province = $item.province
            announceDate = $annDateStr
            budget = $item.budget
            refPrice = $item.refPrice
            flowName = $item.status
            stage = $actualStage
            greenBookTypes = $gbTypes
            egpDirectUrl = "https://process5.gprocurement.go.th/egp-agpc01-web/announcement/procurement/$encParam"
            torZipId = $zipId
            torZipName = $zipName
            torZipUrl = if ($zipId) { "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=$zipId" } else { $null }
            announceTemplateId = $templateId
            announcePdfUrl = if ($templateId) { "https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file?templateId=$templateId" } else { $null }
            draftZipId = $draftZipId
            draftZipUrl = if ($draftZipId) { "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=$draftZipId" } else { $null }
            draftTemplateId = $draftTemplateId
            draftPdfUrl = if ($draftTemplateId) { "https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file?templateId=$draftTemplateId" } else { $null }
            priceZipId = $priceZipId
            priceZipName = $priceZipName
            priceZipUrl = if ($priceZipId) { "https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=$priceZipId" } else { $null }
            matchedKw = $item.matchedKw
        }
    } catch {
        return $null
    }
}

$pool = [RunspaceFactory]::CreateRunspacePool(1, 15)
$pool.Open()

$verified = @()
$batchSize = 25
for ($offset = 0; $offset -lt $candidates.Count; $offset += $batchSize) { $tokRes = Invoke-RestMethod -Uri "https://process5.gprocurement.go.th/egp-oann10-service/pb/a-egp-allt-project/announcement/generateToken" -Method Post -Headers $h -Body (@{ key = "EGP-ANNOUNCEMENT-KEY" } | ConvertTo-Json) -TimeoutSec 10; $sharedToken = $tokRes.data;
    $end = [Math]::Min($offset + $batchSize - 1, $candidates.Count - 1)
    $batch = $candidates[$offset..$end]
    $jobs = @()
    foreach ($c in $batch) {
        $ps = [PowerShell]::Create().AddScript($scriptBlock).AddArgument($c).AddArgument($sharedToken)
        $ps.RunspacePool = $pool
        $jobs += [PSCustomObject]@{ Pipe = $ps; Handle = $ps.BeginInvoke() }
    }
    foreach ($j in $jobs) {
        $res = $j.Pipe.EndInvoke($j.Handle)
        $j.Pipe.Dispose()
        if ($res) { $verified += $res }
    }
    Write-Output "Processed $($end + 1) / $($candidates.Count)... Verified Open so far: $($verified.Count)"
}

$pool.Close()
$pool.Dispose()

Write-Output "=== DONE! Total Verified Genuinely-Open IT Tenders: $($verified.Count) ==="
$verified | Group-Object stage | Select-Object Name, Count | Format-Table -AutoSize
$verified | Group-Object announceDate | Select-Object Name, Count | Sort-Object Name -Descending | Format-Table -AutoSize
$withTorZip = @($verified | Where-Object { $_.torZipUrl }).Count
$withPdf = @($verified | Where-Object { $_.announcePdfUrl }).Count
$withPriceZip = @($verified | Where-Object { $_.priceZipUrl }).Count
Write-Output "With Real TOR ZIP URL: $withTorZip | With Real Announce PDF URL: $withPdf | With Real Price ZIP URL: $withPriceZip"

[System.IO.File]::WriteAllText("$PWD\verified_open_it_tenders.json", ($verified | ConvertTo-Json -Depth 6), [System.Text.Encoding]::UTF8)
