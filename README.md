# Samvad Next.js WebSocket Inspector

Small Next.js JavaScript project that connects to the Samvad teleprompter WebSocket and parses incoming frames.

## Run

```powershell
npm run dev
```

Then open:

- `http://localhost:3000/` for the dashboard
- `http://localhost:3000/api/status` for connection status and latest parsed frame
- `http://localhost:3000/api/messages` for recent parsed frames

## One-off WebSocket capture

```powershell
npm run inspect:ws
```

Optional environment variables:

- `SAMVAD_WS_URL`, default `ws://192.168.0.188:9095`
- `INSPECT_MS`, default `20000`
- `PORT`, default `3000`
- `MAX_MESSAGES`, default `100`
