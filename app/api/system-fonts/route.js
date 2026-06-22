import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const windowsFontCommand = [
  'Add-Type -AssemblyName System.Drawing',
  '$collection = New-Object System.Drawing.Text.InstalledFontCollection',
  '@($collection.Families | ForEach-Object Name | Sort-Object -Unique) | ConvertTo-Json -Compress',
].join('; ');

export async function GET() {
  try {
    const fonts = process.platform === 'win32'
      ? await getWindowsFonts()
      : await getFontConfigFonts();

    return NextResponse.json({ ok: true, count: fonts.length, fonts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, fonts: [] },
      { status: 500 },
    );
  }
}

async function getWindowsFonts() {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', windowsFontCommand],
    { encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true },
  );
  const parsed = JSON.parse(stdout.trim() || '[]');
  return normalizeFonts(Array.isArray(parsed) ? parsed : [parsed]);
}

async function getFontConfigFonts() {
  const { stdout } = await execFileAsync('fc-list', [':', 'family'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return normalizeFonts(stdout.split(/[,\r\n]+/));
}

function normalizeFonts(fonts) {
  return [...new Set(fonts.map((font) => String(font).trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}
