import type { ScannedGame } from '../../shared/types';
import { run } from '../util';

// PC Game Pass / Microsoft Store games ship a MicrosoftGame.config in their package folder,
// which is what separates them from ordinary Store apps.
const PS = `
$ErrorActionPreference = 'SilentlyContinue'
$out = @()
foreach ($p in Get-AppxPackage) {
  if ($p.IsFramework -or $p.SignatureKind -eq 'System') { continue }
  $loc = $p.InstallLocation
  if (-not $loc) { continue }
  if (-not (Test-Path (Join-Path $loc 'MicrosoftGame.config'))) { continue }
  $m = Get-AppxPackageManifest $p
  $app = @($m.Package.Applications.Application)[0]
  if (-not $app) { continue }
  $name = $m.Package.Properties.DisplayName
  if ($name -like 'ms-resource:*') {
    try { [xml]$cfg = Get-Content (Join-Path $loc 'MicrosoftGame.config'); $name = $cfg.Game.ShellVisuals.DefaultDisplayName } catch {}
  }
  if (-not $name -or $name -like 'ms-resource:*') { $name = $p.Name }
  $logo = $null
  try { [xml]$cfg2 = Get-Content (Join-Path $loc 'MicrosoftGame.config'); $logo = $cfg2.Game.ShellVisuals.Square480x480Logo } catch {}
  if (-not $logo) { $logo = $m.Package.Properties.Logo }
  $out += [pscustomobject]@{ name = $name; family = $p.PackageFamilyName; app = $app.Id; dir = $loc; logo = $logo }
}
$out | ConvertTo-Json -Compress
`;

export async function scanXbox(): Promise<ScannedGame[]> {
  if (process.platform !== 'win32') return [];
  const raw = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS], 60000);
  if (!raw.trim()) return [];
  let rows: any[];
  try {
    const j = JSON.parse(raw);
    rows = Array.isArray(j) ? j : [j];
  } catch {
    return [];
  }
  return rows.map((r) => {
    const logo = r.logo ? `${String(r.dir).replace(/\\$/, '')}\\${String(r.logo)}` : undefined;
    return {
      id: `xbox:${r.family}`,
      source: 'xbox' as const,
      sourceGameId: r.family,
      title: r.name,
      installDir: r.dir,
      launch: { kind: 'exe' as const, target: 'explorer.exe', args: [`shell:AppsFolder\\${r.family}!${r.app}`] },
      art: logo ? { icon: `lumen-img://local/?p=${encodeURIComponent(logo)}` } : {}
    };
  });
}
