import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {
  PcmWebSpeechEngine,
  TARGET_SAMPLE_RATE,
  TARGET_CHANNELS,
  PACKET_MS,
  pcm16FromFloat,
  microphoneConstraints,
  windowsVoiceInputScore,
  selectWindowsVoiceInput,
  windowsVoiceRoute,
  edgeErrorMessage
} = require("../audio/pcm-web-speech.js");

test("hợp đồng PCM chung cố định s16le 16 kHz mono 20 ms", () => {
  assert.equal(TARGET_SAMPLE_RATE, 16000);
  assert.equal(TARGET_CHANNELS, 1);
  assert.equal(PACKET_MS, 20);
  assert.deepEqual(
    [...pcm16FromFloat(new Float32Array([-1, -0.5, 0, 0.5, 1]))],
    [-32768, -16384, 0, 16384, 32767]
  );
});

test("ràng buộc microphone giữ thiết bị Windows đã chọn", () => {
  const constraints = microphoneConstraints(
    "device-vi",
    {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: true,
      latency: true
    },
    "processed"
  );
  assert.deepEqual(constraints.deviceId, { exact: "device-vi" });
  assert.deepEqual(constraints.channelCount, { ideal: 1 });
  assert.deepEqual(constraints.sampleRate, { ideal: 48000 });
  assert.equal(constraints.echoCancellation.ideal, true);

  const compatibility = microphoneConstraints("", { echoCancellation: true }, "compatibility");
  assert.equal(compatibility.echoCancellation.ideal, false);
});

test("PCM hoạt động độc lập với Web Speech", () => {
  const scope = {
    AudioContext: class {},
    AudioWorkletNode: class {},
    navigator: { mediaDevices: { getUserMedia() {} } }
  };
  assert.equal(PcmWebSpeechEngine.supported(scope), true);
  assert.equal(PcmWebSpeechEngine.speechSupported(scope), false);
  scope.SpeechRecognition = class {};
  assert.equal(PcmWebSpeechEngine.speechSupported(scope), true);
  delete scope.AudioWorkletNode;
  assert.equal(PcmWebSpeechEngine.supported(scope), false);
});

test("Windows System Voice ưu tiên microphone Realtek và loại Stereo Mix", () => {
  const devices = [
    { kind: "audioinput", deviceId: "stereo", label: "Stereo Mix (Realtek Audio)" },
    { kind: "audioinput", deviceId: "usb", label: "USB Microphone" },
    {
      kind: "audioinput",
      deviceId: "realtek-array",
      label: "Microphone Array (Realtek(R) Audio)"
    }
  ];
  assert.equal(selectWindowsVoiceInput(devices).deviceId, "realtek-array");
  assert.ok(windowsVoiceInputScore(devices[2]) > windowsVoiceInputScore(devices[1]));
  assert.equal(windowsVoiceRoute(devices[2]), "windows-realtek");
});

