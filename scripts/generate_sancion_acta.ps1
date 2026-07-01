param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$PayloadPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Security

$OpenMarkerChar = [char]0x00AB
$CloseMarkerChar = [char]0x00BB

function Convert-OdtMarkerText {
  param([string]$Xml)

  $text = [regex]::Replace($Xml, '<text:s(?:\s+text:c="(\d+)")?\s*/>', [System.Text.RegularExpressions.MatchEvaluator]{
    param($match)
    $count = 1
    if ($match.Groups[1].Success) {
      $count = [int]$match.Groups[1].Value
    }
    return " " * $count
  })
  $text = $text -replace '<text:tab\s*/>', "`t"
  $text = $text -replace '<text:line-break\s*/>', "`n"
  $text = $text -replace '<[^>]+>', ''
  return [System.Net.WebUtility]::HtmlDecode($text)
}

function Normalize-MarkerKey {
  param([string]$Value)

  $inner = $Value.Trim().Trim([char[]]@($OpenMarkerChar, $CloseMarkerChar)).Trim()
  $normalized = $inner.Normalize([Text.NormalizationForm]::FormD)
  $builder = [System.Text.StringBuilder]::new()
  foreach ($char in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  return (($builder.ToString().ToUpperInvariant() -replace '\s+', ' ').Trim())
}

function Resolve-ReplacementKey {
  param([string]$Key, [hashtable]$ReplacementMap)

  if ($ReplacementMap.ContainsKey($Key)) {
    return $Key
  }

  if ($Key -like 'FECHA ACTUAL EN EL FORMATO*') {
    foreach ($candidate in $ReplacementMap.Keys) {
      if ($candidate -like 'FECHA ACTUAL EN EL FORMATO*') {
        return $candidate
      }
    }
  }

  return $null
}

function Convert-ValueToOdtXml {
  param([string]$Value)

  $lines = (($Value -replace "`r`n", "`n") -replace "`r", "`n").Split("`n")
  $escaped = foreach ($line in $lines) {
    [System.Security.SecurityElement]::Escape($line)
  }
  return ($escaped -join '<text:line-break/>')
}

function Get-MarkerValueStyleName {
  param([string]$Xml)

  $spanMatches = [regex]::Matches($Xml, '<text:span[^>]*text:style-name="([^"]+)"[^>]*>([\s\S]*?)</text:span>')
  foreach ($span in $spanMatches) {
    $text = Convert-OdtMarkerText $span.Groups[2].Value
    $text = $text.Trim().Trim([char[]]@($OpenMarkerChar, $CloseMarkerChar)).Trim()
    if ($text) {
      return $span.Groups[1].Value
    }
  }

  return ""
}

$payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$replacementMap = @{}
foreach ($property in $payload.replacements.PSObject.Properties) {
  $replacementMap[(Normalize-MarkerKey $property.Name)] = [string]$property.Value
}

Copy-Item -LiteralPath $TemplatePath -Destination $OutputPath -Force

$archive = [System.IO.Compression.ZipFile]::Open($OutputPath, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  $entry = $archive.GetEntry('content.xml')
  if (-not $entry) {
    throw "La plantilla ODT no contiene content.xml."
  }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  $contentXml = $reader.ReadToEnd()
  $reader.Close()

  $markerPattern = [regex]::Escape([string]$OpenMarkerChar) + '[\s\S]*?' + [regex]::Escape([string]$CloseMarkerChar)
  $contentXml = [regex]::Replace($contentXml, $markerPattern, [System.Text.RegularExpressions.MatchEvaluator]{
    param($match)

    $markerText = Convert-OdtMarkerText $match.Value
    $key = Normalize-MarkerKey $markerText
    $replacementKey = Resolve-ReplacementKey $key $replacementMap
    if ($replacementKey) {
      $replacementXml = Convert-ValueToOdtXml $replacementMap[$replacementKey]
      $styleName = Get-MarkerValueStyleName $match.Value
      if ($styleName) {
        return '<text:span text:style-name="' + $styleName + '">' + $replacementXml + '</text:span>'
      }
      return $replacementXml
    }

    return $match.Value
  })

  $entry.Delete()
  $nextEntry = $archive.CreateEntry('content.xml', [System.IO.Compression.CompressionLevel]::Optimal)
  $writer = [System.IO.StreamWriter]::new($nextEntry.Open(), [System.Text.UTF8Encoding]::new($false))
  $writer.Write($contentXml)
  $writer.Close()
} finally {
  $archive.Dispose()
}
