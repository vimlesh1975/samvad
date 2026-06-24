import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { getSamvadWsClient } from './samvad-ws-client';

const require = createRequire(import.meta.url);
const shuttleVersion = 'shuttle-pro-direct-hid-v3';
const shuttleSpeedMap = new Map([
  [-7, -2.5],
  [-6, -2.25],
  [-5, -2],
  [-4, -1.75],
  [-3, -1.5],
  [-2, -1.25],
  [-1, -1],
  [0, 0],
  [1, 1],
  [2, 1.25],
  [3, 1.5],
  [4, 1.75],
  [5, 2],
  [6, 2.25],
  [7, 2.5],
]);

class ShuttleProController {
  constructor() {
    this.version = shuttleVersion;
    this.enabled = process.env.SHUTTLE_PRO_ENABLED === 'true';
    this.running = false;
    this.connected = false;
    this.devices = [];
    this.lastEvent = null;
    this.lastAction = null;
    this.lastSpeedAction = null;
    this.lastError = '';
    this.lastSpeed = 1;
    this.tempSpeed = 1;
    this.lastShuttlePosition = undefined;
    this.lastButtonAt = 0;
    this.lastJogAt = 0;
    this.hid = null;
    this.deviceDefs = null;
    this.openDevices = [];
    this.scanTimer = null;
    this.handlers = null;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      running: this.running,
      connected: this.connected,
      devices: this.devices,
      lastEvent: this.lastEvent,
      lastAction: this.lastAction,
      lastSpeedAction: this.lastSpeedAction,
      lastError: this.lastError,
      lastSpeed: this.lastSpeed,
      version: this.version,
      mapping: {
        buttons: {
          1: 'play/pause',
          2: 'speed -2.5',
          3: 'speed -1',
          4: 'first story from start',
          5: 'speed 1',
          6: 'speed 1.25',
          7: 'speed 1.5',
          8: 'speed 1.75',
          9: 'speed +0.25',
          10: 'story 5',
          11: 'story 10',
          12: 'story 15',
          13: 'current story + 5',
          14: 'previous story',
          15: 'next story',
        },
        jog: {
          '-1': 'speed -1',
          1: 'speed 1',
        },
        shuttle: Object.fromEntries(shuttleSpeedMap),
      },
    };
  }

  start({ force = false } = {}) {
    if (!this.enabled && !force) {
      this.lastError = 'Set SHUTTLE_PRO_ENABLED=true in .env or call /api/shuttle/start';
      return this.getStatus();
    }

    if (this.running) {
      return this.getStatus();
    }

    try {
      this.hid = require('node-hid');
      this.deviceDefs = require('shuttle-control-usb/lib/ShuttleDefs');
      this.running = true;
      this.lastError = '';
      this.scan();
      this.scanTimer = setInterval(() => this.scan(), 2000);
      this.devices = this.getDeviceList();
      this.connected = this.devices.length > 0;
      this.recordAction('started', { deviceCount: this.devices.length });
    } catch (error) {
      this.running = false;
      this.lastError = error.message;
    }

    return this.getStatus();
  }

  stop() {
    try {
      if (this.scanTimer) {
        clearInterval(this.scanTimer);
      }

      for (const device of this.openDevices) {
        try {
          device.hid.removeAllListeners?.();
          device.hid.close();
        } catch {
          // Ignore close errors from devices already removed by Windows.
        }
      }

      this.recordAction('stopped');
      this.lastError = '';
    } catch (error) {
      this.lastError = error.message;
    } finally {
      this.running = false;
      this.connected = false;
      this.devices = [];
      this.openDevices = [];
      this.handlers = null;
      this.scanTimer = null;
      this.lastShuttlePosition = undefined;
    }

    return this.getStatus();
  }

  scan() {
    if (!this.hid || !this.deviceDefs) {
      return;
    }

    try {
      const hidDevices = this.hid.devices();
      const connectedPaths = new Set(this.openDevices.map((device) => device.path));

      for (const deviceDef of this.deviceDefs) {
        const matches = hidDevices.filter(
          (device) => device.vendorId === deviceDef.vid &&
            device.productId === deviceDef.pid &&
            !connectedPaths.has(device.path),
        );

        for (const device of matches) {
          this.connectDevice(device, deviceDef);
        }
      }

      this.devices = this.getDeviceList();
      this.connected = this.devices.length > 0;
    } catch (error) {
      this.lastError = error.message;
    }
  }

  connectDevice(device, deviceDef) {
    try {
      const hidDevice = new this.hid.HID(device.path);
      const id = crypto.createHash('md5').update(device.serialNumber || device.path).digest('hex');
      const openDevice = {
        id,
        hid: hidDevice,
        def: deviceDef,
        path: device.path,
        state: {
          buttons: deviceDef.buttonMasks.map(() => false),
          jog: 0,
          shuttle: 0,
        },
      };

      this.openDevices.push(openDevice);
      this.recordEvent('connected', this.toDeviceInfo(openDevice));
      hidDevice.on('data', (data) => this.updateData(data, openDevice));
      hidDevice.on('error', (error) => {
        this.openDevices = this.openDevices.filter((item) => item.id !== openDevice.id);
        this.devices = this.getDeviceList();
        this.connected = this.devices.length > 0;
        this.lastError = error.message;
        this.recordEvent('disconnected', { id: openDevice.id, error: error.message });
      });
    } catch (error) {
      this.lastError = error.message;
    }
  }

  updateData(data, device) {
    if (data.length !== device.def.packetSize) {
      return;
    }

    const shuttle = readHidValue(data, device.def.rules.shuttle.offset, device.def.rules.shuttle.type);
    const jog = readHidValue(data, device.def.rules.jog.offset, device.def.rules.jog.type);
    const buttonsRaw = readHidValue(data, device.def.rules.buttons.offset, device.def.rules.buttons.type);

    if (shuttle !== device.state.shuttle) {
      device.state.shuttle = shuttle;
      this.handleShuttle(shuttle, device.id);
    }

    if (jog !== device.state.jog) {
      const direction = (device.state.jog === 0xff && jog === 0) ||
        (!(device.state.jog === 0 && jog === 0xff) && device.state.jog < jog)
        ? 1
        : -1;
      device.state.jog = jog;
      this.handleJog(direction, device.id);
    }

    device.def.buttonMasks.forEach((mask, index) => {
      const button = Boolean(buttonsRaw & mask);

      if (button && !device.state.buttons[index]) {
        this.handleButton(index + 1, device.id);
      }

      device.state.buttons[index] = button;
    });
  }

  handleButton(button, id) {
    if (Date.now() - this.lastButtonAt < 250) {
      return;
    }

    this.lastButtonAt = Date.now();
    this.recordEvent('buttondown', { button, id });

    const actions = {
      1: () => this.togglePlayPause(),
      2: () => this.setSpeed(-2.5),
      3: () => this.setSpeed(-1),
      4: () => this.playFirstStory(),
      5: () => this.setSpeed(1),
      6: () => this.setSpeed(1.25),
      7: () => this.setSpeed(1.5),
      8: () => this.setSpeed(1.75),
      9: () => this.stepSpeed(0.25),
      10: () => this.playStoryByIndex(4),
      11: () => this.playStoryByIndex(9),
      12: () => this.playStoryByIndex(14),
      13: () => this.playRelativeStory(5),
      14: () => this.sendControl('Previous'),
      15: () => this.sendControl('Skip'),
    };

    this.runAction(actions[button]);
  }

  handleJog(direction, id) {
    if (Date.now() - this.lastJogAt < 200) {
      return;
    }

    this.lastJogAt = Date.now();
    this.recordEvent('jog-dir', { direction, id });

    if (direction === 1) {
      this.runAction(() => this.setSpeed(1));
    } else if (direction === -1) {
      this.runAction(() => this.setSpeed(-1));
    }
  }

  handleShuttle(position, id) {
    if (position === this.lastShuttlePosition) {
      return;
    }

    this.lastShuttlePosition = position;
    this.recordEvent('shuttle', { position, id });

    if (!shuttleSpeedMap.has(position)) {
      return;
    }

    const speed = shuttleSpeedMap.get(position);

    if (speed === 0) {
      this.runAction(() => this.sendControl('Pause'));
      return;
    }

    this.runAction(() => this.setSpeed(speed));
  }

  runAction(action) {
    if (!action) {
      return;
    }

    try {
      Promise.resolve(action()).catch((error) => {
        this.lastError = error.message;
        this.recordAction('error', { error: error.message });
      });
    } catch (error) {
      this.lastError = error.message;
      this.recordAction('error', { error: error.message });
    }
  }

  setSpeed(speed) {
    const client = getSamvadWsClient();
    const result = client.sendSpeed(speed);
    this.lastSpeed = speed;
    this.tempSpeed = speed || this.tempSpeed;
    this.lastSpeedAction = this.recordAction('speed', { speed, roID: result.roID });

    if (speed !== 0) {
      this.sendControl('Play');
    }

    return result;
  }

  stepSpeed(delta) {
    const nextSpeed = clampSpeed(roundToSpeedStep((this.lastSpeed || 0) + delta));
    return this.setSpeed(nextSpeed);
  }

  sendControl(command) {
    const result = getSamvadWsClient().sendControl(command);
    this.recordAction('control', { command, roID: result.roID });
    return result;
  }

  togglePlayPause() {
    const latestSync = findLatestSync(getSamvadWsClient().getMessages());
    const command = latestSync?.PlayPause ? 'Pause' : 'Play';
    return this.sendControl(command);
  }

  async playFirstStory() {
    return this.playStoryByIndex(0, 'first-story');
  }

  async playRelativeStory(offset) {
    const client = getSamvadWsClient();
    const result = await client.getStories();
    const currentStoryID = findLatestStoryStatus(client.getMessages())?.CurrentStoryId;
    const currentIndex = result.stories?.findIndex(
      (story) => String(story.storyID) === String(currentStoryID),
    ) ?? -1;
    const targetIndex = currentIndex === -1 ? offset : currentIndex + offset;

    return this.playStoryByIndex(targetIndex, 'relative-story');
  }

  async playStoryByIndex(index, actionType = 'story-index') {
    const client = getSamvadWsClient();
    const result = await client.getStories();
    const story = result.stories?.[index];

    if (!story) {
      throw new Error(`Story ${index + 1} not found in current runorder`);
    }

    const playResult = client.sendStoryPlay({
      storyID: story.storyID,
      storySlug: story.title,
    });
    this.recordAction(actionType, {
      storyNumber: index + 1,
      storyID: story.storyID,
      storySlug: story.title,
    });
    this.sendControl('Play');
    return playResult;
  }

  getDeviceList() {
    return this.openDevices.map((device) => this.toDeviceInfo(device));
  }

  toDeviceInfo(device) {
    return {
      id: device.id,
      path: device.path,
      name: device.def.name,
      hasShuttle: device.def.rules.shuttle !== undefined,
      hasJog: device.def.rules.jog !== undefined,
      numButtons: device.def.buttonMasks.length,
    };
  }

  recordEvent(type, data) {
    this.lastEvent = {
      type,
      data,
      at: new Date().toISOString(),
    };
  }

  recordAction(type, data = {}) {
    this.lastAction = {
      type,
      data,
      at: new Date().toISOString(),
    };

    return this.lastAction;
  }
}

