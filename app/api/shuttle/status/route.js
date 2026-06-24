import { NextResponse } from 'next/server';
import { ensureShuttleProStarted } from '../../../../lib/shuttle-pro';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, shuttle: ensureShuttleProStarted() });
}
