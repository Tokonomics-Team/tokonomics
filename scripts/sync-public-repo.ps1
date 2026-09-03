# Tokonomics public-document sync and disclosure guard
param(
    [string]$PublicRepoPath = "..\tokonomics-public"
)

Write-Host "Syncing approved Tokonomics public documentation and assets..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $PublicRepoPath)) {
    New-Item -ItemType Directory -Path $PublicRepoPath -Force | Out-Null
}

# Copy only explicitly approved public material. Internal architecture, engineering
# contracts, implementation plans, validation reports, and source are intentionally absent.
Copy-Item -LiteralPath "README.md" -Destination $PublicRepoPath -Force
Copy-Item -LiteralPath "CHANGELOG.md" -Destination $PublicRepoPath -Force
Copy-Item -LiteralPath "LICENSE" -Destination (Join-Path $PublicRepoPath "LICENSE.txt") -Force
Copy-Item -LiteralPath ".github" -Destination $PublicRepoPath -Recurse -Force
Copy-Item -LiteralPath "assets" -Destination $PublicRepoPath -Recurse -Force

$forbiddenFiles = Get-ChildItem -LiteralPath $PublicRepoPath -Recurse -File | Where-Object {
    $_.Extension -in @('.ts', '.tsx', '.map') -or $_.Name -in @('tsconfig.json', 'esbuild.js')
}
if ($forbiddenFiles.Count -gt 0) {
    Write-Host "[SECURITY ALERT] Source files detected in the public target. Aborting." -ForegroundColor Red
    $forbiddenFiles | ForEach-Object { Write-Host "  - $($_.FullName)" -ForegroundColor Red }
    exit 1
}

$privateDocuments = Get-ChildItem -LiteralPath $PublicRepoPath -Recurse -File | Where-Object {
    $_.Name -eq 'FEATURES_AND_SAVINGS.md' -or $_.Name -like 'INTERNAL_*.md' -or
    $_.Name -like 'PHASE_*.md' -or $_.Name -like '*_CONTRACT.md'
}
if ($privateDocuments.Count -gt 0) {
    Write-Host "[SECURITY ALERT] Internal documentation exists in the public target. Remove it before syncing." -ForegroundColor Red
    $privateDocuments | ForEach-Object { Write-Host "  - $($_.FullName)" -ForegroundColor Red }
    exit 1
}

$publicDocs = @(
    (Join-Path $PublicRepoPath "README.md"),
    (Join-Path $PublicRepoPath "CHANGELOG.md")
)
$sensitiveTerms = 'src/|PipelineOrchestrator|tree-sitter|PageRank|BM25|knapsack|McNemar|HMAC|16-stage|System Dependence Graph|Reciprocal Rank'
foreach ($doc in $publicDocs) {
    if ((Get-Content -LiteralPath $doc -Raw) -match $sensitiveTerms) {
        Write-Host "[SECURITY ALERT] Internal architecture detail detected in $doc. Aborting." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Public documentation synced with source and architecture-detail isolation." -ForegroundColor Green