function findLatestSync(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const sync = messages[index]?.xml?.PCSyncPlay?.Sync;

    if (sync) {
      return sync;
    }
  }

  return null;
}

function findLatestStoryStatus(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const body = messages[index]?.xml?.PCSyncPlay;

    if (body?.CurrentStoryId && body?.roID) {
      return body;
    }
  }

  return null;
}

function readHidValue(data, offset, type) {
  switch (type) {
    case 'uint8':
      return data.readUInt8(offset);
    case 'int8':
      return data.readInt8(offset);
    case 'uint16le':
      return data.readUInt16LE(offset);
    case 'int16le':
      return data.readInt16LE(offset);
    case 'uint16be':
      return data.readUInt16BE(offset);
    case 'int16be':
      return data.readInt16BE(offset);
    default:
      return null;
  }
}

function clampSpeed(speed) {
  return Math.min(6, Math.max(-2.5, speed));
}

function roundToSpeedStep(speed) {
  return Math.round(speed * 4) / 4;
}

export function getShuttleProController() {
  if (
    !globalThis.samvadShuttleProController ||
    globalThis.samvadShuttleProController.version !== shuttleVersion
  ) {
    globalThis.samvadShuttleProController = new ShuttleProController();
  }

  return globalThis.samvadShuttleProController;
}

export function ensureShuttleProStarted() {
  const controller = getShuttleProController();

  if (controller.enabled && !controller.running) {
    controller.start();
  }

  return controller.getStatus();
}
