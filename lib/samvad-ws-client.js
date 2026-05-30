import WebSocket from 'ws';
import { parseSamvadFrame } from './samvad-parser';

const clientVersion = 'runorder-content-v16';

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

    const stories = parseStoriesFromRunorderHtml(html);
    const storiesWithContent = await Promise.all(
      stories.map(async (story) => ({
        ...story,
        ...(await this.fetchStoryContent({ roID, storyID: story.storyID, userID })),
      })),
    );

    return {
      roID,
      roSlug,
      userID,
      stories: storiesWithContent,
    };
  }

  async fetchStoryContent({ roID, storyID, userID }) {
    const params = new URLSearchParams({
      userid: String(userID),
      roid: roID,
      storytext: 'true',
    });
    const url = `http://192.168.0.188:9000/${encodeURIComponent(storyID)}.txt?${params.toString()}`;

    try {
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        return { rawContent: '', content: '', htmlContent: '' };
      }

      const raw = await response.text();

      return {
        rawContent: raw,
        content: cleanStoryContent(raw),
        htmlContent: renderSmvdToHtml(raw),
      };
    } catch {
      return { rawContent: '', content: '', htmlContent: '' };
    }
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.ws?.close();
  }

  reconnect() {
    this.close();
    this.messages = [];
    this.state = 'idle';
    this.connect();

    return {
      ok: true,
      state: this.state,
      url: this.url,
    };
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

  async sendCurrentStoryContent({ html }) {
    if (typeof html !== 'string') {
      throw new Error('html must be a string');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const currentStory = await this.findCurrentStory();

    if (!currentStory) {
      throw new Error('No current story found');
    }

    const xml = buildStoryContentXml({
      roID: currentStory.roID,
      storyID: currentStory.storyID,
      storySlug: currentStory.storySlug,
      html,
    });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      roID: currentStory.roID,
      storyID: currentStory.storyID,
      storySlug: currentStory.storySlug,
      html,
      xml,
    };
  }

  async sendRunorderContent({ mode, html }) {
    if (!['blank', 'custom'].includes(mode)) {
      throw new Error('mode must be blank or custom');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const storiesResult = await this.getStories();

    if (!storiesResult.stories.length) {
      throw new Error('No stories found in current runorder');
    }

    const sent = [];

    for (const story of storiesResult.stories) {
      const storyHtml = mode === 'blank'
        ? '<p><font color="red">----</font></p>'
        : html
          .replaceAll('{{title}}', story.title)
          .replaceAll('{{storyID}}', story.storyID)
          .replaceAll('{{serial}}', story.serial);
      const xml = buildStoryContentXml({
        roID: storiesResult.roID,
        storyID: story.storyID,
        storySlug: story.title,
        html: storyHtml,
      });

      this.ws.send(xml);
      sent.push({
        storyID: story.storyID,
        storySlug: story.title,
      });
      await delay(75);
    }

    return {
      sentAt: new Date().toISOString(),
      roID: storiesResult.roID,
      mode,
      count: sent.length,
      sent,
    };
  }

  async findCurrentStory() {
    const latestStoryStatus = this.findLatestStoryStatus();

    if (!latestStoryStatus?.CurrentStoryId || !latestStoryStatus?.roID) {
      return undefined;
    }

    const storiesResult = await this.getStories();
    const story = storiesResult.stories.find(
      (item) => String(item.storyID) === String(latestStoryStatus.CurrentStoryId),
    );

    return {
      roID: latestStoryStatus.roID,
      storyID: latestStoryStatus.CurrentStoryId,
      storySlug: story?.title ?? '',
    };
  }

  findLatestStoryStatus() {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const body = this.messages[index]?.xml?.PCSyncPlay;

      if (body?.CurrentStoryId && body?.roID) {
        return body;
      }
    }

    return undefined;
  }

  sendColors({ bgColor, fgColor }) {
    if (!isHexColor(bgColor) || !isHexColor(fgColor)) {
      throw new Error('Colors must be hex values like #050505');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const latestSync = this.findLatestSync();

    if (!latestSync) {
      throw new Error('No Sync message received yet');
    }

    const sync = {
      PlayPause: latestSync.PlayPause ?? false,
      DummyPlay: latestSync.DummyPlay ?? false,
      Stop: latestSync.Stop ?? false,
      Mirror: latestSync.Mirror ?? false,
      Toggle: latestSync.Toggle ?? false,
      Blank: latestSync.Blank ?? false,
      ShowDateTime: latestSync.ShowDateTime ?? false,
      ShowTimer: latestSync.ShowTimer ?? false,
      ShowCountDownTimer: latestSync.ShowCountDownTimer ?? false,
      Finish: latestSync.Finish ?? false,
      Speed: latestSync.Speed ?? 3.8,
      FontSize: latestSync.FontSize ?? 80,
      AlternateColorStatus: latestSync.AlternateColorStatus ?? false,
      AllowDummyPlayDuringPlayingTime: latestSync.AllowDummyPlayDuringPlayingTime ?? false,
      BreakLineChar: latestSync.BreakLineChar ?? '@',
      BgColor: bgColor,
      FgColor: fgColor,
      EditorScroll: latestSync.EditorScroll ?? false,
    };
    const xml = buildSyncXml(sync);

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      bgColor,
      fgColor,
      xml,
    };
  }

  sendAlternateColor(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled must be boolean');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const xml = `<PCSyncPlay><AlternateColorsStatus><Alternate_color_Status>${enabled}</Alternate_color_Status></AlternateColorsStatus></PCSyncPlay>`;

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      enabled,
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

      if (parsed.xml?.PCSyncPlay?.AutoPageRefresh === true) {
        console.warn('Samvad requested page refresh; reconnecting WebSocket client');
        setTimeout(() => this.reconnect(), 100);
      }
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

function buildStoryContentXml({ roID, storyID, storySlug, html }) {
  const smvd = htmlToSmvd(html);
  return `<PCSyncPlay><roStorySend><roID>${escapeXmlValue(roID)}</roID><storyID>${escapeXmlValue(storyID)}</storyID><ReaderID /><storySlug>${escapeXmlValue(storySlug)}</storySlug><storyBody>${escapeXmlValue(smvd)}</storyBody><storyBodyType>html</storyBodyType></roStorySend></PCSyncPlay>`;
}

function buildSyncXml(sync) {
  const inner = Object.entries(sync)
    .map(([key, value]) => `<${key}>${escapeXmlValue(value)}</${key}>`)
    .join('');

  return `<PCSyncPlay><Sync>${inner}</Sync></PCSyncPlay>`;
}

function buildFontSizeXml({ roID, fontSize }) {
  return `<PCSyncPlay><FontSize><roID>${escapeXmlValue(roID)}</roID><FontSize>${escapeXmlValue(fontSize)}</FontSize></FontSize></PCSyncPlay>`;
}

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value));
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

