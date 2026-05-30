import { NextResponse } from 'next/server';
import { getSamvadWsClient } from '../../../lib/samvad-ws-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = getSamvadWsClient();
  return NextResponse.json(client.getMessages());
}
