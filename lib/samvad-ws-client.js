import WebSocket from 'ws';
import { parseSamvadFrame } from './samvad-parser';

const clientVersion = 'stable-tree-v26';

function getSamvadWsUrl() {
  if (process.env.SAMVAD_WS_URL) {
    return process.env.SAMVAD_WS_URL;
  }

  const host = process.env.SAMVAD_HOST;
  const port = process.env.SAMVAD_WS_PORT;

  if (host && port) {
    return `ws://${host}:${port}`;
  }

  throw new Error('Set SAMVAD_WS_URL or SAMVAD_HOST and SAMVAD_WS_PORT');
}

function getSamvadHttpBaseUrl() {
  if (process.env.SAMVAD_HTTP_URL) {
    return process.env.SAMVAD_HTTP_URL;
  }

  const host = process.env.SAMVAD_HOST;
  const port = process.env.SAMVAD_HTTP_PORT;

  if (host && port) {
    return `http://${host}:${port}`;
  }

  throw new Error('Set SAMVAD_HTTP_URL or SAMVAD_HOST and SAMVAD_HTTP_PORT');
}

function buildSamvadHttpUrl(baseUrl, pathname, params) {
  const url = new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.search = params.toString();
  return url.toString();
}

class SamvadWsClient {
  constructor() {
    this.version = clientVersion;
    this.url = getSamvadWsUrl();
    this.httpBaseUrl = getSamvadHttpBaseUrl();
    this.maxMessages = Number(process.env.MAX_MESSAGES ?? 100);
    this.messages = [];
    this.treeItems = createDefaultTreeItems();
    this.treeParents = new Map([['f1', '']]);
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
    const url = buildSamvadHttpUrl(this.httpBaseUrl, `rowindow${encodeURIComponent(roID)}.html`, params);
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

  async getFolders({ parentID = 'f1', parentSlug = '', refresh = true } = {}) {
    if (refresh) {
      this.openFolder({ folderID: parentID, folderSlug: parentSlug || (parentID === 'f1' ? 'root' : '') });
      await delay(400);
    }

    this.syncFolderDetail(parentID);
    const items = this.findKnownTreeItems();

    return {
      requestedParentID: parentID,
      folders: items.filter((item) => item.itemType === 'folder'),
      items,
    };
  }

  openFolder({ folderID = 'f1', folderSlug = 'root' } = {}) {
    const itemID = String(folderID ?? '').trim() || 'f1';
    const itemSlug = String(folderSlug ?? '').trim() || (itemID === 'f1' ? 'root' : '');

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const xml = buildItemOpenXml({
      itemID,
      itemSlug,
      expandAll: false,
    });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      itemID,
      itemSlug,
      xml,
    };
  }

