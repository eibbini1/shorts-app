param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$logDirectory = Join-Path $projectRoot 'storage\automation'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
try { $projectHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot))).Replace('-', '').Substring(0, 20) } finally { $hashAlgorithm.Dispose() }
$launcherMutex = New-Object System.Threading.Mutex($false, ('Local\ShortsWorker-' + $projectHash))
$ownsMutex = $false
try {
    try { $ownsMutex = $launcherMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    $lockFile = Join-Path $logDirectory 'worker.lock'
    if (Test-Path -LiteralPath $lockFile) {
        $lockText = Get-Content -LiteralPath $lockFile -Raw
        $owner = $lockText | ConvertFrom-Json
        $ownerProcess = $null
        try { $ownerProcess = Get-Process -Id ([int]$owner.pid) -ErrorAction Stop }
        catch { if ($_.CategoryInfo.Category -ne 'ObjectNotFound') { throw } }
        if ($ownerProcess) {
            $ownerDate = [DateTimeOffset]::Parse($owner.startedAt).UtcDateTime
            if ($ownerProcess.StartTime.ToUniversalTime() -le $ownerDate.AddSeconds(5)) { exit 0 }
        }
        # The saved owner is gone, or its PID belongs to a newer process. The mutex serializes launchers.
        if ((Get-Content -LiteralPath $lockFile -Raw) -ne $lockText) { throw 'Worker ownership changed during startup.' }
        Remove-Item -LiteralPath $lockFile
    }
    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    $workerArguments = @('--import', 'tsx', 'src/cli/automate.ts', '--watch')
    if ($PrepareOnly) { $workerArguments += '--prepare-only' }
    $stdoutFile = Join-Path $logDirectory 'worker-console.log'
    $stderrFile = Join-Path $logDirectory 'worker-errors.log'
    foreach ($logFile in @($stdoutFile, $stderrFile)) {
        if (Test-Path -LiteralPath $logFile) { Copy-Item -LiteralPath $logFile -Destination ($logFile + '.previous') -Force }
    }
    Add-Type -Path (Join-Path $PSScriptRoot 'WorkerJob.cs')
    $jobHandle = [ShortsWorkerJob]::Create()
    try {
        $childProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $workerArguments -WorkingDirectory $projectRoot -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -WindowStyle Hidden -PassThru
        try { [ShortsWorkerJob]::Attach($jobHandle, $childProcess.Handle) }
        catch { $childProcess.Kill(); $childProcess.WaitForExit(); throw }
        $childProcess.WaitForExit()
        exit $childProcess.ExitCode
    } finally { [ShortsWorkerJob]::Close($jobHandle) }
} finally {
    if ($ownsMutex) { $launcherMutex.ReleaseMutex() }
    $launcherMutex.Dispose()
}