test("microphone PCM mở ngay cả khi Web Speech chưa phát audiostart", async () => {
  const previous = new Map();
  const remember = (name) => {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  };
  for (const name of [
    "navigator",
    "SpeechRecognition",
    "webkitSpeechRecognition",
    "AudioContext",
    "webkitAudioContext",
    "AudioWorkletNode"
  ]) remember(name);

  let trackStopped = false;
  const recognitionStarts = [];
  const track = {
    kind: "audio",
    readyState: "live",
    muted: false,
    label: "Microphone Array (Realtek(R) Audio)",
    contentHint: "",
    addEventListener() {},
    stop() { trackStopped = true; },
    getSettings() {
      return { deviceId: "realtek-array", sampleRate: 48000, channelCount: 2 };
    }
  };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track]
  };
  class FakeRecognition {
    start(audioTrack) {
      recognitionStarts.push(audioTrack);
    }
    abort() {
      setTimeout(() => this.onend?.(), 0);
    }
  }
  const node = () => ({ connect() {}, disconnect() {} });
  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.destination = {};
      this.audioWorklet = { addModule: async () => {} };
    }
    createMediaStreamSource() { return node(); }
    createGain() { return { ...node(), gain: { value: 1 } }; }
    async close() { this.state = "closed"; }
  }
  class FakeAudioWorkletNode {
    constructor() {
      this.port = { onmessage: null };
    }
    connect() {}
    disconnect() {}
  }

  try {
    Object.defineProperties(globalThis, {
      navigator: {
        configurable: true,
        value: {
          mediaDevices: {
            getSupportedConstraints: () => ({}),
            getUserMedia: async () => stream,
            enumerateDevices: async () => []
          }
        }
      },
      SpeechRecognition: { configurable: true, value: FakeRecognition },
      webkitSpeechRecognition: { configurable: true, value: undefined },
      AudioContext: { configurable: true, value: FakeAudioContext },
      webkitAudioContext: { configurable: true, value: undefined },
      AudioWorkletNode: { configurable: true, value: FakeAudioWorkletNode }
    });
    const engine = new PcmWebSpeechEngine({ recognitionWatchdogMs: 10 });
    const result = await engine.start({ deviceId: "realtek-array" });
    assert.equal(result.listening, true);
    assert.equal(result.audioRoute, "windows-realtek");
    assert.equal(result.trackReadyState, "live");
    assert.equal(recognitionStarts.length, 1);
    assert.equal(recognitionStarts[0], track);
    assert.equal(trackStopped, false);
    await new Promise((resolve) => setTimeout(resolve, 210));
    assert.equal(recognitionStarts.length, 2);
    assert.equal(recognitionStarts[1], undefined);
    assert.equal(trackStopped, false);
    await engine.stop({ commit: false });
    assert.equal(trackStopped, true);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test("lỗi Edge được Việt hóa rõ nguyên nhân", () => {
  assert.match(edgeErrorMessage("not-allowed"), /quyền microphone/u);
  assert.match(edgeErrorMessage("network"), /dịch vụ nhận dạng/u);
  assert.match(edgeErrorMessage("language-unavailable"), /tiếng Việt/u);
});

test("AudioWorklet resample 48 kHz thành gói PCM16 16 kHz", async () => {
  const messages = [];
  let ProcessorClass;
  const context = vm.createContext({
    Int16Array,
    Math,
    Number,
    sampleRate: 48000,
    currentFrame: 0,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {
          postMessage(message) {
            messages.push(message);
          }
        };
      }
    },
    registerProcessor(name, constructor) {
      assert.equal(name, "cybergirl-pcm16");
      ProcessorClass = constructor;
    }
  });
  const source = await readFile(
    new URL("../audio/pcm16-processor.js", import.meta.url),
    "utf8"
  );
  vm.runInContext(source, context);
  const processor = new ProcessorClass({
    processorOptions: { targetSampleRate: 16000, packetMs: 20 }
  });

  for (let block = 0; block < 15; block += 1) {
    context.currentFrame = block * 128;
    const channel = new Float32Array(128);
    for (let index = 0; index < channel.length; index += 1) {
      const frame = block * 128 + index;
      channel[index] = 0.1 * Math.sin(2 * Math.PI * 440 * frame / 48000);
    }
    const keepAlive = processor.process(
      [[channel]],
      [[new Float32Array(channel.length)]]
    );
    assert.equal(keepAlive, true);
  }

  assert.equal(messages.length, 2);
  for (const packet of messages) {
    assert.equal(packet.format, "s16le");
    assert.equal(packet.sampleRate, 16000);
    assert.equal(packet.channelCount, 1);
    assert.equal(packet.buffer.byteLength, 320 * Int16Array.BYTES_PER_ELEMENT);
    assert.ok(packet.rms > 0.05);
    assert.ok(packet.peak <= 0.101);
  }
});
