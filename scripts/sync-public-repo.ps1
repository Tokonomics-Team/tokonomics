# Tokonomics Public Docs Sync & Leak Prevention Script
param(
    [string]$PublicRepoPath = "..\tokonomics-public"
)

Write-Host "🛡️ Syncing documentation and assets to public repo..." -ForegroundColor Cyan

if (-not (Test-Path $PublicRepoPath)) {
    New-Item -ItemType Directory -Path $PublicRepoPath -Force | Out-Null
}

# 1. Copy ONLY public files
Copy-Item "README.md" "$PublicRepoPath\" -Force
Copy-Item "CHANGELOG_PUBLIC.md" "$PublicRepoPath\CHANGELOG.md" -Force
Copy-Item "LICENSE" "$PublicRepoPath\LICENSE.txt" -Force
Copy-Item "FEATURES_AND_SAVINGS.md" "$PublicRepoPath\" -Force
Copy-Item ".github" "$PublicRepoPath\" -Recurse -Force
Copy-Item "assets" "$PublicRepoPath\" -Recurse -Force

# 2. Strict Security Check: Verify NO source files were copied
$forbidden = Get-ChildItem -Path $PublicRepoPath -Recurse -Include *.ts, *.tsx, *.map, tsconfig.json, esbuild.js -Exclude node_modules
if ($forbidden.Count -gt 0) {
    Write-Host "🚨 [SECURITY ALERT] Source files detected in public repo! Aborting sync:" -ForegroundColor Red
    $forbidden | ForEach-Object { Write-Host "  - $($_.FullName)" -ForegroundColor Red }
    exit 1
}

Write-Host "✅ Public documentation synced with 100% source isolation (0 code files)." -ForegroundColor Green
