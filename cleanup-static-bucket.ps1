$ErrorActionPreference = 'Stop'

$bucket = 'nexus-support-portal-dev-static-548535252270-logs'
$region = 'eu-north-1'
$profile = 'nexus'

$data = aws s3api list-object-versions --bucket $bucket --profile $profile --region $region --output json | ConvertFrom-Json

$items = @()
if ($null -ne $data.Versions) {
    $items += $data.Versions | ForEach-Object {
        @{ Key = $_.Key; VersionId = $_.VersionId }
    }
}
if ($null -ne $data.DeleteMarkers) {
    $items += $data.DeleteMarkers | ForEach-Object {
        @{ Key = $_.Key; VersionId = $_.VersionId }
    }
}

Write-Host ('Deleting ' + $items.Count + ' versioned entries from ' + $bucket)

for ($i = 0; $i -lt $items.Count; $i += 500) {
    $end = [Math]::Min($i + 499, $items.Count - 1)
    $batch = @($items[$i..$end])
    $payload = @{ Objects = $batch; Quiet = $true } | ConvertTo-Json -Depth 10
    $tmp = Join-Path $env:TEMP ('delete-' + [guid]::NewGuid().ToString() + '.json')
    Set-Content -LiteralPath $tmp -Value $payload -Encoding UTF8
    & aws s3api delete-objects --bucket $bucket --profile $profile --region $region --delete file://$tmp | Out-Null
    Remove-Item -LiteralPath $tmp -Force
    Write-Host ('Deleted batch ' + ([int]($i / 500) + 1) + ' of ' + [Math]::Ceiling($items.Count / 500.0))
}

Write-Host ('Finished deleting entries from ' + $bucket)
