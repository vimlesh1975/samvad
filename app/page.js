'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const refreshMs = 2000;

export default function Home() {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [storiesState, setStoriesState] = useState({ stories: [] });
  const [error, setError] = useState('');
  const [speedInput, setSpeedInput] = useState('');
  const [fontSizeInput, setFontSizeInput] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [fontSizeStatus, setFontSizeStatus] = useState('');
  const [controlStatus, setControlStatus] = useState('');
  const [storyPlayStatus, setStoryPlayStatus] = useState('');
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

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, []);

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
    } catch (sendError) {
      setSendStatus(sendError.message);
    }
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

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Samvad Teleprompter</p>
          <h1>WebSocket Inspector</h1>
        </div>
        <div className={`status-pill ${status?.state === 'open' ? 'open' : ''}`}>
          <span />
          {status?.state ?? 'loading'}
        </div>
      </section>

      {error ? <div className="alert">{error}</div> : null}

      <section className="grid metrics">
        <Metric label="Socket" value={status?.url ?? 'ws://192.168.0.188:9095'} />
        <Metric label="Frames Received" value={status?.messageCount ?? 0} />
        <Metric label="Latest Event" value={latest?.xmlShape?.event ?? 'Waiting'} />
        <Metric label="Last Update" value={latest ? new Date(latest.receivedAt).toLocaleTimeString() : 'Waiting'} />
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
          <h2>Stories</h2>
          <span className="muted">
            {storyPlayStatus || (storiesState.stories?.length ? `${storiesState.stories.length} stories` : storiesState.error ?? 'Loading')}
          </span>
        </div>
        <div className="table-wrap">
          <table className="stories-table">
            <thead>
              <tr>
                <th>Sr.no.</th>
                <th>Title</th>
                <th>Story ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {storiesState.stories?.length ? (
                storiesState.stories.map((story) => (
                  <tr
                    className={String(story.storyID) === String(summary.story?.CurrentStoryId) ? 'current-story' : ''}
                    key={story.storyID}
                    onDoubleClick={() => playStory(story)}
                    title="Double-click to make current"
                  >
                    <td>{story.serial}</td>
                    <td>{story.title}</td>
                    <td>{story.storyID}</td>
                    <td>{String(story.storyID) === String(summary.story?.CurrentStoryId) ? 'Current' : story.blocked ? 'Blocked' : ''}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">{storiesState.error ?? 'Waiting for stories'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Set Speed</h2>
          <span className="muted">Current speed: {getCurrentSpeed(summary) ?? 'Waiting'}</span>
        </div>
        <div className="speed-form">
          <div className="speed-slider">
            <input
              aria-label="Speed value"
              max="20"
              min="0.2"
              step="0.1"
              type="range"
              value={speedInput || '0.2'}
              onChange={(event) => {
                speedTouched.current = true;
                setSpeedInput(event.target.value);
              }}
            />
            <output>{Number.isFinite(selectedSpeed) ? selectedSpeed.toFixed(1) : '0.2'}</output>
          </div>
          {sendStatus ? <span className="send-status">{sendStatus}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Font Size</h2>
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
          {fontSizeStatus ? <span className="send-status">{fontSizeStatus}</span> : null}
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

function getCurrentFontSize(summary) {
  return summary.fontSize?.FontSize ?? summary.sync?.FontSize;
}
