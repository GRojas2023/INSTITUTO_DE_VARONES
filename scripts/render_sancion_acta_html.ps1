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

function Add-CssProperty {
  param([string[]]$Items, [string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Items
  }
  return $Items + "${Name}:$Value"
}

function Convert-StyleBodyToCss {
  param([string]$Body)

  $items = @()
  $color = [regex]::Match($Body, 'fo:color="([^"]+)"')
  if ($color.Success -and $color.Groups[1].Value -ne "#000000") {
    $items = Add-CssProperty $items "color" $color.Groups[1].Value
  }

  $fontSize = [regex]::Match($Body, 'fo:font-size="([^"]+)"')
  if ($fontSize.Success) {
    $items = Add-CssProperty $items "font-size" $fontSize.Groups[1].Value
  }

  if ($Body -match 'fo:font-weight="bold"|style:font-weight-asian="bold"|style:font-weight-complex="bold"') {
    $items = Add-CssProperty $items "font-weight" "700"
  }

  if ($Body -match 'fo:font-style="italic"|style:font-style-asian="italic"|style:font-style-complex="italic"') {
    $items = Add-CssProperty $items "font-style" "italic"
  }

  $align = [regex]::Match($Body, 'fo:text-align="([^"]+)"')
  if ($align.Success) {
    $items = Add-CssProperty $items "text-align" $align.Groups[1].Value
  }

  if ($Body -match 'style:text-underline-style="[^"]+"') {
    $items = Add-CssProperty $items "text-decoration" "underline"
  }

  return ($items -join ';')
}

function Get-StyleMap {
  param([string]$Xml)

  $map = @{}
  $styleMatches = [regex]::Matches($Xml, '<style:style[^>]*style:name="([^"]+)"[^>]*>([\s\S]*?)</style:style>')
  foreach ($style in $styleMatches) {
    $map[$style.Groups[1].Value] = Convert-StyleBodyToCss $style.Groups[2].Value
  }
  return $map
}

function Convert-OdtInlineToHtml {
  param([string]$Xml, [hashtable]$StyleMap)

  $html = [regex]::Replace($Xml, '<text:s(?:\s+text:c="(\d+)")?\s*/>', [System.Text.RegularExpressions.MatchEvaluator]{
    param($match)
    $count = 1
    if ($match.Groups[1].Success) {
      $count = [int]$match.Groups[1].Value
    }
    return "&nbsp;" * $count
  })
  $html = $html -replace '<text:tab\s*/>', '&nbsp;&nbsp;&nbsp;&nbsp;'
  $html = $html -replace '<text:line-break\s*/>', '<br>'

  $spanPattern = '<text:span([^>]*)>([\s\S]*?)</text:span>'
  while ([regex]::IsMatch($html, $spanPattern)) {
    $html = [regex]::Replace($html, $spanPattern, [System.Text.RegularExpressions.MatchEvaluator]{
      param($match)
      $attr = $match.Groups[1].Value
      $inner = $match.Groups[2].Value
      $styleName = ""
      $styleMatch = [regex]::Match($attr, 'text:style-name="([^"]+)"')
      if ($styleMatch.Success) {
        $styleName = $styleMatch.Groups[1].Value
      }
      $css = if ($styleName -and $StyleMap.ContainsKey($styleName)) { $StyleMap[$styleName] } else { "" }
      if ($css) {
        return '<span style="' + $css + '">' + $inner + '</span>'
      }
      return '<span>' + $inner + '</span>'
    })
  }

  $html = $html -replace '</?(?!span\b|br\b)[A-Za-z]+:[^>]+>', ''
  $html = $html -replace '<(?!/?(?:span|br)\b)[^>]+>', ''
  return $html
}

$payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$replacementMap = @{}
foreach ($property in $payload.replacements.PSObject.Properties) {
  $replacementMap[(Normalize-MarkerKey $property.Name)] = [string]$property.Value
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($TemplatePath)
try {
  $entry = $archive.GetEntry('content.xml')
  if (-not $entry) {
    throw "La plantilla ODT no contiene content.xml."
  }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  $contentXml = $reader.ReadToEnd()
  $reader.Close()
} finally {
  $archive.Dispose()
}

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

$styleMap = Get-StyleMap $contentXml
$textMatch = [regex]::Match($contentXml, '<office:text[\s\S]*?</office:text>')
$textXml = if ($textMatch.Success) { $textMatch.Value } else { $contentXml }
$paragraphMatches = [regex]::Matches($textXml, '<text:(p|h)([^>]*)>([\s\S]*?)</text:\1>')
$htmlParts = New-Object System.Collections.Generic.List[string]

foreach ($paragraph in $paragraphMatches) {
  $attr = $paragraph.Groups[2].Value
  $inner = $paragraph.Groups[3].Value
  $styleName = ""
  $styleMatch = [regex]::Match($attr, 'text:style-name="([^"]+)"')
  if ($styleMatch.Success) {
    $styleName = $styleMatch.Groups[1].Value
  }
  $css = if ($styleName -and $styleMap.ContainsKey($styleName)) { $styleMap[$styleName] } else { "" }
  if (-not $css) {
    $css = "text-align:justify"
  }

  $paragraphHtml = Convert-OdtInlineToHtml $inner $styleMap
  if ([string]::IsNullOrWhiteSpace(($paragraphHtml -replace '<[^>]+>', '').Replace('&nbsp;', '').Trim())) {
    $paragraphHtml = "&nbsp;"
  }

  $htmlParts.Add('<p style="' + $css + '">' + $paragraphHtml + '</p>')
}

$html = $htmlParts -join "`n"
[System.IO.File]::WriteAllText($OutputPath, $html, [System.Text.UTF8Encoding]::new($false))
