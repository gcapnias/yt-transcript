[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$VideoId
)

$vttFile = "$VideoId.en.vtt"
$url = "https://www.youtube.com/watch?v=$VideoId"

# 1. Download auto-generated English subtitles
Write-Host "Fetching subtitles for video ID: $VideoId..." -ForegroundColor Cyan
yt-dlp --write-auto-sub --sub-lang en --skip-download -o "%(id)s.%(ext)s" $url

if ($LASTEXITCODE -ne 0) {
    Write-Error "yt-dlp encountered an error while downloading subtitles."
    exit $LASTEXITCODE
}

# 2. Process and clean up files
if (Test-Path -Path $vttFile) {
    Write-Host "Processing transcript..." -ForegroundColor Cyan
    node clean-transcript.js $vttFile

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Removing temporary subtitle file ($vttFile)..." -ForegroundColor Cyan
        Remove-Item -Path $vttFile -Force
        Write-Host "Successfully completed!" -ForegroundColor Green
    } else {
        Write-Warning "clean-transcript.js returned an error code. Preserving $vttFile for inspection."
    }
} else {
    Write-Error "Expected subtitle file '$vttFile' was not found. The video may not have English auto-subtitles available."
}