import { NextResponse } from 'next/server';
import { getSamvadWsClient } from '../../../lib/samvad-ws-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getSamvadWsClient().getStories();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { stories: [], error: error.message },
      { status: 500 },
    );
  }
}
