$ErrorActionPreference = 'Stop'

function Require-EnvironmentValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "缺少必需环境变量：$Name"
  }
  return $value.Trim()
}

$installerUrl = Require-EnvironmentValue -Name 'WECHAT_DEVTOOLS_INSTALLER_URL'
$preferredCliPath = Require-EnvironmentValue -Name 'WECHAT_DEVTOOLS_CLI'

$installerUri = [Uri]$installerUrl
if ($installerUri.Scheme -ne 'https') {
  throw 'WECHAT_DEVTOOLS_INSTALLER_URL 必须是 HTTPS 地址'
}

if (-not (Test-Path -LiteralPath $preferredCliPath -PathType Leaf)) {
  $installer = Join-Path $env:RUNNER_TEMP 'wechat_devtools_installer.exe'
  Write-Host "下载微信开发者工具安装器到 $installer"
  Invoke-WebRequest -Uri $installerUri -OutFile $installer

  Write-Host '以静默方式安装微信开发者工具'
  $installProcess = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
  if ($installProcess.ExitCode -ne 0) {
    throw "微信开发者工具安装失败，退出码：$($installProcess.ExitCode)"
  }
}

function Find-DevtoolsCli {
  param([string]$PreferredPath)

  if (Test-Path -LiteralPath $PreferredPath -PathType Leaf) {
    return $PreferredPath
  }

  $roots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Tencent'),
    (Join-Path $env:ProgramFiles 'Tencent'),
    (Join-Path $env:LOCALAPPDATA 'Programs'),
    (Join-Path $env:LOCALAPPDATA 'Tencent')
  ) | Where-Object { Test-Path -LiteralPath $_ }

  foreach ($root in $roots) {
    $candidate = Get-ChildItem -LiteralPath $root -Filter 'cli.bat' -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '微信.*开发者工具|Wechat.*DevTools|wechat.*devtools' } |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  return $null
}

$cliPath = Find-DevtoolsCli -PreferredPath $preferredCliPath
if (-not $cliPath) {
  throw '微信开发者工具安装后仍未找到 cli.bat'
}

if ($env:GITHUB_ENV) {
  "WECHAT_DEVTOOLS_CLI=$cliPath" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
}
Write-Host "微信开发者工具 CLI：$cliPath"
Write-Host '校验微信开发者工具 CLI'
& $cliPath --version
if ($LASTEXITCODE -ne 0) {
  throw '微信开发者工具 CLI 自检失败'
}
