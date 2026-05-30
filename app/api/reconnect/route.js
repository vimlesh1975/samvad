import { NextResponse } from 'next/server';
import { getSamvadWsClient } from '../../../lib/samvad-ws-client';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = getSamvadWsClient().reconnect();
  return NextResponse.json(result);
}