  async fetchStoryContent({ roID, storyID, userID }) {
    const params = new URLSearchParams({
      userid: String(userID),
      roid: roID,
      storytext: 'true',
    });
    const url = buildSamvadHttpUrl(this.httpBaseUrl, `${encodeURIComponent(storyID)}.txt`, params);

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
    let numericSpeed = Number(speed);

    if (!Number.isFinite(numericSpeed) || numericSpeed < 0 || numericSpeed > 6) {
      throw new Error('Speed must be a number between 0 and 6');
    }

    if (numericSpeed < 0.159) {
      numericSpeed = 0.159;
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

  async showRunorder({ roID, roSlug }) {
    const itemID = String(roID ?? '').trim();
    const runorderID = normalizeRunorderId(itemID);
    const runorderSlug = String(roSlug ?? '').trim();
    const userID = this.findLatestUserId() ?? 40;

    if (!runorderID) {
      throw new Error('Runorder id is required');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const openResult = await this.openRunorderWindow({
      itemID,
      roID: runorderID,
      roSlug: runorderSlug,
      userID,
    });

    const xml = buildReadyToPlayXml({
      roID: runorderID,
    });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      itemID,
      roID: runorderID,
      roSlug: runorderSlug,
      userID,
      openUrl: openResult.url,
      openedStories: openResult.storyCount,
      xml,
    };
  }

  async openRunorderWindow({ itemID, roID, roSlug, userID }) {
    const normalizedItemID = itemID.startsWith('r') ? itemID : `r${roID}`;
    const params = new URLSearchParams({
      userid: String(userID),
      itemid: normalizedItemID,
      itemslug: roSlug,
      refresh: 'false',
    });
    const url = buildSamvadHttpUrl(this.httpBaseUrl, `rowindow${encodeURIComponent(roID)}.html`, params);
    const response = await fetch(url, { cache: 'no-store' });
    const html = await response.text();

    if (!response.ok || !html || html === '-1' || html.includes('Could not open requested Runorder')) {
      throw new Error(`Could not open requested Runorder: ${url}`);
    }

    return {
      url,
      storyCount: parseStoriesFromRunorderHtml(html).length,
    };
  }

  createRunorder({ name, parentID = 'f1' }) {
    return this.createItem({ itemType: 'runorder', name, parentID });
  }

  createFolder({ name, parentID = 'f1' }) {
    return this.createItem({ itemType: 'folder', name, parentID });
  }

  deleteItem({ itemID, itemSlug, itemType }) {
    const allowedTypes = new Set(['runorder', 'folder']);
    const sourceID = String(itemID ?? '').trim();
    const sourceSlug = String(itemSlug ?? '').trim();

    if (!allowedTypes.has(itemType)) {
      throw new Error('itemType must be folder or runorder');
    }

    if (!sourceID) {
      throw new Error('itemID is required');
    }

    if (sourceID === 'f1') {
      throw new Error('Root folder cannot be deleted');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const xml = buildItemDeleteXml({
      itemType,
      itemID: sourceID,
      itemSlug: sourceSlug,
    });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      itemType,
      itemID: sourceID,
      itemSlug: sourceSlug,
      xml,
    };
  }

  createItem({ itemType, name, parentID = 'f1' }) {
    const allowedTypes = new Set(['runorder', 'folder']);
    const itemName = String(name ?? '').trim();
    const folderID = String(parentID ?? '').trim() || 'f1';

    if (!allowedTypes.has(itemType)) {
      throw new Error('Unsupported item type');
    }

    if (!itemName) {
      throw new Error(`${itemType === 'folder' ? 'Folder' : 'Runorder'} name is required`);
    }

    if (itemName.length > 150) {
      throw new Error(`${itemType === 'folder' ? 'Folder' : 'Runorder'} name must be 150 characters or less`);
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const xml = buildItemCreateXml({
      itemType,
      itemSlug: itemName,
      parentID: folderID,
    });

    this.ws.send(xml);

    return {
      sentAt: new Date().toISOString(),
      itemType,
      itemSlug: itemName,
      parentID: folderID,
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
    if (!['blank', 'custom', 'lines'].includes(mode)) {
      throw new Error('mode must be blank, custom, or lines');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Samvad WebSocket is not open');
    }

    const storiesResult = await this.getStories();

    if (!storiesResult.stories.length) {
      throw new Error('No stories found in current runorder');
    }

    const storyLines = mode === 'lines' ? splitRunorderLines(html) : [];
    const sent = [];
    const skipped = [];

    for (const [index, story] of storiesResult.stories.entries()) {
      const storyHtml = buildRunorderStoryHtml({
        mode,
        template: html,
        story,
        line: storyLines[index],
      });

      if (storyHtml === undefined) {
        skipped.push({
          storyID: story.storyID,
          storySlug: story.title,
          reason: 'No matching line',
        });
        continue;
      }

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
      skippedCount: skipped.length,
      sent,
      skipped,
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

  findKnownFolders() {
    return this.findKnownTreeItems().filter((item) => item.itemType === 'folder');
  }

  findKnownTreeItems() {
    return [...this.treeItems.values()].sort((a, b) => {
      if (a.itemType !== b.itemType) {
        return a.itemType === 'folder' ? -1 : 1;
      }

      return a.itemSlug.localeCompare(b.itemSlug);
    });
  }

  syncFolderDetail(parentID) {
    const requestedParentID = String(parentID ?? 'f1').trim() || 'f1';
    const message = this.findLatestFolderDetailMessage(requestedParentID);
    const detail = message?.xml?.PCSyncPlay?.FolderDetail;

    if (!detail) {
      return;
    }

    const folderID = String(detail.FolderID ?? '').trim() || requestedParentID;
    const folderSlug = String(detail.FolderSlug ?? '').trim();
    const existingParent = this.treeItems.get(folderID);

    this.treeItems.set(folderID, {
      itemID: folderID,
      itemSlug: folderSlug || existingParent?.itemSlug || (folderID === 'f1' ? 'root' : folderID),
      itemType: 'folder',
      folderID,
      folderSlug: folderSlug || existingParent?.folderSlug || (folderID === 'f1' ? 'root' : folderID),
      parentID: folderID === 'f1' ? '' : this.treeParents.get(folderID) ?? existingParent?.parentID ?? '',
      source: 'FolderDetail',
    });

    for (const [itemID, item] of this.treeItems.entries()) {
      if (item.parentID === folderID) {
        this.treeItems.delete(itemID);
      }
    }

    for (const item of extractFoldersFromFolderDetail(detail, folderID, message.rawText)) {
      if (item.itemID === folderID) {
        continue;
      }

      this.treeParents.set(item.itemID, folderID);
      this.treeItems.set(item.itemID, item);
    }
  }

  findLatestFolderDetailMessage(parentID) {
    const requestedParentID = String(parentID ?? '').trim();

    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const detail = this.messages[index]?.xml?.PCSyncPlay?.FolderDetail;

      if (detail && String(detail.FolderID ?? '').trim() === requestedParentID) {
        return this.messages[index];
      }
    }

    return undefined;
  }
}

function createDefaultTreeItems() {
  return new Map([
    ['f1', {
      itemID: 'f1',
      itemSlug: 'root',
      itemType: 'folder',
      folderID: 'f1',
      folderSlug: 'root',
      parentID: '',
      source: 'default',
    }],
  ]);
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

function buildReadyToPlayXml({ roID }) {
  return `<PCSyncPlay><ReadyToPlay><roID>${escapeXmlValue(roID)}</roID></ReadyToPlay></PCSyncPlay>`;
}

function normalizeRunorderId(value) {
  const id = String(value ?? '').trim();
  return id.startsWith('r') && id.length > 1 ? id.slice(1) : id;
}

function buildItemCreateXml({ itemType, itemSlug, parentID }) {
  return `<PCSyncPlay><itemCreate><itemType>${escapeXmlValue(itemType)}</itemType><itemSlug>${escapeXmlValue(itemSlug)}</itemSlug><pID>${escapeXmlValue(parentID)}</pID></itemCreate></PCSyncPlay>`;
}

function buildItemOpenXml({ itemID, itemSlug, expandAll }) {
  return `<PCSyncPlay><itemOpen><itemID>${escapeXmlValue(itemID)}</itemID><itemSlug>${escapeXmlValue(itemSlug)}</itemSlug><ExpandAll>${expandAll ? 'true' : 'false'}</ExpandAll></itemOpen></PCSyncPlay>`;
}

function buildItemDeleteXml({ itemType, itemID, itemSlug }) {
  return `<PCSyncPlay><itemOperation><operation>Delete</operation><itemType>${escapeXmlValue(itemType)}</itemType><source><itemID>${escapeXmlValue(itemID)}</itemID><itemSlug>${escapeXmlValue(itemSlug)}</itemSlug></source><target><pID></pID></target></itemOperation></PCSyncPlay>`;
}

function buildStoryContentXml({ roID, storyID, storySlug, html }) {
  const smvd = htmlToSmvd(html);
  return `<PCSyncPlay><roStorySend><roID>${escapeXmlValue(roID)}</roID><storyID>${escapeXmlValue(storyID)}</storyID><ReaderID /><storySlug>${escapeXmlValue(storySlug)}</storySlug><storyBody>${escapeXmlValue(smvd)}</storyBody><storyBodyType>html</storyBodyType></roStorySend></PCSyncPlay>`;
}

function buildRunorderStoryHtml({ mode, template, story, line }) {
  if (mode === 'blank') {
    return '<p><font color="red">----</font></p>';
  }

  if (mode === 'lines') {
    if (line === undefined) {
      return undefined;
    }

    return `<p>${escapeHtmlText(line)}</p><p><font color="red">----</font></p>`;
  }

  return String(template ?? '')
    .replaceAll('{{title}}', story.title)
    .replaceAll('{{storyID}}', story.storyID)
    .replaceAll('{{serial}}', story.serial);
}

function splitRunorderLines(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeHtmlText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function extractFoldersFromFolderDetail(detail, parentID, rawText = '') {
  const rawFolders = extractItemsFromRawFolderDetail(rawText, parentID);

  if (rawFolders.length) {
    return rawFolders;
  }

  const items = collectLiNodes(detail.Children?.ul ?? detail.ul);

  return items
    .map((item) => {
      const id = String(item?.['@_id'] ?? item?.id ?? '').trim();

      const itemType = id.startsWith('f') ? 'folder' : id.startsWith('r') ? 'runorder' : '';

      if (!itemType) {
        return undefined;
      }

      return {
        itemID: id,
        itemSlug: extractLiText(item) || id,
        itemType,
        folderID: itemType === 'folder' ? id : undefined,
        folderSlug: itemType === 'folder' ? extractLiText(item) || id : undefined,
        parentID,
        source: 'FolderDetail',
      };
    })
    .filter(Boolean);
}

function extractItemsFromRawFolderDetail(rawText, parentID) {
  const items = [];
  const liRegex = /<li\b[^>]*\bid="([fr][^"]+)"[^>]*>([\s\S]*?)(?=<li\b|\<\/ul>)/gi;
  let match;

  while ((match = liRegex.exec(rawText)) !== null) {
    const [, itemID, innerHtml] = match;
    const itemType = itemID.startsWith('f') ? 'folder' : 'runorder';
    const itemSlug = extractFolderNameFromLiHtml(innerHtml) || itemID;

    items.push({
      itemID,
      itemSlug,
      itemType,
      folderID: itemType === 'folder' ? itemID : undefined,
      folderSlug: itemType === 'folder' ? itemSlug : undefined,
      parentID,
      source: 'FolderDetail',
    });
  }

  return items;
}

function extractFolderNameFromLiHtml(html) {
  const editableSpans = [...String(html).matchAll(/<span\b[^>]*contenteditable="false"[^>]*>([\s\S]*?)<\/span>/gi)];
  const candidate = editableSpans[0]?.[1] ?? '';

  return cleanHtmlCell(candidate);
}

function collectLiNodes(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectLiNodes);
  }

  if (typeof value !== 'object') {
    return [];
  }

  const current = value.li ? collectLiNodes(value.li) : [];
  const nested = Object.values(value).flatMap((entry) => {
    if (entry === value.li) {
      return [];
    }

    return collectLiNodes(entry);
  });

  return value['@_id'] ? [value, ...current, ...nested] : [...current, ...nested];
}

function extractLiText(item) {
  const textValues = [];
  collectTextValues(item, textValues);
  return textValues
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(open|rename|delete|create|move|copy)\b/gi, '')
    .trim();
}

function collectTextValues(value, output) {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    output.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectTextValues(entry, output));
    return;
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith('@_')) {
        continue;
      }

      collectTextValues(entry, output);
    }
  }
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
    typeof globalThis.samvadWsClient.showRunorder !== 'function' ||
    typeof globalThis.samvadWsClient.createRunorder !== 'function' ||
    typeof globalThis.samvadWsClient.createFolder !== 'function' ||
    typeof globalThis.samvadWsClient.deleteItem !== 'function' ||
    typeof globalThis.samvadWsClient.getFolders !== 'function' ||
    !globalThis.samvadWsClient.treeParents ||
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
