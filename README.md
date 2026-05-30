# Samvad Next.js WebSocket Inspector

Small Next.js JavaScript project that connects to the Samvad teleprompter WebSocket, displays live teleprompter state, and sends control commands back to Samvad.

Default targets:

- Web UI: `http://localhost:3000/`
- Samvad WebSocket: `ws://192.168.0.188:9095`
- Samvad source UI: `http://192.168.0.188:9000/`

## Run

```powershell
npm run dev
```

Then open:

- `http://localhost:3000/` for the dashboard
- `http://localhost:3000/api/status` for connection status and latest parsed frame
- `http://localhost:3000/api/messages` for recent parsed frames
- `http://localhost:3000/api/stories` for the current rundown story table

## One-off WebSocket capture

```powershell
npm run inspect:ws
```

Optional environment variables:

- `SAMVAD_WS_URL`, default `ws://192.168.0.188:9095`
- `INSPECT_MS`, default `20000`
- `PORT`, default `3000`
- `MAX_MESSAGES`, default `100`

## API Methods

### `GET /api/status`

Returns WebSocket connection state and the latest parsed frame.

Example response:

```json
{
  "url": "ws://192.168.0.188:9095",
  "state": "open",
  "messageCount": 13,
  "latestMessage": {
    "receivedAt": "2026-05-30T05:39:00.081Z",
    "transportType": "text",
    "format": "xml",
    "byteLength": 121,
    "preview": "<PCSyncPlay><messageID>973</messageID><roID>DDNRCS_RO</roID><CurrentStoryId>202605291050541</CurrentStoryId></PCSyncPlay>",
    "xmlShape": {
      "root": "PCSyncPlay",
      "event": "StoryStatus",
      "summary": {
        "messageID": 973,
        "roID": "DDNRCS_RO",
        "CurrentStoryId": 202605291050541
      }
    }
  }
}
```

### `GET /api/messages`

Returns recent parsed WebSocket frames. The count is controlled by `MAX_MESSAGES`.

Example response:

```json
[
  {
    "receivedAt": "2026-05-30T05:07:10.100Z",
    "transportType": "text",
    "format": "xml",
    "byteLength": 587,
    "xmlShape": {
      "root": "PCSyncPlay",
      "event": "Sync",
      "summary": {
        "PlayPause": false,
        "Stop": false,
        "Speed": 3.8,
        "FontSize": 80,
        "BgColor": "#050505",
        "FgColor": "#FFFFFF"
      }
    }
  }
]
```

### `GET /api/stories`

Fetches the current rundown table from Samvad's `rowindow{roID}.html` endpoint and parses story rows.

Example response:

```json
{
  "roID": "DDNRCS_RO",
  "roSlug": "0600 Hrs_2026-05-29",
  "userID": 40,
  "stories": [
    {
      "serial": "1",
      "blocked": false,
      "title": "uuuuu",
      "storyID": "202605291050542"
    },
    {
      "serial": "2",
      "blocked": false,
      "title": "bb",
      "storyID": "202605290938001"
    }
  ]
}
```

### `POST /api/speed`

Sends a live teleprompter speed command.

Example request:

```json
{
  "speed": 4.2
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><Speed><roID>DDNRCS_RO</roID><CurrentSpeed>4.2</CurrentSpeed><MaxSpeed>20</MaxSpeed></Speed></PCSyncPlay>
```

Example response:

```json
{
  "ok": true,
  "sentAt": "2026-05-30T05:34:00.000Z",
  "speed": 4.2,
  "roID": "DDNRCS_RO",
  "xml": "<PCSyncPlay><Speed><roID>DDNRCS_RO</roID><CurrentSpeed>4.2</CurrentSpeed><MaxSpeed>20</MaxSpeed></Speed></PCSyncPlay>"
}
```

### `POST /api/font-size`

Sends a live font-size command.

Example request:

```json
{
  "fontSize": 96
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><FontSize><roID>DDNRCS_RO</roID><FontSize>96</FontSize></FontSize></PCSyncPlay>
```

Example response:

```json
{
  "ok": true,
  "sentAt": "2026-05-30T05:40:00.000Z",
  "fontSize": 96,
  "roID": "DDNRCS_RO",
  "xml": "<PCSyncPlay><FontSize><roID>DDNRCS_RO</roID><FontSize>96</FontSize></FontSize></PCSyncPlay>"
}
```

### `POST /api/control`

Sends a Samvad control command.

Allowed commands:

- `Play`
- `Pause`
- `Skip`
- `Previous`

Example request:

```json
{
  "command": "Play"
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><Control><roID>DDNRCS_RO</roID><Status>Play</Status></Control></PCSyncPlay>
```

Example response:

```json
{
  "ok": true,
  "sentAt": "2026-05-30T05:39:00.000Z",
  "command": "Play",
  "roID": "DDNRCS_RO",
  "xml": "<PCSyncPlay><Control><roID>DDNRCS_RO</roID><Status>Play</Status></Control></PCSyncPlay>"
}
```

