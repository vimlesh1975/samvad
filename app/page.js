'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const refreshMs = 2000;
const fallbackFonts = ['Arial', 'Times New Roman'];
const blankStoryHtml = '<p><font color="red">----</font></p>';
const defaultTestStoryHtml = '<p><span style="color:#00ff66;background-color:#000000;">CUSTOM HTML RENDER TEST</span></p><p>This line was sent from the Next.js controller.</p><p><font color="red">----</font></p>';

export default function Home() {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [storiesState, setStoriesState] = useState({ stories: [] });
  const [foldersState, setFoldersState] = useState({ folders: [] });
  const [error, setError] = useState('');
  const [speedInput, setSpeedInput] = useState('');
  const [fontSizeInput, setFontSizeInput] = useState('');
  const [fontFamilyInput, setFontFamilyInput] = useState('Arial');
  const [systemFonts, setSystemFonts] = useState(fallbackFonts);
  const [rtlInput, setRtlInput] = useState(false);
  const [bgColorInput, setBgColorInput] = useState('#050505');
  const [fgColorInput, setFgColorInput] = useState('#ffffff');
  const [alternateColorInput, setAlternateColorInput] = useState(false);
  const [customStoryHtml, setCustomStoryHtml] = useState(defaultTestStoryHtml);
  const [runorderLines, setRunorderLines] = useState('');
  const [newRunorderName, setNewRunorderName] = useState('');
  const [newRunorderParent, setNewRunorderParent] = useState('f1');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('f1');
  const [expandedItems, setExpandedItems] = useState({ f1: true });
  const [treeMenu, setTreeMenu] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const [pendingCreateName, setPendingCreateName] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [fontSizeStatus, setFontSizeStatus] = useState('');
  const [fontFamilyStatus, setFontFamilyStatus] = useState('');
  const [directionStatus, setDirectionStatus] = useState('');
  const [colorStatus, setColorStatus] = useState('');
  const [controlStatus, setControlStatus] = useState('');
  const [storyPlayStatus, setStoryPlayStatus] = useState('');
  const [storyContentStatus, setStoryContentStatus] = useState('');
  const [runorderContentStatus, setRunorderContentStatus] = useState('');
  const [runorderShowStatus, setRunorderShowStatus] = useState('');
  const [runorderCreateStatus, setRunorderCreateStatus] = useState('');
  const [folderCreateStatus, setFolderCreateStatus] = useState('');
  const speedTouched = useRef(false);
  const fontSizeTouched = useRef(false);
  const latest = status?.latestMessage;
  const summary = useMemo(() => {
    return buildSummary(messages);
  }, [messages]);
  const selectedSpeed = Number(speedInput);
  const selectedFontSize = Number(fontSizeInput);

  async function refresh() {
    try {
      const [statusResponse, messagesResponse] = await Promise.all([
        fetch('/api/status', { cache: 'no-store' }),
        fetch('/api/messages', { cache: 'no-store' }),
      ]);

      if (!statusResponse.ok || !messagesResponse.ok) {
        throw new Error('Failed to fetch inspector state');
      }

      setStatus(await statusResponse.json());
      setMessages(await messagesResponse.json());
      setError('');
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }

  async function reconnectSocket() {
    try {
      await fetch('/api/reconnect', { method: 'POST' });
      setError('');
      setTimeout(refresh, 1000);
    } catch (reconnectError) {
      setError(reconnectError.message);
    }
  }

  async function refreshFolders(parentID = 'f1', parentSlug = '') {
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentID, parentSlug }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to load folders');
      }

      setFoldersState(result);
    } catch (foldersError) {
      setFoldersState({ folders: [], error: foldersError.message });
    }
  }

  useEffect(() => {
    refresh();
    refreshFolders();
    loadSystemFonts();
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, []);

  async function loadSystemFonts() {
    try {
      const response = await fetch('/api/system-fonts', { cache: 'no-store' });
      const result = await response.json();

      if (!response.ok || !result.ok || !result.fonts?.length) {
        throw new Error(result.error ?? 'No system fonts found');
      }

      setSystemFonts(result.fonts);
      if (!result.fonts.includes(fontFamilyInput)) {
        setFontFamilyInput(result.fonts[0]);
      }
    } catch (fontError) {
      setFontFamilyStatus(fontError.message);
    }
  }

  useEffect(() => {
    if (!summary.story?.roID && !summary.readyToPlay?.roID) {
      return undefined;
    }

    async function refreshStories() {
      try {
        const response = await fetch('/api/stories', { cache: 'no-store' });
        const result = await response.json();
        setStoriesState(result);
      } catch (storiesError) {
        setStoriesState({ stories: [], error: storiesError.message });
      }
    }

    refreshStories();
    const timer = setInterval(refreshStories, 5000);
    return () => clearInterval(timer);
  }, [summary.story?.roID, summary.readyToPlay?.roID]);

  useEffect(() => {
    const currentSpeed = getCurrentSpeed(summary);

    if (currentSpeed !== undefined && speedInput === '') {
      setSpeedInput(String(Math.round(Number(currentSpeed) * 10) / 10));
    }
  }, [summary.sync?.Speed, summary.speed?.CurrentSpeed, summary.speed?.Speed, speedInput]);

  useEffect(() => {
    if (!speedTouched.current || speedInput === '' || status?.state !== 'open') {
      return undefined;
    }

    const timer = setTimeout(() => {
      sendSpeedValue(speedInput);
    }, 250);

    return () => clearTimeout(timer);
  }, [speedInput, status?.state]);

  useEffect(() => {
    const currentFontSize = getCurrentFontSize(summary);

    if (currentFontSize !== undefined && fontSizeInput === '') {
      setFontSizeInput(String(currentFontSize));
    }
  }, [summary.sync?.FontSize, summary.fontSize?.FontSize, fontSizeInput]);

  useEffect(() => {
    if (!fontSizeTouched.current || fontSizeInput === '' || status?.state !== 'open') {
      return undefined;
    }

    const timer = setTimeout(() => {
      sendFontSizeValue(fontSizeInput);
    }, 250);

    return () => clearTimeout(timer);
  }, [fontSizeInput, status?.state]);

  useEffect(() => {
    if (summary.sync?.BgColor && isHexColor(summary.sync.BgColor)) {
      setBgColorInput(summary.sync.BgColor);
    }

    if (summary.sync?.FgColor && isHexColor(summary.sync.FgColor)) {
      setFgColorInput(summary.sync.FgColor);
    }

    if (typeof summary.sync?.AlternateColorStatus === 'boolean') {
      setAlternateColorInput(summary.sync.AlternateColorStatus);
    }
  }, [summary.sync?.BgColor, summary.sync?.FgColor]);

  async function sendSpeedValue(speed) {
    setSendStatus('Sending...');

    try {
      const response = await fetch('/api/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: Number(speed) }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to send speed');
      }

      setSendStatus(`Live speed ${result.speed}`);
      setTimeout(refresh, 800);
      return true;
    } catch (sendError) {
      setSendStatus(sendError.message);
      return false;
    }
  }

  async function sendSpeedPreset(speed) {
    speedTouched.current = false;
    setSpeedInput(String(speed));
    const sent = await sendSpeedValue(speed);

    if (sent) {
      sendControl('Play');
    }
  }

  function getActiveSpeedValue() {
    const activeSpeed = Number(speedInput || getCurrentSpeed(summary) || 0);
    return Number.isFinite(activeSpeed) ? activeSpeed : 0;
  }

  function stepSpeed(direction) {
    const nextSpeed = clampSpeed(roundToSpeedStep(getActiveSpeedValue() + direction * 0.25));
    sendSpeedPreset(nextSpeed);
  }

  function handleSpeedWheel(event) {
    event.preventDefault();
    stepSpeed(event.deltaY < 0 ? 1 : -1);
  }

  function handleSpeedContextMenu(event) {
    event.preventDefault();
    togglePlayPause();
  }

  async function sendFontSizeValue(fontSize) {
    setFontSizeStatus('Sending...');

    try {
      const response = await fetch('/api/font-size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontSize: Number(fontSize) }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to send font size');
      }

      setFontSizeStatus(`Live font size ${result.fontSize}`);
      setTimeout(refresh, 800);
    } catch (fontSizeError) {
      setFontSizeStatus(fontSizeError.message);
    }
  }

  async function sendRunorderFontFamily(fontFamily) {
    setFontFamilyInput(fontFamily);
    setFontFamilyStatus('Updating whole runorder...');

    try {
      const response = await fetch('/api/font-family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontFamily }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to apply font family');
      }

      setFontFamilyStatus(`${result.fontFamily}: ${result.count} stories updated`);
      setTimeout(refresh, 800);
    } catch (fontFamilyError) {
      setFontFamilyStatus(fontFamilyError.message);
    }
  }

  async function sendRunorderDirection(rtl) {
    setRtlInput(rtl);
    setDirectionStatus(`Applying ${rtl ? 'right to left' : 'left to right'}...`);

    try {
      const response = await fetch('/api/text-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtl }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to apply text direction');
      }

      setDirectionStatus(`${result.direction.toUpperCase()}: ${result.count} stories updated`);
      setTimeout(refresh, 800);
    } catch (directionError) {
      setDirectionStatus(directionError.message);
    }
  }

  async function sendColors() {
    setColorStatus('Sending test Sync...');

    try {
      const response = await fetch('/api/colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bgColor: bgColorInput,
          fgColor: fgColorInput,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to send colors');
      }

      setColorStatus(`Sent ${result.fgColor} on ${result.bgColor}`);
      setTimeout(refresh, 800);
    } catch (colorError) {
      setColorStatus(colorError.message);
    }
  }

  async function sendAlternateColor(enabled) {
    setColorStatus('Sending alternate color...');

    try {
      const response = await fetch('/api/alternate-color', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to send alternate color');
      }

      setAlternateColorInput(result.enabled);
      setColorStatus(`Alternate color ${result.enabled ? 'on' : 'off'}`);
      setTimeout(refresh, 800);
    } catch (colorError) {
      setColorStatus(colorError.message);
    }
  }

  async function sendControl(command) {
    setControlStatus(`Sending ${command}...`);

    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? `Failed to send ${command}`);
      }

      setControlStatus(`Sent ${result.command}`);
      setTimeout(refresh, 800);
    } catch (controlError) {
      setControlStatus(controlError.message);
    }
  }

  function togglePlayPause() {
    sendControl(summary.sync?.PlayPause ? 'Pause' : 'Play');
  }

  async function playStory(story) {
    setStoryPlayStatus(`Loading ${story.title}...`);

    try {
      const response = await fetch('/api/story-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyID: story.storyID,
          storySlug: story.title,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to set current story');
      }

      setStoryPlayStatus(`Sent ${story.title}`);
      setTimeout(refresh, 800);
    } catch (storyError) {
      setStoryPlayStatus(storyError.message);
    }
  }

  async function sendStoryContent(html, label) {
    setStoryContentStatus(`Sending ${label}...`);

    try {
      const response = await fetch('/api/story-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? `Failed to send ${label}`);
      }

      setStoryContentStatus(`Sent ${label} to story ${result.storyID}`);
      setTimeout(refresh, 800);
    } catch (storyContentError) {
      setStoryContentStatus(storyContentError.message);
    }
  }

  async function sendRunorderContent(mode) {
    setRunorderContentStatus(`Sending ${mode} to runorder...`);

    try {
      const response = await fetch('/api/runorder-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          html: runorderLines,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? `Failed to send ${mode} runorder`);
      }

      if (result.replaced) {
        setRunorderContentStatus(`Replaced runorder: deleted ${result.deletedCount}, added ${result.count}`);
      } else {
        const skipped = result.skippedCount ? `, skipped ${result.skippedCount}` : '';
        setRunorderContentStatus(`Sent ${result.mode} to ${result.count} stories${skipped}`);
      }
      setTimeout(refresh, 1200);
    } catch (runorderError) {
      setRunorderContentStatus(runorderError.message);
    }
  }

  async function loadRunorderLinesFile(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setRunorderContentStatus(`Loaded ${file.name}`);
    setRunorderLines(await file.text());
  }

  async function createRunorder() {
    const name = newRunorderName.trim();

    if (!name) {
      setRunorderCreateStatus('Enter a runorder name');
      return;
    }

    setRunorderCreateStatus(`Creating ${name}...`);

    try {
      const response = await fetch('/api/runorder-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentID: newRunorderParent.trim() || 'f1',
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to create runorder');
      }

      setRunorderCreateStatus(`Created ${result.itemSlug} in ${result.parentID}`);
      setNewRunorderName('');
      setTimeout(() => refreshFolders(result.parentID), 700);
      setTimeout(refresh, 1200);
    } catch (createError) {
      setRunorderCreateStatus(createError.message);
    }
  }

  async function createFolder() {
    const name = newFolderName.trim();

    if (!name) {
      setFolderCreateStatus('Enter a folder name');
      return;
    }

    setFolderCreateStatus(`Creating ${name}...`);

    try {
      const response = await fetch('/api/folder-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentID: newFolderParent.trim() || 'f1',
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to create folder');
      }

      setFolderCreateStatus(`Created ${result.itemSlug} in ${result.parentID}`);
      setNewFolderName('');
      setTimeout(() => refreshFolders(result.parentID), 700);
      setTimeout(refresh, 1200);
    } catch (createError) {
      setFolderCreateStatus(createError.message);
    }
  }

  async function expandTreeFolder(item) {
    setTreeMenu(null);
    setExpandedItems((current) => ({
      ...current,
      [item.itemID]: !current[item.itemID],
    }));

    if (!expandedItems[item.itemID]) {
      await refreshFolders(item.itemID, item.itemSlug);
    }
  }

  function prepareCreateFromTree(kind, item) {
    const folderID = item.itemType === 'folder' ? item.itemID : item.parentID || 'f1';
    const folderName = item.itemType === 'folder' ? item.itemSlug : 'parent folder';
    setPendingCreate({ kind, parentID: folderID, parentSlug: folderName });
    setPendingCreateName('');
    setTreeMenu(null);
  }

  async function submitPendingCreate() {
    if (!pendingCreate || !pendingCreateName.trim()) {
      return;
    }

    const kind = pendingCreate.kind;
    const label = kind === 'folder' ? 'folder' : 'runorder';

    try {
      const response = await fetch(kind === 'folder' ? '/api/folder-create' : '/api/runorder-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pendingCreateName.trim(),
          parentID: pendingCreate.parentID,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? `Failed to create ${label}`);
      }

      const message = `Created ${result.itemSlug} in ${result.parentID}`;

      if (kind === 'folder') {
        setFolderCreateStatus(message);
      } else {
        setRunorderCreateStatus(message);
      }

      setPendingCreate(null);
      setPendingCreateName('');
      setTimeout(() => refreshFolders(result.parentID), 700);
    } catch (createError) {
      if (kind === 'folder') {
        setFolderCreateStatus(createError.message);
      } else {
        setRunorderCreateStatus(createError.message);
      }
    }
  }

  async function deleteTreeItem(item) {
    setTreeMenu(null);

    if (item.itemID === 'f1') {
      setFolderCreateStatus('Root folder cannot be deleted');
      return;
    }

    const confirmed = window.confirm(`Delete ${item.itemType} "${item.itemSlug}"?`);

    if (!confirmed) {
      return;
    }

    setFolderCreateStatus(`Deleting ${item.itemSlug}...`);

    try {
      const response = await fetch('/api/item-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemID: item.itemID,
          itemSlug: item.itemSlug,
          itemType: item.itemType,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to delete item');
      }

      setFolderCreateStatus(`Delete sent for ${result.itemSlug}`);
      setTimeout(() => refreshFolders(item.parentID || 'f1'), 700);
    } catch (deleteError) {
      setFolderCreateStatus(deleteError.message);
    }
  }

  async function showRunorderOnTeleprompter(item) {
    if (item.itemType !== 'runorder') {
      await expandTreeFolder(item);
      return;
    }

    setRunorderShowStatus(`Sending ready for ${item.itemSlug}...`);

    try {
      const response = await fetch('/api/runorder-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roID: item.itemID,
          roSlug: item.itemSlug,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to load runorder');
      }

      const storyCount = Number.isFinite(result.openedStories) ? ` (${result.openedStories} stories)` : '';
      setRunorderShowStatus(`Ready ${result.roSlug || result.roID}${storyCount}`);
      setTimeout(refresh, 1200);
    } catch (showError) {
      setRunorderShowStatus(showError.message);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div className="header-title">
          <span>Samvad Teleprompter</span>
          <span>WebSocket Inspector</span>
        </div>
        <div className={`status-pill ${status?.state === 'open' ? 'open' : ''}`}>
          <span />
          {status?.state ?? 'loading'}
        </div>
        <button onClick={reconnectSocket} type="button">Reconnect</button>
      </section>

      <RundownWorkspace
        deleteTreeItem={deleteTreeItem}
        expandedItems={expandedItems}
        expandTreeFolder={expandTreeFolder}
        folderCreateStatus={folderCreateStatus}
        foldersState={foldersState}
        fontFamilyInput={fontFamilyInput}
        pendingCreate={pendingCreate}
        pendingCreateName={pendingCreateName}
        playStory={playStory}
        prepareCreateFromTree={prepareCreateFromTree}
        refreshFolders={refreshFolders}
        rtlInput={rtlInput}
        runorderCreateStatus={runorderCreateStatus}
        runorderShowStatus={runorderShowStatus}
        setPendingCreate={setPendingCreate}
        setPendingCreateName={setPendingCreateName}
        setTreeMenu={setTreeMenu}
        showRunorderOnTeleprompter={showRunorderOnTeleprompter}
        status={status}
        storiesState={storiesState}
        storyPlayStatus={storyPlayStatus}
        submitPendingCreate={submitPendingCreate}
        summary={summary}
        treeMenu={treeMenu}
      />

      <section className="grid two top-control-grid">
        <section className="panel">
          <div
            className="tele-speed-panel"
            onContextMenu={handleSpeedContextMenu}
            onWheel={handleSpeedWheel}
          >
            <div className="speed-button-row">
              <button disabled={status?.state !== 'open'} onClick={() => sendSpeedPreset(1)} type="button">Start with Speed 1</button>
              {[1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4, 5, 6].map((speed) => (
                <button disabled={status?.state !== 'open'} key={speed} onClick={() => sendSpeedPreset(speed)} type="button">
                  {speed}
                </button>
              ))}
              <button disabled={status?.state !== 'open'} onClick={() => stepSpeed(1)} type="button">++ .25</button>
              <button disabled={status?.state !== 'open'} onClick={togglePlayPause} type="button">
                {summary.sync?.PlayPause ? 'Pause' : 'Resume'}
              </button>
              {[-0.25, -0.5, -0.75, -1, -1.25, -1.5, -1.75, -2, -2.25, -2.5].map((speed) => (
                <button disabled={status?.state !== 'open'} key={speed} onClick={() => sendSpeedPreset(speed)} type="button">
                  {speed}
                </button>
              ))}
              <button disabled={status?.state !== 'open'} onClick={() => stepSpeed(-1)} type="button">-- .25</button>
            </div>
            <div className="tele-speed-slider">
              <span>Speed: {Number.isFinite(selectedSpeed) ? selectedSpeed : getCurrentSpeed(summary) ?? 0}</span>
              <input
                aria-label="Speed value"
                max="6"
                min="-2.5"
                step="0.25"
                type="range"
                value={speedInput || '0'}
                onChange={(event) => {
                  speedTouched.current = true;
                  setSpeedInput(event.target.value);
                }}
              />
            </div>
            <div className="tele-speed-hint">Right Click to Pause and Resume, Mouse Wheel for speed</div>
            {sendStatus ? <span className="send-status">{sendStatus}</span> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Font Size &amp; Family</h2>
            <span className="muted">Current font size: {getCurrentFontSize(summary) ?? 'Waiting'}</span>
          </div>
          <div className="speed-form">
            <div className="speed-slider">
              <input
                aria-label="Font size value"
                max="500"
                min="40"
                step="1"
                type="range"
                value={fontSizeInput || '80'}
                onChange={(event) => {
                  fontSizeTouched.current = true;
                  setFontSizeInput(event.target.value);
                }}
              />
              <output>{Number.isFinite(selectedFontSize) ? selectedFontSize : 80}</output>
            </div>
            <label className="font-family-field">
              <span>Whole runorder font ({systemFonts.length} installed)</span>
              <select
                disabled={status?.state !== 'open'}
                value={fontFamilyInput}
                onChange={(event) => sendRunorderFontFamily(event.target.value)}
              >
                {systemFonts.map((font) => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
            <label className="rtl-field">
              <input
                checked={rtlInput}
                disabled={status?.state !== 'open'}
                type="checkbox"
                onChange={(event) => sendRunorderDirection(event.target.checked)}
              />
              <span>Urdu RTL</span>
            </label>
            {fontSizeStatus ? <span className="send-status">{fontSizeStatus}</span> : null}
            {fontFamilyStatus ? <span className="send-status">{fontFamilyStatus}</span> : null}
            {directionStatus ? <span className="send-status">{directionStatus}</span> : null}
          </div>
        </section>
      </section>

      {error ? <div className="alert">{error}</div> : null}

      <section className="grid metrics">
        <Metric label="Socket" value={status?.url ?? 'Waiting'} />
        <Metric label="Frames Received" value={status?.messageCount ?? 0} />
        <Metric label="Latest Event" value={latest?.xmlShape?.event ?? 'Waiting'} />
        <Metric label="Last Update" value={latest ? new Date(latest.receivedAt).toString() : 'Waiting'} />
      </section>

      <section className="panel hero-panel">
        <div>
          <p className="eyebrow">Current Rundown</p>
          <h2>{summary.readyToPlay?.roSlug ?? 'Waiting for rundown'}</h2>
          <p className="muted">{summary.readyToPlay?.roID ?? 'No rundown id received yet'}</p>
        </div>
        <button onClick={refresh} type="button">Refresh</button>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-heading">
            <h2>Teleprompter State</h2>
          </div>
          <div className="summary-grid">
            <Info label="Playing" value={formatBool(summary.sync?.PlayPause)} />
            <Info label="Stopped" value={formatBool(summary.sync?.Stop)} />
            <Info label="Finished" value={formatBool(summary.sync?.Finish)} />
            <Info label="Mirror" value={formatBool(summary.sync?.Mirror)} />
            <Info label="Blank" value={formatBool(summary.sync?.Blank)} />
            <Info label="Speed" value={getCurrentSpeed(summary) ?? 'Waiting'} />
            <Info label="Font Size" value={getCurrentFontSize(summary) ?? 'Waiting'} />
            <Info label="Colors" value={summary.sync ? `${summary.sync.FgColor} on ${summary.sync.BgColor}` : 'Waiting'} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Story</h2>
          </div>
          <div className="summary-grid">
            <Info label="Message ID" value={summary.story?.messageID ?? 'Waiting'} />
            <Info label="Current Story ID" value={summary.story?.CurrentStoryId ?? 'Waiting'} />
            <Info label="Story Rundown" value={summary.story?.roID ?? 'Waiting'} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Colors</h2>
          <span className="muted">Experimental Sync color test</span>
        </div>
        <div className="color-form">
          <label className="toggle-label">
            <input
              checked={alternateColorInput}
              disabled={status?.state !== 'open'}
              type="checkbox"
              onChange={(event) => sendAlternateColor(event.target.checked)}
            />
            <span>Alternate Color</span>
          </label>
          <label>
            <span>Background</span>
            <input
              aria-label="Background color"
              type="color"
              value={bgColorInput}
              onChange={(event) => setBgColorInput(event.target.value)}
            />
          </label>
          <label>
            <span>Font</span>
            <input
              aria-label="Font color"
              type="color"
              value={fgColorInput}
              onChange={(event) => setFgColorInput(event.target.value)}
            />
          </label>
          <button disabled={status?.state !== 'open'} onClick={sendColors} type="button">
            Try Colors
          </button>
          {colorStatus ? <span className="send-status">{colorStatus}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Playback</h2>
          <span className="muted">Current state: {summary.sync?.PlayPause ? 'Playing' : 'Paused or stopped'}</span>
        </div>
        <div className="control-row">
          <button disabled={status?.state !== 'open'} onClick={togglePlayPause} type="button">
            {summary.sync?.PlayPause ? 'Pause' : 'Play'}
          </button>
          <button disabled={status?.state !== 'open'} onClick={() => sendControl('Previous')} type="button">
            Previous Story
          </button>
          <button disabled={status?.state !== 'open'} onClick={() => sendControl('Skip')} type="button">
            Next Story
          </button>
          {controlStatus ? <span className="send-status">{controlStatus}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Renderer Test</h2>
          <span className="muted">Converts HTML input to Samvad story format</span>
        </div>
        <div className="renderer-actions">
          <button disabled={status?.state !== 'open'} onClick={() => sendStoryContent(blankStoryHtml, 'blank renderer')} type="button">
            Blank Renderer
          </button>
          <button disabled={status?.state !== 'open'} onClick={() => sendStoryContent(customStoryHtml, 'custom content')} type="button">
            Send Custom Content
          </button>
          {storyContentStatus ? <span className="send-status">{storyContentStatus}</span> : null}
        </div>
        <textarea
          aria-label="Custom story HTML"
          className="custom-html"
          value={customStoryHtml}
          onChange={(event) => setCustomStoryHtml(event.target.value)}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Runorder Content</h2>
          <span className="muted">Sends content to every story in the current runorder</span>
        </div>
        <div className="renderer-actions">
          <label className="file-button">
            <span>Load Text File</span>
            <input accept=".txt,text/plain" onChange={loadRunorderLinesFile} type="file" />
          </label>
          <button disabled={status?.state !== 'open' || !runorderLines.trim()} onClick={() => sendRunorderContent('lines')} type="button">
            Send Lines To Runorder
          </button>
          {runorderContentStatus ? <span className="send-status">{runorderContentStatus}</span> : null}
        </div>
        <label className="field-label" htmlFor="runorder-lines">One story per line</label>
        <textarea
          aria-label="Runorder lines"
          className="custom-html runorder-lines"
          id="runorder-lines"
          placeholder="Paste scripts here: line 1 goes to story 1, line 2 goes to story 2..."
          value={runorderLines}
          onChange={(event) => setRunorderLines(event.target.value)}
        />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-heading">
            <h2>Connectivity</h2>
          </div>
          <div className="summary-grid">
            <Info label="Samvad" value={formatBool(summary.samvadConnectivity?.Status)} />
            <Info label="iNews" value={formatBool(summary.inewsConnectivity?.Status)} tone={summary.inewsConnectivity?.Status === false ? 'bad' : ''} />
            <Info label="iNews Activated" value={formatBool(summary.inewsConnectivity?.Activated)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Latest Error</h2>
          </div>
          {summary.errorLog ? (
            <div className="error-box">
              <strong>{summary.errorLog.ErrorMsg}</strong>
              <span>{summary.errorLog.DateTime} · Severity {summary.errorLog.Severity}</span>
            </div>
          ) : (
            <p className="muted">No error received.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function Info({ label, value, tone = '' }) {
  return (
    <div className={`info ${tone}`}>
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function RundownWorkspace({
  deleteTreeItem,
  expandedItems,
  expandTreeFolder,
  folderCreateStatus,
  foldersState,
  fontFamilyInput,
  pendingCreate,
  pendingCreateName,
  playStory,
  prepareCreateFromTree,
  refreshFolders,
  rtlInput,
  runorderCreateStatus,
  runorderShowStatus,
  setPendingCreate,
  setPendingCreateName,
  setTreeMenu,
  showRunorderOnTeleprompter,
  status,
  storiesState,
  storyPlayStatus,
  submitPendingCreate,
  summary,
  treeMenu,
}) {
  const [selectedStoryID, setSelectedStoryID] = useState('');
  const [keyboardStoryNumber, setKeyboardStoryNumber] = useState('');
  const storyNumberBuffer = useRef('');
  const storyNumberTimer = useRef(undefined);
  const storyButtonRefs = useRef(new Map());
  const selectedStory = storiesState.stories?.find((story) => String(story.storyID) === String(selectedStoryID));

  function selectAndPlayStory(story) {
    if (!story) {
      return;
    }

    setSelectedStoryID(String(story.storyID));
    storyButtonRefs.current.get(String(story.storyID))?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    playStory(story);
  }

  function moveStory(offset) {
    const stories = storiesState.stories ?? [];
    const activeID = selectedStoryID || summary.story?.CurrentStoryId;
    const activeIndex = stories.findIndex((story) => String(story.storyID) === String(activeID));
    const targetIndex = activeIndex === -1
      ? offset > 0 ? 0 : stories.length - 1
      : activeIndex + offset;

    if (targetIndex >= 0 && targetIndex < stories.length) {
      selectAndPlayStory(stories[targetIndex]);
    }
  }

  useEffect(() => {
    if (selectedStoryID && !selectedStory) {
      setSelectedStoryID('');
    }
  }, [selectedStoryID, selectedStory]);

  useEffect(() => {
    const currentStoryID = summary.story?.CurrentStoryId;

    if (!currentStoryID || !storiesState.stories?.length) {
      return;
    }

    const currentStory = storiesState.stories.find((story) => String(story.storyID) === String(currentStoryID));

    if (currentStory) {
      setSelectedStoryID(String(currentStory.storyID));
    }
  }, [summary.story?.CurrentStoryId, storiesState.stories]);

  useEffect(() => {
    function clearStoryNumber() {
      storyNumberBuffer.current = '';
      setKeyboardStoryNumber('');
      clearTimeout(storyNumberTimer.current);
    }

    function handleStoryNumberKey(event) {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      if (/^\d$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        storyNumberBuffer.current += event.key;
        setKeyboardStoryNumber(storyNumberBuffer.current);
        clearTimeout(storyNumberTimer.current);
        storyNumberTimer.current = setTimeout(clearStoryNumber, 3000);
        return;
      }

      if (event.key === 'Backspace' && storyNumberBuffer.current) {
        event.preventDefault();
        storyNumberBuffer.current = storyNumberBuffer.current.slice(0, -1);
        setKeyboardStoryNumber(storyNumberBuffer.current);
        return;
      }

      if (event.key === 'Escape' && storyNumberBuffer.current) {
        clearStoryNumber();
        return;
      }

      if (event.key !== 'Enter' || !storyNumberBuffer.current) {
        return;
      }

      event.preventDefault();
      const requestedNumber = Number(storyNumberBuffer.current);
      const story = storiesState.stories?.find(
        (item, index) => Number(item.serial ?? index + 1) === requestedNumber,
      );
      clearStoryNumber();

      if (!story) {
        return;
      }

      selectAndPlayStory(story);
    }

    window.addEventListener('keydown', handleStoryNumberKey);
    return () => {
      window.removeEventListener('keydown', handleStoryNumberKey);
      clearTimeout(storyNumberTimer.current);
    };
  }, [playStory, storiesState.stories]);

  return (
    <section className="rundown-workspace">
      <div className="panel rundown-column">
        <div className="panel-heading">
          <h2>Tree</h2>
          <button disabled={status?.state !== 'open'} onClick={() => refreshFolders('f1')} type="button">
            Refresh Tree
          </button>
        </div>
        <div className="tree-view workspace-tree" onClick={() => setTreeMenu(null)}>
          {foldersState.items?.length ? (
            <TreeBranch
              expandedItems={expandedItems}
              items={foldersState.items}
              parentID=""
              onContextMenu={(event, item) => {
                event.preventDefault();
                event.stopPropagation();
                setTreeMenu({
                  item,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onExpand={expandTreeFolder}
              onShow={showRunorderOnTeleprompter}
            />
          ) : (
            <p className="muted">{foldersState.error ?? 'No tree loaded'}</p>
          )}
          {treeMenu ? (
            <div
              className="tree-menu"
              style={{ left: treeMenu.x, top: treeMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button onClick={() => prepareCreateFromTree('folder', treeMenu.item)} type="button">
                New Folder Here
              </button>
              <button onClick={() => prepareCreateFromTree('runorder', treeMenu.item)} type="button">
                New Runorder Here
              </button>
              <button disabled={treeMenu.item.itemType !== 'runorder'} onClick={() => showRunorderOnTeleprompter(treeMenu.item)} type="button">
                Load On Teleprompter
              </button>
              <button disabled={treeMenu.item.itemID === 'f1'} onClick={() => deleteTreeItem(treeMenu.item)} type="button">
                Delete
              </button>
            </div>
          ) : null}
        </div>
        {pendingCreate ? (
          <div className="tree-create-box">
            <label>
              <span>
                New {pendingCreate.kind === 'folder' ? 'folder' : 'runorder'} in {pendingCreate.parentSlug} ({pendingCreate.parentID})
              </span>
              <input
                autoFocus
                maxLength="150"
                placeholder={pendingCreate.kind === 'folder' ? 'Folder name' : 'Runorder name'}
                type="text"
                value={pendingCreateName}
                onChange={(event) => setPendingCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitPendingCreate();
                  }
                }}
              />
            </label>
            <button disabled={status?.state !== 'open' || !pendingCreateName.trim()} onClick={submitPendingCreate} type="button">
              Create
            </button>
            <button
              onClick={() => {
                setPendingCreate(null);
                setPendingCreateName('');
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : null}
        {runorderShowStatus || folderCreateStatus || runorderCreateStatus ? (
          <span className="send-status">{runorderShowStatus || folderCreateStatus || runorderCreateStatus}</span>
        ) : null}
      </div>

      <div className="panel rundown-column">
        <div className="panel-heading">
          <h2>Stories</h2>
          <div className="story-heading-actions">
            <span className="muted">
              {keyboardStoryNumber
                ? `Go to story ${keyboardStoryNumber}`
                : storyPlayStatus || (storiesState.stories?.length ? `${storiesState.stories.length} stories` : storiesState.error ?? 'Loading')}
            </span>
            <button disabled={!storiesState.stories?.length || status?.state !== 'open'} onClick={() => moveStory(-1)} type="button">
              Previous
            </button>
            <button disabled={!storiesState.stories?.length || status?.state !== 'open'} onClick={() => moveStory(1)} type="button">
              Next
            </button>
          </div>
        </div>
        <div className="story-slug-list" aria-label="Story slug list">
          {storiesState.stories?.length ? (
            storiesState.stories.map((story) => {
              const isSelected = String(story.storyID) === String(selectedStoryID);
              const isCurrent = String(story.storyID) === String(summary.story?.CurrentStoryId);

              return (
                <button
                  className={`story-slug-button ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                  key={story.storyID}
                  ref={(element) => {
                    if (element) {
                      storyButtonRefs.current.set(String(story.storyID), element);
                    } else {
                      storyButtonRefs.current.delete(String(story.storyID));
                    }
                  }}
                  onClick={() => setSelectedStoryID(story.storyID)}
                  onDoubleClick={() => playStory(story)}
                  title="Click to view content, double-click to make current"
                  type="button"
                >
                  <span className="story-number">{story.serial}</span>
                  <span className="story-slug">{story.title || story.storyID}</span>
                </button>
              );
            })
          ) : (
            <div className="story-empty">{storiesState.error ?? 'Waiting for stories'}</div>
          )}
        </div>
      </div>

      <div className="panel rundown-column">
        <div className="panel-heading">
          <h2>Content</h2>
          <span className="muted">{selectedStory ? selectedStory.storyID : 'Select a story'}</span>
        </div>
        <div className="story-reader">
          {selectedStory ? (
            <>
              <div className="story-reader-title" style={{ fontFamily: fontFamilyInput }}>
                <span>{selectedStory.serial}</span>
                <strong>{selectedStory.title || selectedStory.storyID}</strong>
              </div>
              <div
                className={`story-reader-content ${rtlInput ? 'rtl' : ''}`}
                dir={rtlInput ? 'rtl' : 'ltr'}
                style={{ fontFamily: fontFamilyInput }}
              >
                {selectedStory.content || '-'}
              </div>
            </>
          ) : (
            <div className="story-reader-empty">Click a story slug to view content</div>
          )}
        </div>
      </div>
    </section>
  );
}

function TreeBranch({ expandedItems, items, parentID, onContextMenu, onExpand, onShow }) {
  const children = items.filter((item) => String(item.parentID ?? '') === String(parentID ?? ''));

  if (!children.length) {
    return null;
  }

  return (
    <ul className="tree-branch">
      {children.map((item) => {
        const isFolder = item.itemType === 'folder';
        const isExpanded = expandedItems[item.itemID];

        return (
          <li key={item.itemID}>
            <div
              className={`tree-node ${isFolder ? 'folder' : 'runorder'}`}
              onDoubleClick={() => onShow(item)}
              onContextMenu={(event) => onContextMenu(event, item)}
            >
              <button
                className="tree-toggle"
                disabled={!isFolder}
                onClick={() => isFolder ? onExpand(item) : onShow(item)}
                type="button"
              >
                {isFolder ? (isExpanded ? '-' : '+') : ''}
              </button>
              <button
                className="tree-label"
                onClick={() => isFolder ? onExpand(item) : undefined}
                onDoubleClick={() => onShow(item)}
                type="button"
              >
                <span>{isFolder ? 'Folder' : 'RO'}</span>
                {item.itemSlug}
              </button>
              <code>{item.itemID}</code>
            </div>
            {isFolder && isExpanded ? (
              <TreeBranch
                expandedItems={expandedItems}
                items={items}
                parentID={item.itemID}
                onContextMenu={onContextMenu}
                onExpand={onExpand}
                onShow={onShow}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function buildSummary(messages) {
  return messages.reduce((summary, message) => {
    const body = message.xml?.PCSyncPlay;
    const event = message.xmlShape?.event;

    if (!body) {
      return summary;
    }

    if (event === 'Login') summary.login = body.Login;
    if (event === 'SamvadConnectivity') summary.samvadConnectivity = body.SamvadConnectivity;
    if (event === 'ReadyToPlay') summary.readyToPlay = body.ReadyToPlay;
    if (event === 'Sync') summary.sync = body.Sync;
    if (event === 'Speed') summary.speed = body.Speed;
    if (event === 'SetSpeed') summary.speed = body.SetSpeed;
    if (event === 'FontSize') summary.fontSize = body.FontSize;
    if (event === 'StoryStatus') summary.story = body;
    if (event === 'ErrorLog') summary.errorLog = body.ErrorLog;
    if (event === 'InewsConnectivity') summary.inewsConnectivity = body.InewsConnectivity;

    return summary;
  }, {});
}

function formatBool(value) {
  if (value === true) {
    return 'Yes';
  }

  if (value === false) {
    return 'No';
  }

  return 'Waiting';
}

function getCurrentSpeed(summary) {
  return summary.speed?.CurrentSpeed ?? summary.speed?.Speed ?? summary.sync?.Speed;
}

function clampSpeed(speed) {
  return Math.min(6, Math.max(-2.5, speed));
}

function roundToSpeedStep(speed) {
  return Math.round(speed * 4) / 4;
}

function getCurrentFontSize(summary) {
  return summary.fontSize?.FontSize ?? summary.sync?.FontSize;
}

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value));
}
