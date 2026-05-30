import { NextResponse } from 'next/server';
import { getSamvadWsClient } from '../../../lib/samvad-ws-client';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await getSamvadWsClient().sendCurrentStoryContent({
      html: body.html,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  }
}