### `POST /api/story-play`

Makes a specific story current by sending Samvad's `roCntrl` play command. The dashboard calls this when a story row is double-clicked.

Example request:

```json
{
  "storyID": "202605291050542",
  "storySlug": "uuuuu"
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><roCntrl><roID>DDNRCS_RO</roID><element_target><storyID>202605291050542</storyID><storySlug>uuuuu</storySlug><Block>false</Block></element_target><command>Play</command></roCntrl></PCSyncPlay>
```

Example response:

```json
{
  "ok": true,
  "sentAt": "2026-05-30T05:50:00.000Z",
  "roID": "DDNRCS_RO",
  "storyID": "202605291050542",
  "storySlug": "uuuuu",
  "xml": "<PCSyncPlay><roCntrl><roID>DDNRCS_RO</roID><element_target><storyID>202605291050542</storyID><storySlug>uuuuu</storySlug><Block>false</Block></element_target><command>Play</command></roCntrl></PCSyncPlay>"
}
```

## WebSocket Receive Examples

### Login

```xml
<PCSyncPlay><Login><Success>true</Success><UserID>40</UserID><Privileges>03,13,21,33</Privileges><LogoutFromOtherSystem>-1</LogoutFromOtherSystem></Login></PCSyncPlay>
```

Parsed summary:

```json
{
  "event": "Login",
  "summary": {
    "Success": true,
    "UserID": 40,
    "Privileges": "03,13,21,33",
    "LogoutFromOtherSystem": -1
  }
}
```

### Ready To Play

```xml
<PCSyncPlay><ReadyToPlay><roID>DDNRCS_RO</roID><roSlug>0600 Hrs_2026-05-29</roSlug></ReadyToPlay></PCSyncPlay>
```

### Sync State

```xml
<PCSyncPlay><Sync><PlayPause>false</PlayPause><DummyPlay>false</DummyPlay><Stop>false</Stop><Mirror>false</Mirror><Toggle>false</Toggle><Blank>false</Blank><ShowDateTime>false</ShowDateTime><ShowTimer>false</ShowTimer><ShowCountDownTimer>false</ShowCountDownTimer><Finish>false</Finish><Speed>3.8</Speed><FontSize>80</FontSize><AlternateColorStatus>false</AlternateColorStatus><AllowDummyPlayDuringPlayingTime>false</AllowDummyPlayDuringPlayingTime><BreakLineChar>@</BreakLineChar><BgColor>#050505</BgColor><FgColor>#FFFFFF</FgColor><EditorScroll>false</EditorScroll></Sync></PCSyncPlay>
```

### Current Story

```xml
<PCSyncPlay><messageID>973</messageID><roID>DDNRCS_RO</roID><CurrentStoryId>202605291050541</CurrentStoryId></PCSyncPlay>
```

Parsed as:

```json
{
  "event": "StoryStatus",
  "summary": {
    "messageID": 973,
    "roID": "DDNRCS_RO",
    "CurrentStoryId": 202605291050541
  }
}
```

### iNews Connectivity Error

```xml
<PCSyncPlay><ErrorLog><DateTime>2026/05/30 10:46:51</DateTime><ErrorMsg>Connection to inews server failed due to error: Host unreachable</ErrorMsg><Severity>3</Severity></ErrorLog></PCSyncPlay>
```

```xml
<PCSyncPlay><InewsConnectivity><Status>false</Status><Activated>true</Activated></InewsConnectivity></PCSyncPlay>
```

## WebSocket Send Examples

### Speed

```xml
<PCSyncPlay><Speed><roID>DDNRCS_RO</roID><CurrentSpeed>4.2</CurrentSpeed><MaxSpeed>20</MaxSpeed></Speed></PCSyncPlay>
```

### Font Size

```xml
<PCSyncPlay><FontSize><roID>DDNRCS_RO</roID><FontSize>96</FontSize></FontSize></PCSyncPlay>
```

### Play/Pause

```xml
<PCSyncPlay><Control><roID>DDNRCS_RO</roID><Status>Play</Status></Control></PCSyncPlay>
```

```xml
<PCSyncPlay><Control><roID>DDNRCS_RO</roID><Status>Pause</Status></Control></PCSyncPlay>
```

### Next/Previous Story

```xml
<PCSyncPlay><Control><roID>DDNRCS_RO</roID><Status>Skip</Status></Control></PCSyncPlay>
```

```xml
<PCSyncPlay><Control><roID>DDNRCS_RO</roID><Status>Previous</Status></Control></PCSyncPlay>
```

### Play Specific Story

```xml
<PCSyncPlay><roCntrl><roID>DDNRCS_RO</roID><element_target><storyID>202605291050542</storyID><storySlug>uuuuu</storySlug><Block>false</Block></element_target><command>Play</command></roCntrl></PCSyncPlay>
```
