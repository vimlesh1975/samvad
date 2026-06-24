import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';
import { compressed, escapeXml, mosEnd, mosStart, stripHtml, toUTF16BE } from '../../../../lib/mos-common';
import { getMosTcpClient } from '../../../../lib/mos-tcp-client';
import { getNrcsMysqlConnectionConfig } from '../../../../lib/nrcs-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sendDelayMs = Number(process.env.SAMVAD_SEND_DELAY_MS || 150);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMosHeader(messageID) {
  const mosID = process.env.MOS_ID;
  const ncsID = process.env.MOS_DEVICE_ID;

  if (!mosID || !ncsID) {
    throw new Error('Set MOS_ID and MOS_DEVICE_ID in .env');
  }

  return `
<mosID>${escapeXml(mosID)}</mosID>
<ncsID>${escapeXml(ncsID)}</ncsID>
<messageID>${escapeXml(messageID)}</messageID>`;
}

async function writeMos(client, body, messageID) {
  const payload = toUTF16BE(compressed(mosStart + getMosHeader(messageID) + body + mosEnd));

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      client.off('drain', onDrain);
      reject(error);
    };
    const onDrain = () => {
      client.off('error', onError);
      resolve();
    };

    client.once('error', onError);

    const didFlush = client.write(payload, () => {
      client.off('error', onError);
      client.off('drain', onDrain);
      resolve();
    });

    if (!didFlush) {
      client.once('drain', onDrain);
    }
  });
}

export async function POST(request) {
  let connection;

  try {
    const {
      selectedDate,
      selectedRunOrderTitle,
      sendMode,
      currentStoryID,
      currentStoryNum,
    } = await request.json();

    if (!selectedDate || !selectedRunOrderTitle) {
      throw new Error('selectedDate and selectedRunOrderTitle are required');
    }

    connection = await mysql.createConnection(getNrcsMysqlConnectionConfig());
    const [rows] = await connection.execute(
      `
        SELECT *
        FROM script
        WHERE deleted = 0
          AND bulletinname = ?
          AND bulletindate = ?
        ORDER BY slno
      `,
      [selectedRunOrderTitle, selectedDate],
    );

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        message: 'No rows found.',
        sentCount: 0,
      });
    }

    const stories = rows.map((story, index) => ({
      story,
      storyNum: index + 1,
    }));
    const sendBelowCurrent = sendMode === 'belowCurrent';
    const currentStoryIndex = stories.findIndex(({ story, storyNum }) => {
      if (currentStoryNum && Number(storyNum) === Number(currentStoryNum)) {
        return true;
      }

      return currentStoryID && String(story.ScriptID) === String(currentStoryID);
    });
    const storiesToSend = sendBelowCurrent
      ? stories.filter((_, index) => index > currentStoryIndex)
      : stories;

    if (sendBelowCurrent && currentStoryIndex === -1) {
      return NextResponse.json({
        ok: true,
        message: 'Current story was not found in this run order. Nothing sent to Samvad.',
        sentCount: 0,
      });
    }

    if (!storiesToSend.length) {
      return NextResponse.json({
        ok: true,
        message: sendBelowCurrent
          ? 'No stories below the current Samvad story. Nothing sent.'
          : 'No stories to send.',
        sentCount: 0,
      });
    }

    const client = await getMosTcpClient();
    client.setNoDelay(true);

    const roID = `${process.env.MOS_DEVICE_ID}_RO`;
    const roSlug = `${selectedRunOrderTitle}_${selectedDate}`;
    const messagePrefix = Date.now();

    let roReplace = `
<roReplace>
  <roID>${escapeXml(roID)}</roID>
  <roSlug>${escapeXml(roSlug)}</roSlug>
  <roTrigger>MANUAL</roTrigger>
`;

    stories.forEach(({ story, storyNum }) => {
      const storyID = story.ScriptID || `STORY${storyNum}`;
      const storySlug = story.SlugName || `Story ${storyNum}`;
      roReplace += `
  <story>
    <storyID>${escapeXml(storyID)}</storyID>
    <storySlug>${escapeXml(storySlug)}</storySlug>
    <storyNum>${storyNum}</storyNum>
  </story>`;
    });

    roReplace += `
</roReplace>`;

    await writeMos(client, roReplace, `${messagePrefix}0`);
    await delay(sendDelayMs);

    for (let index = 0; index < storiesToSend.length; index += 1) {
      const { story, storyNum } = storiesToSend[index];
      const storyID = story.ScriptID || `STORY${storyNum}`;
      const storySlug = story.SlugName || `Story ${storyNum}`;
      const storyBody = stripHtml(story.Script);
      const roStorySend = `
<roStorySend>
  <roID>${escapeXml(roID)}</roID>
  <storyID>${escapeXml(storyID)}</storyID>
  <storySlug>${escapeXml(storySlug)}</storySlug>
  <storyNum>${storyNum}</storyNum>
  <storyBody>${escapeXml(storyBody)}</storyBody>
</roStorySend>`;

      await writeMos(client, roStorySend, `${messagePrefix}${index + 1}`);
      await delay(sendDelayMs);
    }

    return NextResponse.json({
      ok: true,
      message: sendBelowCurrent
        ? `Samvad updated: roReplace and ${storiesToSend.length} stories below current story sent for roID ${roSlug}`
        : `Samvad updated: roReplace and ${storiesToSend.length} roStorySend messages sent for roID ${roSlug}`,
      mode: sendBelowCurrent ? 'belowCurrent' : 'full',
      roID,
      roSlug,
      rowCount: rows.length,
      sentCount: storiesToSend.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
