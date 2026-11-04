param([Parameter(Mandatory)][string]$ExportZip, [string]$EpisodeMapCsv)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ExportZip).Path)
try {
    $entry = $archive.GetEntry('Table data.csv')
    if (-not $entry) { throw 'Studio export is missing Table data.csv.' }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $rows = $reader.ReadToEnd() | ConvertFrom-Csv }
    finally { $reader.Dispose() }
} finally { $archive.Dispose() }
$journal = Join-Path $root 'storage/automation/uploads.json'
$episodeByVideo = @{}
if (Test-Path -LiteralPath $journal) {
    $uploads = Get-Content -LiteralPath $journal -Raw | ConvertFrom-Json
    foreach ($upload in $uploads.PSObject.Properties) {
        if ($upload.Value.videoId) { $episodeByVideo[$upload.Value.videoId] = $upload.Name }
    }
}
if ($EpisodeMapCsv) {
    foreach ($mapping in (Import-Csv -LiteralPath $EpisodeMapCsv)) {
        if ($mapping.VideoId -cnotmatch '^[A-Za-z0-9_-]{11}$' -or [string]::IsNullOrWhiteSpace($mapping.Episode)) {
            throw 'Episode map rows require a valid VideoId and an Episode.'
        }
        if ($episodeByVideo.ContainsKey($mapping.VideoId) -and $episodeByVideo[$mapping.VideoId] -cne $mapping.Episode) {
            throw "Conflicting episode mapping for $($mapping.VideoId)."
        }
        $episodeByVideo[$mapping.VideoId] = $mapping.Episode
    }
}
$hookByFile = @{}
$hookLog = Join-Path $root 'episodes/hook-log.jsonl'
if (Test-Path -LiteralPath $hookLog) {
    foreach ($line in (Get-Content -LiteralPath $hookLog)) {
        if (-not $line.Trim()) { continue }
        $record = ConvertFrom-Json -InputObject $line
        $hookByFile[$record.short] = $record
    }
}
foreach ($row in $rows) {
    if ($row.Content -cnotmatch '^[A-Za-z0-9_-]{11}$') { continue }
    $episode = $episodeByVideo[$row.Content]
    $hook = $null
    $opening = $null
    if ($episode -cmatch '^episodes/[A-Za-z0-9_-]+\.assemble\.json$') {
        $specFile = Join-Path $root $episode
        if (Test-Path -LiteralPath $specFile) {
            $spec = Get-Content -LiteralPath $specFile -Raw | ConvertFrom-Json
            if ($spec.output) { $hook = $hookByFile[[IO.Path]::GetFileName($spec.output)] }
            if ($spec.scenes) { $opening = $spec.scenes[0].text }
        }
    }
    [pscustomobject]@{
        OpeningLine = if ($hook) { $hook.first_line } else { $opening }
        HookTags = if ($hook) { $hook.tags -join ',' }
        VideoId = $row.Content
        Title = $row.'Video title'
        Episode = $episodeByVideo[$row.Content]
        Views = $row.Views
        Subscribers = $row.Subscribers
        WatchHours = $row.'Watch time (hours)'
    }
}
