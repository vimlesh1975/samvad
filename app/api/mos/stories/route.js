import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';
import { stripHtml } from '../../../../lib/mos-common';
import { getNrcsMysqlConnectionConfig } from '../../../../lib/nrcs-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getStoryTitle(row, index) {
  if (row.SlugName) {
    return row.SlugName;
  }

  const plainText = stripHtml(row.Script || '').trim();
  const firstWords = plainText.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');

  return firstWords || `Story ${index + 1}`;
}

export async function GET(request) {
  let connection;

  try {
    const { searchParams } = new URL(request.url);
    const selectedDate = searchParams.get('date') || '';
    const selectedRunOrderTitle = searchParams.get('runorder') || '';

    if (!selectedDate || !selectedRunOrderTitle) {
      return NextResponse.json({
        ok: true,
        stories: [],
        count: 0,
      });
    }

    connection = await mysql.createConnection(getNrcsMysqlConnectionConfig());
    const [rows] = await connection.execute(
      `
        SELECT ScriptID, SlugName, Script, slno
        FROM script
        WHERE deleted = 0
          AND bulletinname = ?
          AND bulletindate = ?
        ORDER BY slno
      `,
      [selectedRunOrderTitle, selectedDate],
    );

    const stories = rows.map((row, index) => ({
      storyID: row.ScriptID || `STORY${index + 1}`,
      serial: index + 1,
      slno: row.slno,
      title: getStoryTitle(row, index),
      content: stripHtml(row.Script || '').trim(),
    }));

    return NextResponse.json({
      ok: true,
      date: selectedDate,
      runorder: selectedRunOrderTitle,
      count: stories.length,
      stories,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message, stories: [] },
      { status: 500 },
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
