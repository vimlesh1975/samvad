import WebSocket from 'ws';
import { parseSamvadFrame } from './samvad-parser';

const clientVersion = 'story-play-v7';

class SamvadWsClient {
  constructor() {
    this.version = clientVersion;
    this.url = process.env.SAMVAD_WS_URL ?? 'ws://192.168.0.188:9095';
    this.maxMessages = Number(process.env.MAX_MESSAGES ?? 100);
    this.messages = [];
    this.state = 'idle';
    this.lastError = undefined;
    this.ws = undefined;
    this.reconnectTimer = undefined;
    this.connect();
  }

  getStatus() {
    return {
      url: this.url,
      state: this.state,
      lastError: this.lastError,
      messageCount: this.messages.length,
      latestMessage: this.messages[this.messages.length - 1],
    };
  }

  getMessages() {
    return this.messages;
  }

  async getStories() {
    const roID = this.findLatestRoId();
    const roSlug = this.findLatestRoSlug();
    const userID = this.findLatestUserId() ?? 40;

    if (!roID) {
      return {
        roID,
        roSlug,
        userID,
        stories: [],
        error: 'No rundown id received yet',
      };
    }

    const params = new URLSearchParams({
      userid: String(userID),
      itemid: `r${roID}`,
      itemslug: roSlug ?? '',
      refresh: 'false',
    });
    const url = `http://192.168.0.188:9000/rowindow${encodeURIComponent(roID)}.html?${params.toString()}`;
    const response = await fetch(url, { cache: 'no-store' });
    const html = await response.text();

    if (!response.ok || html.includes('Could not open requested Runorder')) {
      return {
        roID,
        roSlug,
        userID,
        stories: [],
        error: 'Could not open requested Runorder',
      };
    }

    return {
      roID,
      roSlug,
      userID,
      stories: parseStoriesFromRunorderHtml(html),
    };
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.ws?.close();
  }

  sendSpeed(speed) {
    const numericSpeed = Number(speed);

    if (!Number.isFinite(numericSpeed) || numericSpeed < 0.159) {
      throw new Error('Speed must be a number greater than or equal to 0.159');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const roID = this.findLatestRoId();

    if (!roID) {
      throw new Error('No rundown id received yet');
    }

    const xml = buildSpeedXml({ roID, speed: numericSpeed });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      speed: numericSpeed,
      roID,
      xml,
    };
  }

  sendControl(command) {
    const allowedCommands = new Set(['Play', 'Pause', 'Skip', 'Previous']);

    if (!allowedCommands.has(command)) {
      throw new Error('Unsupported control command');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const roID = this.findLatestRoId();

    if (!roID) {
      throw new Error('No rundown id received yet');
    }

    const xml = buildControlXml({ roID, command });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      command,
      roID,
      xml,
    };
  }

  sendStoryPlay({ storyID, storySlug }) {
    if (!storyID) {
      throw new Error('Story id is required');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const roID = this.findLatestRoId();

    if (!roID) {
      throw new Error('No rundown id received yet');
    }

    const xml = buildStoryPlayXml({ roID, storyID, storySlug: storySlug ?? '' });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      roID,
      storyID,
      storySlug,
      xml,
    };
  }

  sendFontSize(fontSize) {
    const numericFontSize = Number(fontSize);

    if (!Number.isInteger(numericFontSize) || numericFontSize < 40 || numericFontSize > 500) {
      throw new Error('Font size must be an integer between 40 and 500');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const roID = this.findLatestRoId();

    if (!roID) {
      throw new Error('No rundown id received yet');
    }

    const xml = buildFontSizeXml({ roID, fontSize: numericFontSize });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      fontSize: numericFontSize,
      roID,
      xml,
    };
  }

  connect() {
    if (this.ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.ws.readyState)) {
      return;
    }

