import { NextResponse } from 'next/server';
import { getSamvadWsClient } from '../../../lib/samvad-ws-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getSamvadWsClient().getFolders({ refresh: true });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await getSamvadWsClient().getFolders({
      parentID: body.parentID,
      parentSlug: body.parentSlug,
      refresh: body.refresh !== false,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  }
}
