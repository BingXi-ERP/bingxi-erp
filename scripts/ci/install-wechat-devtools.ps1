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
$cliPath = Require-EnvironmentValue -Name 'WECHAT_DEVTOOLS_CLI'

$installerUri = [Uri]$installerUrl
if ($installerUri.Scheme -ne 'https') {
  throw 'WECHAT_DEVTOOLS_INSTALLER_URL 必须是 HTTPS 地址'
}

if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
  $installer = Join-Path $env:RUNNER_TEMP 'wechat_devtools_installer.exe'
  Write-Host "下载微信开发者工具安装器到 $installer"
  Invoke-WebRequest -Uri $installerUri -OutFile $installer

  Write-Host '以静默方式安装微信开发者工具'
  $installProcess = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
  if ($installProcess.ExitCode -ne 0) {
    throw "微信开发者工具安装失败，退出码：$($installProcess.ExitCode)"
  }
}

if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
  throw "微信开发者工具 CLI 不存在：$cliPath"
}

Write-Host '校验微信开发者工具 CLI'
& $cliPath --version
if ($LASTEXITCODE -ne 0) {
  throw "微信开发者工具 CLI 自检失败，退出码：$LASTEXITCODE"
}