    this.state = 'connecting';
    this.lastError = undefined;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.state = 'open';
      console.log(`Connected to Samvad WebSocket: ${this.url}`);
    });

    ws.on('message', (data) => {
      const parsed = parseSamvadFrame(data);
      this.messages.push(parsed);

      if (this.messages.length > this.maxMessages) {
        this.messages.shift();
      }

      console.log(JSON.stringify(parsed, null, 2));
    });

    ws.on('error', (error) => {
      this.state = 'error';
      this.lastError = error.message;
      console.error(`Samvad WebSocket error: ${error.message}`);
    });

    ws.on('close', (code, reason) => {
      this.state = 'closed';
      console.warn(`Samvad WebSocket closed: ${code} ${reason.toString()}`);
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, 3000);
  }

  findLatestSync() {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const sync = this.messages[index]?.xml?.PCSyncPlay?.Sync;

      if (sync) {
        return sync;
      }
    }

    return undefined;
  }

  findLatestRoId() {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const body = this.messages[index]?.xml?.PCSyncPlay;
      const roID = body?.ReadyToPlay?.roID ?? body?.roID ?? body?.Speed?.roID;

      if (roID) {
        return roID;
      }
    }

    return undefined;
  }

  findLatestRoSlug() {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const body = this.messages[index]?.xml?.PCSyncPlay;
      const roSlug = body?.ReadyToPlay?.roSlug;

      if (roSlug) {
        return roSlug;
      }
    }

    return undefined;
  }

  findLatestUserId() {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const userID = this.messages[index]?.xml?.PCSyncPlay?.Login?.UserID;

      if (userID) {
        return userID;
      }
    }

    return undefined;
  }
}

function buildSpeedXml({ roID, speed }) {
  return `<PCSyncPlay><Speed><roID>${escapeXmlValue(roID)}</roID><CurrentSpeed>${escapeXmlValue(speed)}</CurrentSpeed><MaxSpeed>20</MaxSpeed></Speed></PCSyncPlay>`;
}

function buildControlXml({ roID, command }) {
  return `<PCSyncPlay><Control><roID>${escapeXmlValue(roID)}</roID><Status>${escapeXmlValue(command)}</Status></Control></PCSyncPlay>`;
}

function buildStoryPlayXml({ roID, storyID, storySlug }) {
  return `<PCSyncPlay><roCntrl><roID>${escapeXmlValue(roID)}</roID><element_target><storyID>${escapeXmlValue(storyID)}</storyID><storySlug>${escapeXmlValue(storySlug)}</storySlug><Block>false</Block></element_target><command>Play</command></roCntrl></PCSyncPlay>`;
}

function buildFontSizeXml({ roID, fontSize }) {
  return `<PCSyncPlay><FontSize><roID>${escapeXmlValue(roID)}</roID><FontSize>${escapeXmlValue(fontSize)}</FontSize></FontSize></PCSyncPlay>`;
}

function escapeXmlValue(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function parseStoriesFromRunorderHtml(html) {
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  return rowMatches
    .map((row) => {
      const cells = [...row.matchAll(/<td\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)]
        .reduce((record, match) => {
          record[match[1]] = cleanHtmlCell(match[2]);
          return record;
        }, {});

      if (!cells.story_id) {
        return undefined;
      }

      return {
        serial: cells.sno,
        blocked: /<input\b[^>]*checked/i.test(row),
        title: cells.story_title,
        storyID: cells.story_id,
      };
    })
    .filter(Boolean);
}

function cleanHtmlCell(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function getSamvadWsClient() {
  if (
    !globalThis.samvadWsClient ||
    globalThis.samvadWsClient.version !== clientVersion ||
    typeof globalThis.samvadWsClient.sendSpeed !== 'function' ||
    typeof globalThis.samvadWsClient.sendControl !== 'function' ||
    typeof globalThis.samvadWsClient.sendFontSize !== 'function' ||
    typeof globalThis.samvadWsClient.sendStoryPlay !== 'function' ||
    typeof globalThis.samvadWsClient.getStories !== 'function'
  ) {
    globalThis.samvadWsClient?.close?.();
    globalThis.samvadWsClient = new SamvadWsClient();
  }

  return globalThis.samvadWsClient;
}
