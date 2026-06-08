param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("sku", "decision", "effect-review", "daily-review", "weekly-review", "playbook", "resolver", "source-digest")]
  [string]$Type,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [string]$Sku,

  [string]$Date = (Get-Date -Format "yyyy-MM-dd"),

  [Parameter(Mandatory = $true)]
  [string]$Body,

  [string]$Vault = "D:\ad-ops-brain",

  [switch]$Import
)

$ErrorActionPreference = "Stop"

function Test-SecretLikeContent {
  param([string]$Text)

  $patterns = @(
    '(?i)Bearer\s+[A-Za-z0-9._\-]{12,}',
    '(?i)api[_ -]?key\s*[:=]\s*\S{8,}',
    '(?i)cookie\s*[:=]',
    '(?i)csrf\s*[:=]',
    '(?i)inventory-token\s*[:=]',
    '(?i)jwt\s*[:=]'
  )

  foreach ($pattern in $patterns) {
    if ($Text -match $pattern) {
      return $true
    }
  }
  return $false
}

function New-Slug {
  param([string]$Text, [string]$Fallback)

  $slug = $Text.ToLowerInvariant()
  $slug = $slug -replace '[^\p{Ll}\p{Lu}\p{Nd}]+', '-'
  $slug = $slug.Trim('-')
  $ascii = ($slug.ToCharArray() | Where-Object { [int][char]$_ -lt 128 }) -join ''
  $ascii = $ascii -replace '-+', '-'
  $ascii = $ascii.Trim('-')

  if ([string]::IsNullOrWhiteSpace($ascii)) {
    return $Fallback
  }
  return $ascii
}

function Resolve-RelativePath {
  param([string]$Type, [string]$Title, [string]$Sku, [string]$Date)

  $base = if ($Sku) { $Sku } else { $Title }
  $slug = New-Slug -Text $base -Fallback "note"

  switch ($Type) {
    "sku" {
      if ($Sku) {
        return "01-SKU当前结论\$Sku.md"
      }
      return "01-SKU当前结论\$slug.md"
    }
    "decision" { return "02-决策记录\$Date-$slug.md" }
    "effect-review" { return "03-复盘\效果复盘\$Date-$slug.md" }
    "daily-review" { return "03-复盘\每日复盘\$Date-$slug.md" }
    "weekly-review" { return "03-复盘\周复盘\$Date-$slug.md" }
    "playbook" { return "04-标准打法\$slug.md" }
    "resolver" { return "05-名称映射\$slug.md" }
    "source-digest" { return "06-来源摘要\$Date-$slug.md" }
  }
}

function Resolve-TypeLabel {
  param([string]$Type)

  switch ($Type) {
    "sku" { return "SKU 当前结论" }
    "decision" { return "决策记录" }
    "effect-review" { return "效果复盘" }
    "daily-review" { return "每日复盘" }
    "weekly-review" { return "周复盘" }
    "playbook" { return "标准打法" }
    "resolver" { return "名称映射" }
    "source-digest" { return "来源摘要" }
  }
}

if (-not (Test-Path -LiteralPath $Vault)) {
  throw "Vault not found: $Vault"
}

if (Test-SecretLikeContent -Text $Body) {
  throw "Refusing to write secret-like content. Redact keys, cookies, JWT, CSRF, and tokens first."
}

$relativePath = Resolve-RelativePath -Type $Type -Title $Title -Sku $Sku -Date $Date
$targetPath = Join-Path $Vault $relativePath
$targetDir = Split-Path -Parent $targetPath
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

if (Test-Path -LiteralPath $targetPath) {
  throw "Target already exists: $targetPath. Update it with apply_patch instead of overwriting."
}

$lines = @()
$lines += "# $Title"
$lines += ""
$lines += "类型：$(Resolve-TypeLabel -Type $Type)"
$lines += "日期：$Date"
if ($Sku) {
  $lines += "SKU：$Sku"
}
$lines += "状态：草稿"
$lines += "过期条件：下次相关实时读取前"
$lines += ""
$lines += $Body.Trim()
$lines += ""

Set-Content -LiteralPath $targetPath -Value ($lines -join "`n") -Encoding UTF8

Write-Host "created=$targetPath"

if ($Import) {
  $runner = Join-Path $Vault "90-脚本\run-gbrain.ps1"
  if (-not (Test-Path -LiteralPath $runner)) {
    throw "GBrain runner not found: $runner"
  }
  powershell -NoProfile -ExecutionPolicy Bypass -File $runner import $Vault
}
