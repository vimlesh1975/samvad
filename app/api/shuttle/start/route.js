import { NextResponse } from 'next/server';
import { getShuttleProController } from '../../../../lib/shuttle-pro';

export const dynamic = 'force-dynamic';

export async function POST() {
  const shuttle = getShuttleProController().start({ force: true });
  return NextResponse.json({ ok: !shuttle.lastError, shuttle });
}
