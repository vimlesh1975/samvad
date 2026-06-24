import { NextResponse } from 'next/server';
import { getSamvadWsClient } from '../../../lib/samvad-ws-client';
import { ensureShuttleProStarted } from '../../../lib/shuttle-pro';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = getSamvadWsClient();
  const shuttle = ensureShuttleProStarted();
  return NextResponse.json({ ...client.getStatus(), shuttle });
}