function cleanStoryContent(value) {
  return value
    .replace(/\{\/formatting;[^}]*\}/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderSmvdToHtml(value) {
  const smvd = value
    .replace('{/formatting;Times New Roman;;red;Regular;}\n----', '')
    .replace('\n{/formatting;Times New Roman;;red;Regular;}----', '');
  const tokenRegex = /\{\/(formatting|bookmark|cloak);([^}]*)\}/g;
  let html = '';
  let cursor = 0;
  let match;

  while ((match = tokenRegex.exec(smvd)) !== null) {
    html += sanitizeStoryHtml(smvd.slice(cursor, match.index));

    const [, type, body] = match;
    const fields = body.split(';');
    const fontFamily = fields[0] || '';
    const bgColor = fields[1] || '';
    const fgColor = fields[2] || '';
    const textStyle = fields[3] || '';
    const nextIndex = tokenRegex.lastIndex;
    const nextToken = smvd.slice(nextIndex).search(tokenRegex);
    const endIndex = nextToken === -1 ? smvd.length : nextIndex + nextToken;
    const text = smvd.slice(nextIndex, endIndex);

    html += wrapFormattedText({
      type,
      fontFamily,
      bgColor,
      fgColor,
      textStyle,
      text,
    });

    cursor = endIndex;
    tokenRegex.lastIndex = endIndex;
  }

  html += sanitizeStoryHtml(smvd.slice(cursor));

  return html.trim();
}

