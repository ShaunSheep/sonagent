$ErrorActionPreference = "Stop"
$logFile = "E:\sonagent\server.log"

# 停止现有的 node 进程
$existingProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($existingProcs) {
    Write-Host "Stopping existing node processes..."
    $existingProcs | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

Start-Sleep -Milliseconds 300

$env:NODE_ENV = "development"
$proc = Start-Process -FilePath "node" -ArgumentList "E:\sonagent\server.js" -WorkingDirectory "E:\sonagent" -PassThru -RedirectStandardOutput $logFile -WindowStyle Hidden

Start-Sleep -Seconds 2

if ($proc.HasExited) {
    Write-Host "[ERROR] Server exited with code: $($proc.ExitCode)"
    if (Test-Path $logFile) {
        Get-Content $logFile | Select-Object -Last 10
    }
    exit 1
}

Write-Host "[OK] Server started with PID: $($proc.Id)"
exit 0
