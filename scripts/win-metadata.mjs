/**
 * Writes Lumen's icon and name into the built Windows exe.
 *
 * electron-builder does this itself, but only by running rcedit, which on Linux needs wine. There
 * is no wine in the container these rounds are built in, so `--win dir` has to be run with
 * `signAndEditExecutable=false` and the exe comes out still calling itself Electron, with the
 * Electron icon, as Explorer's Properties dialog will happily tell you.
 *
 * resedit does the same job in plain JavaScript, and electron-builder already relies on it here to
 * write the asar integrity resource, so the same library is doing the same thing to the same file.
 * Run this after electron-builder, never before: electron-builder rewrites the exe's resources at
 * the end of packaging and would throw this away.
 *
 *   node scripts/win-metadata.mjs release/win-unpacked/Lumen.exe
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';

const exePath = process.argv[2] ?? 'release/win-unpacked/Lumen.exe';
const icoPath = process.argv[3] ?? 'build/icon.ico';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version.split('.').map(Number);

const exe = NtExecutable.from(readFileSync(exePath));
const res = NtExecutableResource.from(exe);

const info = Resource.VersionInfo.fromEntries(res.entries);
if (info.length !== 1) throw new Error(`expected one version resource, found ${info.length}`);
const vi = info[0];
const langs = vi.getAllLanguagesForStringValues();
if (langs.length !== 1) throw new Error(`expected one language, found ${langs.length}`);
const lang = langs[0];

vi.setStringValues(lang, {
  // What Explorer's Properties dialog and Task Manager show.
  FileDescription: 'Lumen',
  ProductName: 'Lumen',
  InternalName: 'Lumen',
  OriginalFilename: 'Lumen.exe',
  CompanyName: pkg.author ?? 'Coki',
  LegalCopyright: pkg.build?.copyright ?? `Copyright © 2026 ${pkg.author ?? 'Coki'}`
});
vi.setFileVersion(version[0], version[1], version[2], 0, lang.lang);
vi.setProductVersion(version[0], version[1], version[2], 0, lang.lang);
vi.outputToResourceEntries(res.entries);

// Every size in the .ico, into the icon group the exe already has, so Windows picks the right one
// for the desktop, the taskbar and the little one in the title bar.
const groups = res.entries.filter((e) => e.type === 14);
if (!groups.length) throw new Error('no icon group in the exe');
const icons = Data.IconFile.from(readFileSync(icoPath)).icons.map((i) => i.data);
for (const g of groups) Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, icons);

res.outputResource(exe);
writeFileSync(exePath, Buffer.from(exe.generate()));

// Read it back from the file on disk, because "it did not throw" is not the same as "it is there".
const check = Resource.VersionInfo.fromEntries(NtExecutableResource.from(NtExecutable.from(readFileSync(exePath))).entries)[0];
const got = check.getStringValues(check.getAllLanguagesForStringValues()[0]);
console.log(`${exePath}: ${got.FileDescription} / ${got.ProductName} ${got.ProductVersion} / ${got.LegalCopyright} / ${icons.length} icon sizes`);
