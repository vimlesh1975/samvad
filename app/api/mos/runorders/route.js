import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';
import { assertNrcsDbConfig, getNrcsDbConfig, getNrcsMysqlConnectionConfig } from '../../../../lib/nrcs-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  let connection;

  try {
    const { searchParams } = new URL(request.url);
    const selectedDate = searchParams.get('date') || '';
    const dbConfig = assertNrcsDbConfig(getNrcsDbConfig());
    connection = await mysql.createConnection(getNrcsMysqlConnectionConfig(dbConfig));

    const useNewDatabase = dbConfig.newDatabase;
    const query = useNewDatabase
      ? `
        SELECT DISTINCT bulletinname AS title
        FROM bulletin
        WHERE bulletinname != ''
          AND bulletintype = 'News Bulletin'
          AND status = 1
        ORDER BY bulletinname ASC
      `
      : `
        SELECT DISTINCT title
        FROM newsid
        WHERE title != ''
        ORDER BY title ASC
      `;
    const [rows] = await connection.execute(query);
    const runorders = rows.map((row) => ({
      title: row.title,
    })).filter((runorder) => runorder.title);

    return NextResponse.json({
      ok: true,
      date: selectedDate,
      source: useNewDatabase ? 'bulletin' : 'newsid',
      count: runorders.length,
      runorders,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, runorders: [] },
      { status: 500 },
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
