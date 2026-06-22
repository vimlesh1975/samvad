# Samvad Next.js WebSocket Inspector

Small Next.js JavaScript project that connects to the Samvad teleprompter WebSocket, displays live teleprompter state, and sends control commands back to Samvad.

Default targets:

- Web UI: `http://localhost:$PORT/`
- Samvad WebSocket: configured with `SAMVAD_WS_URL` or `SAMVAD_HOST` + `SAMVAD_WS_PORT`
- Samvad source UI: configured with `SAMVAD_HTTP_URL` or `SAMVAD_HOST` + `SAMVAD_HTTP_PORT`

## Run

```powershell
npm run dev
```

Then open:

- `http://localhost:$PORT/` for the dashboard
- `http://localhost:$PORT/api/status` for connection status and latest parsed frame
- `http://localhost:$PORT/api/messages` for recent parsed frames
- `http://localhost:$PORT/api/stories` for the current rundown story table

## One-off WebSocket capture

```powershell
npm run inspect:ws
```

Optional environment variables:

- `SAMVAD_HOST`
- `SAMVAD_HTTP_PORT`
- `SAMVAD_WS_PORT`
- `SAMVAD_HTTP_URL`
- `SAMVAD_WS_URL`
- `SAMVAD_USERNAME`
- `SAMVAD_PASSWORD`
- `INSPECT_MS`, default `20000`
- `PORT`, default `3000`. `npm run dev` and `npm run start` read this from `.env`.
- `MAX_MESSAGES`, default `100`

The controller logs in automatically whenever its WebSocket connects, including after the Samvad device restarts. If Samvad reports a stale active session, the controller requests session takeover and then opens the root folder.

## API Methods

### `GET /api/status`

Returns WebSocket connection state and the latest parsed frame.

Example response:

```json
{
  "url": "ws://<SAMVAD_HOST>:<SAMVAD_WS_PORT>",
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

### `POST /api/font-family`

Applies a font family to every story in the current runorder while preserving the story text and other SMVD formatting.

```json
{
  "fontFamily": "Mangal"
}
```

### `GET /api/system-fonts`

Returns all font families installed on the machine running the Next.js server. These populate the whole-runorder font combo.

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

### `POST /api/runorder-content`

Sends content to multiple stories in the current runorder.

Supported modes:

- `blank`: blanks every story.
- `custom`: sends the same HTML template to every story. Supports `{{serial}}`, `{{title}}`, and `{{storyID}}`.
- `lines`: treats each non-empty newline as one story. Line 1 goes to story 1, line 2 goes to story 2. Extra lines are ignored; extra stories are skipped.

Example request for newline-separated scripts:

```json
{
  "mode": "lines",
  "html": "First story script text\nSecond story script text\nThird story script text"
}
```

Example response:

```json
{
  "ok": true,
  "sentAt": "2026-05-30T08:10:00.000Z",
  "roID": "DDNRCS_RO",
  "mode": "lines",
  "count": 3,
  "skippedCount": 0
}
```

### `POST /api/runorder-create`

Creates a new Samvad runorder in a folder. Samvad's root folder id is usually `f1`.

Example request:

```json
{
  "name": "Morning Bulletin",
  "parentID": "f1"
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><itemCreate><itemType>runorder</itemType><itemSlug>Morning Bulletin</itemSlug><pID>f1</pID></itemCreate></PCSyncPlay>
```

This is the same message the Samvad web UI sends from its folder tree create menu.

### `POST /api/runorder-show`

Opens a runorder window and then marks it as ready to play on the teleprompter. The dashboard sends this when a runorder node is double-clicked in the tree. This mimics Samvad's `getMultiTabs()` flow before sending the same ready message as the `readyToPlay()` button.

Example request:

```json
{
  "roID": "r6",
  "roSlug": "Morning Bulletin"
}
```

XML sent to Samvad:

```http
GET /rowindow6.html?userid=40&itemid=r6&itemslug=Morning+Bulletin&refresh=false
```

```xml
<PCSyncPlay><ReadyToPlay><roID>6</roID></ReadyToPlay></PCSyncPlay>
```

Tree ids such as `r6` and `rDDNRCS_RO` are normalized to `6` and `DDNRCS_RO` before sending `ReadyToPlay`. Samvad replies with a `ReadyToPlay` frame that includes the runorder slug.

### `POST /api/folder-create`

Creates a new Samvad folder under a parent folder. Use `f1` to create a top-level folder under root.

Example request:

```json
{
  "name": "News Folder",
  "parentID": "f1"
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><itemCreate><itemType>folder</itemType><itemSlug>News Folder</itemSlug><pID>f1</pID></itemCreate></PCSyncPlay>
```

### `GET /api/folders`

Refreshes the Samvad root folder and returns known folder/runorder tree items with their real ids.

XML sent to Samvad:

```xml
<PCSyncPlay><itemOpen><itemID>f1</itemID><itemSlug>root</itemSlug><ExpandAll>false</ExpandAll></itemOpen></PCSyncPlay>
```

Example response:

```json
{
  "ok": true,
  "requestedParentID": "f1",
  "items": [
    {
      "itemID": "f7",
      "itemSlug": "vimlesh",
      "itemType": "folder",
      "parentID": "f1"
    },
    {
      "itemID": "rDDNRCS_RO",
      "itemSlug": "0600 Hrs_2026-05-29",
      "itemType": "runorder",
      "parentID": "f1"
    }
  ],
  "folders": [
    {
      "folderID": "f7",
      "folderSlug": "vimlesh",
      "parentID": "f1"
    }
  ]
}
```

### `POST /api/item-delete`

Deletes a folder or runorder from Samvad. The root folder `f1` is blocked by the Next.js app.

Example request:

```json
{
  "itemType": "runorder",
  "itemID": "rDDNRCS_RO",
  "itemSlug": "0600 Hrs_2026-05-29"
}
```

XML sent to Samvad:

```xml
<PCSyncPlay><itemOperation><operation>Delete</operation><itemType>runorder</itemType><source><itemID>rDDNRCS_RO</itemID><itemSlug>0600 Hrs_2026-05-29</itemSlug></source><target><pID></pID></target></itemOperation></PCSyncPlay>
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
<PCSyncPlay><ReadyToPlay><roID>6</roID><roSlug>0600 Hrs_2026-05-29</roSlug></ReadyToPlay></PCSyncPlay>
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

### Create Runorder

```xml
<PCSyncPlay><itemCreate><itemType>runorder</itemType><itemSlug>Morning Bulletin</itemSlug><pID>f1</pID></itemCreate></PCSyncPlay>
```

### Create Folder

```xml
<PCSyncPlay><itemCreate><itemType>folder</itemType><itemSlug>News Folder</itemSlug><pID>f1</pID></itemCreate></PCSyncPlay>
```
