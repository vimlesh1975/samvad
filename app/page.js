'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const refreshMs = 2000;
const fallbackFonts = ['Arial', 'Times New Roman'];
const todayIsoDate = () => new Date().toISOString().slice(0, 10);

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
  const [runorderLines, setRunorderLines] = useState('');
  const [mosRunorderDate, setMosRunorderDate] = useState(todayIsoDate);
  const [mosRunorderTitle, setMosRunorderTitle] = useState('0600 Hrs');
  const [mosRunorders, setMosRunorders] = useState([]);
  const [mosStories, setMosStories] = useState({ stories: [] });
  const [mosSendStatus, setMosSendStatus] = useState('');
  const [expandedItems, setExpandedItems] = useState({ f1: true });
  const [treeMenu, setTreeMenu] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const [pendingCreateName, setPendingCreateName] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [fontSizeStatus, setFontSizeStatus] = useState('');
  const [fontFamilyStatus, setFontFamilyStatus] = useState('');
  const [controlStatus, setControlStatus] = useState('');
  const [storyPlayStatus, setStoryPlayStatus] = useState('');
  const [runorderContentStatus, setRunorderContentStatus] = useState('');
  const [runorderShowStatus, setRunorderShowStatus] = useState('');
  const [runorderCreateStatus, setRunorderCreateStatus] = useState('');
  const [folderCreateStatus, setFolderCreateStatus] = useState('');
  const speedTouched = useRef(false);
  const fontSizeTouched = useRef(false);
  const lastShuttleSpeedActionAt = useRef('');
  const summary = useMemo(() => {
    return buildSummary(messages);
  }, [messages]);
  const selectedSpeed = Number(speedInput);
  const selectedFontSize = Number(fontSizeInput);
  const displaySpeed = Number.isFinite(selectedSpeed) ? selectedSpeed : getCurrentSpeed(summary) ?? 0;

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

  async function setShuttleRunning(running) {
    try {
      await fetch(running ? '/api/shuttle/start' : '/api/shuttle/stop', { method: 'POST' });
      setTimeout(refresh, 500);
    } catch (shuttleError) {
      setError(shuttleError.message);
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
      return result;
    } catch (foldersError) {
      setFoldersState({ folders: [], error: foldersError.message });
      throw foldersError;
    }
  }

  async function refreshRunorderTree() {
    setFolderCreateStatus('Refreshing run orders...');
    setTreeMenu(null);
    setPendingCreate(null);
    setPendingCreateName('');

    try {
      let latestTree = await refreshFolders('f1', 'root');

      const expandedFolderIDs = Object.entries(expandedItems)
        .filter(([, isExpanded]) => isExpanded)
        .map(([folderID]) => folderID)
        .filter((folderID) => folderID !== 'f1');

      for (const folderID of expandedFolderIDs) {
        const folder = latestTree.items?.find((item) => String(item.itemID) === String(folderID));
        latestTree = await refreshFolders(folderID, folder?.itemSlug || folder?.folderSlug || '');
      }

      setFolderCreateStatus(`Refreshed ${expandedFolderIDs.length + 1} folders`);
    } catch (refreshError) {
      setFolderCreateStatus(refreshError.message);
    }
  }

  useEffect(() => {
    refresh();
    refreshFolders();
    loadSystemFonts();
    loadMosRunorders(mosRunorderDate);
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadMosRunorders(mosRunorderDate);
  }, [mosRunorderDate]);

  useEffect(() => {
    loadMosStories(mosRunorderDate, mosRunorderTitle);
  }, [mosRunorderDate, mosRunorderTitle]);

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

  async function loadMosRunorders(selectedDate) {
    try {
      const params = new URLSearchParams();

      if (selectedDate) {
        params.set('date', selectedDate);
      }

      const response = await fetch(`/api/mos/runorders?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Failed to load NRCS runorders');
      }

      setMosRunorders(result.runorders ?? []);

      if (result.runorders?.length && !result.runorders.some((item) => item.title === mosRunorderTitle)) {
        setMosRunorderTitle(result.runorders[0].title);
      }
    } catch (runorderError) {
      setMosRunorders([]);
      setMosSendStatus(runorderError.message);
    }
  }

  async function loadMosStories(selectedDate, selectedRunorder) {
    if (!selectedDate || !selectedRunorder) {
      setMosStories({ stories: [] });
      return;
    }

    try {
      const params = new URLSearchParams({
        date: selectedDate,
        runorder: selectedRunorder,
      });
      const response = await fetch(`/api/mos/stories?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to load NRCS stories');
      }

      setMosStories(result);
    } catch (storiesError) {
      setMosStories({ stories: [], error: storiesError.message });
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

    if (currentSpeed !== undefined && !speedTouched.current) {
      const signedSpeedInput = roundToSpeedStep(Number(speedInput));
      const reportedSpeed = roundToSpeedStep(Number(currentSpeed));

      if (
        Number.isFinite(signedSpeedInput) &&
        signedSpeedInput < 0 &&
        Math.abs(Math.abs(signedSpeedInput) - Math.abs(reportedSpeed)) < 0.001
      ) {
        return;
      }

      setSpeedInput(String(reportedSpeed));
    }
  }, [summary.sync?.Speed, summary.speed?.CurrentSpeed, summary.speed?.Speed, speedInput]);

  useEffect(() => {
    const shuttleAction = status?.shuttle?.lastSpeedAction || (
      status?.shuttle?.lastAction?.type === 'speed' ? status.shuttle.lastAction : null
    );

    if (
      !shuttleAction ||
      !shuttleAction.at ||
      shuttleAction.at === lastShuttleSpeedActionAt.current
    ) {
      return;
    }

    const shuttleSpeed = Number(shuttleAction.data?.speed ?? status?.shuttle?.lastSpeed);

    if (!Number.isFinite(shuttleSpeed)) {
      return;
    }

    lastShuttleSpeedActionAt.current = shuttleAction.at;
    speedTouched.current = false;
    setSpeedInput(String(shuttleSpeed));
    setSendStatus(`Shuttle speed ${shuttleSpeed}`);
  }, [status?.shuttle?.lastAction, status?.shuttle?.lastSpeed, status?.shuttle?.lastSpeedAction]);

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

  async function sendMosRunorderToSamvad() {
    setMosSendStatus('Sending to Samvad...');

    try {
      const response = await fetch('/api/mos/to-samvad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedDate: mosRunorderDate,
          selectedRunOrderTitle: mosRunorderTitle,
          sendMode: 'full',
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Error sending to Samvad');
      }

      setMosSendStatus(result.message);
      setTimeout(refresh, 1200);
    } catch (sendError) {
      setMosSendStatus(sendError.message);
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

    try {
      if (file.name.endsWith('.docx')) {
        const mammoth = await import('mammoth/mammoth.browser.js');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setRunorderLines(result.value);
      } else {
        setRunorderLines(await file.text());
      }
    } catch (err) {
      setRunorderContentStatus(`Error loading file: ${err.message}`);
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
        <div className={`status-pill ${status?.shuttle?.connected ? 'open' : ''}`}>
          <span />
          Shuttle {status?.shuttle?.connected ? 'connected' : status?.shuttle?.running ? 'listening' : 'off'}
        </div>
        <button onClick={reconnectSocket} type="button">Reconnect</button>
        <button onClick={() => setShuttleRunning(!status?.shuttle?.running)} type="button">
          {status?.shuttle?.running ? 'Stop Shuttle' : 'Start Shuttle'}
        </button>
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
        refreshRunorderTree={refreshRunorderTree}
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
        stepSpeed={stepSpeed}
        togglePlayPause={togglePlayPause}
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
              <span>Speed: {displaySpeed}</span>
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
          <div className="mos-send-panel">
            <div className="mos-panel-label">Run Orders from DD NRCS</div>
            <div className="mos-send-controls">
              <input
                aria-label="Samvad runorder date"
                type="date"
                value={mosRunorderDate}
                onChange={(event) => setMosRunorderDate(event.target.value)}
              />
              <select
                aria-label="Samvad runorder title"
                value={mosRunorderTitle}
                onChange={(event) => setMosRunorderTitle(event.target.value)}
              >
                {mosRunorders.length ? (
                  <>
                    <option value="">Select a Run Order</option>
                    {mosRunorders.map((runorder) => (
                      <option key={runorder.title} value={runorder.title}>
                        {runorder.title}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value={mosRunorderTitle}>{mosRunorderTitle || 'No runorders'}</option>
                )}
              </select>
              <button
                disabled={!mosRunorderDate || !mosRunorderTitle.trim()}
                onClick={sendMosRunorderToSamvad}
                type="button"
              >
                Send to Samvad
              </button>
              {mosSendStatus ? <span className="send-status">{mosSendStatus}</span> : null}
            </div>
            <div className="mos-story-strip" aria-label="NRCS story slug list">
              {mosStories.stories?.length ? (
                mosStories.stories.map((story) => (
                  <div className="mos-story-row" key={story.storyID}>
                    <span className="mos-story-number">{story.serial}</span>
                    <span className="mos-story-title">{story.title}</span>
                  </div>
                ))
              ) : (
                <div className="mos-story-empty">{mosStories.error || 'No NRCS stories'}</div>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="speed-form" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
              <input
                aria-label="Font size number"
                max="500"
                min="40"
                step="1"
                type="number"
                value={Number.isFinite(selectedFontSize) ? selectedFontSize : 80}
                onChange={(event) => {
                  fontSizeTouched.current = true;
                  setFontSizeInput(event.target.value);
                }}
                style={{ width: '80px' }}
              />
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
            {fontSizeStatus ? <span className="send-status">{fontSizeStatus}</span> : null}
            {fontFamilyStatus ? <span className="send-status">{fontFamilyStatus}</span> : null}
          </div>
          <div className="renderer-actions" style={{ marginTop: '12px' }}>
            <div className="file-runorder-label">Run Orders from Text or Word File</div>
            <label className="file-button">
              <span>Load Text or Word File</span>
              <input accept=".txt,text/plain,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={loadRunorderLinesFile} type="file" />
            </label>
            <button disabled={status?.state !== 'open' || !runorderLines.trim()} onClick={() => sendRunorderContent('lines')} type="button">
              Send Lines To Runorder
            </button>
            {runorderContentStatus ? <span className="send-status">{runorderContentStatus}</span> : null}
          </div>
        </section>
      </section>

      {error ? <div className="alert">{error}</div> : null}





    </main>
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
  refreshRunorderTree,
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
  stepSpeed,
  togglePlayPause,
}) {
  const [selectedStoryID, setSelectedStoryID] = useState('');
  const [keyboardStoryNumber, setKeyboardStoryNumber] = useState('');
  const storyNumberBuffer = useRef('');
  const storyNumberTimer = useRef(undefined);
  const storyButtonRefs = useRef(new Map());
  const selectedStory = storiesState.stories?.find((story) => String(story.storyID) === String(selectedStoryID));
  const loadedRunorderSlug = summary.readyToPlay?.roSlug || summary.story?.roSlug || '';
  const loadedRunorderID = summary.readyToPlay?.roID || summary.story?.roID || '';

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

  useEffect(() => {
    function handlePageKeys(event) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        moveStory(1);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        moveStory(-1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepSpeed(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepSpeed(-1);
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlayPause();
      }
    }
    window.addEventListener('keydown', handlePageKeys);
    return () => window.removeEventListener('keydown', handlePageKeys);
  });

  return (
    <section className="rundown-workspace">
      <div className="panel rundown-column">
        <div className="panel-heading">
          <h2>Run Orders from samvad</h2>
          <button disabled={status?.state !== 'open'} onClick={refreshRunorderTree} type="button">
            Refresh
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
        <div className="loaded-runorder-label">
          <span>Loaded Runorder</span>
          <strong>{loadedRunorderSlug || loadedRunorderID || 'None'}</strong>
          {loadedRunorderSlug && loadedRunorderID ? <code>{loadedRunorderID}</code> : null}
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
                : (storiesState.stories?.length ? `${storiesState.stories.length} stories` : storiesState.error ?? 'Loading')}
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

        </div>
        <div className="story-reader">
          {selectedStory ? (
            <>
              <div className="story-reader-title" style={{ fontFamily: fontFamilyInput }}>
                <span>{selectedStory.serial}</span>
                <strong>{selectedStory.title || selectedStory.storyID}</strong>
              </div>
              <div
                className="story-reader-content"
                dir="ltr"
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