function wrapFormattedText({ type, fontFamily, bgColor, fgColor, textStyle, text }) {
  const styles = ['font-size: 18px'];

  if (fontFamily) styles.push(`font-family: ${sanitizeCssValue(fontFamily)}`);
  if (isSafeColor(bgColor)) styles.push(`background-color: ${bgColor}`);
  if (isSafeColor(fgColor)) styles.push(`color: ${fgColor}`);

  let inner = sanitizeStoryHtml(text);

  if (textStyle.includes('Bold')) inner = `<b>${inner}</b>`;
  if (textStyle.includes('Italic')) inner = `<i>${inner}</i>`;
  if (textStyle.includes('Underline')) inner = `<u>${inner}</u>`;

  const id = type === 'bookmark' || type === 'cloak' ? ` id="${type}"` : '';
  return `<span${id} style="${styles.join('; ')}">${inner}</span>`;
}

function sanitizeStoryHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<(\/?)(?!br\b|p\b|div\b|span\b|font\b|b\b|i\b|u\b|strong\b|em\b)([^>]+)>/gi, '&lt;$1$2&gt;')
    .replace(/\r/g, '')
    .replace(/\n/g, '<br>');
}

function htmlToSmvd(value) {
  const html = String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<\/storyBody>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n');
  const parts = [];
  const spanRegex = /<(span|font)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let cursor = 0;
  let match;

  while ((match = spanRegex.exec(html)) !== null) {
    parts.push(formatPlainSmvd(html.slice(cursor, match.index)));
    parts.push(formatStyledSmvd(match[2], match[3]));
    cursor = match.index + match[0].length;
  }

  parts.push(formatPlainSmvd(html.slice(cursor)));

  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

function formatStyledSmvd(attributes, innerHtml) {
  const style = getAttribute(attributes, 'style');
  const colorAttr = getAttribute(attributes, 'color');
  const faceAttr = getAttribute(attributes, 'face');
  const color = colorAttr || getCssValue(style, 'color');
  const background = getCssValue(style, 'background-color') || getCssValue(style, 'background');
  const fontFamily = faceAttr || getCssValue(style, 'font-family');
  const text = stripHtmlToText(innerHtml);

  if (!text.trim()) {
    return '';
  }

  return `{/formatting;${fontFamily || ''};${background || ''};${color || ''};Regular;}${text}`;
}

function formatPlainSmvd(html) {
  const text = stripHtmlToText(html);

  if (!text.trim()) {
    return text;
  }

  return `{/formatting;;;;Regular;}${text}`;
}

function stripHtmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '');
}

function getAttribute(attributes, name) {
  const match = String(attributes).match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function getCssValue(style, name) {
  const entries = String(style)
    .split(';')
    .map((entry) => entry.split(':').map((part) => part.trim()));
  const match = entries.find(([key]) => key?.toLowerCase() === name.toLowerCase());
  return match?.[1] ?? '';
}

function sanitizeCssValue(value) {
  return String(value).replace(/["'<>]/g, '').trim();
}

function isSafeColor(value) {
  const color = String(value).trim();
  return /^#[0-9a-fA-F]{3,6}$/.test(color) || /^[a-zA-Z]+$/.test(color);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getSamvadWsClient() {
  if (
    !globalThis.samvadWsClient ||
    globalThis.samvadWsClient.version !== clientVersion ||
    typeof globalThis.samvadWsClient.sendSpeed !== 'function' ||
    typeof globalThis.samvadWsClient.sendControl !== 'function' ||
    typeof globalThis.samvadWsClient.sendFontSize !== 'function' ||
    typeof globalThis.samvadWsClient.sendStoryPlay !== 'function' ||
    typeof globalThis.samvadWsClient.sendCurrentStoryContent !== 'function' ||
    typeof globalThis.samvadWsClient.sendRunorderContent !== 'function' ||
    typeof globalThis.samvadWsClient.sendColors !== 'function' ||
    typeof globalThis.samvadWsClient.sendAlternateColor !== 'function' ||
    typeof globalThis.samvadWsClient.reconnect !== 'function' ||
    typeof globalThis.samvadWsClient.getStories !== 'function' ||
    typeof globalThis.samvadWsClient.fetchStoryContent !== 'function' ||
    globalThis.samvadWsClient.version !== clientVersion
  ) {
    globalThis.samvadWsClient?.close?.();
    globalThis.samvadWsClient = new SamvadWsClient();
  }

  return globalThis.samvadWsClient;
}
