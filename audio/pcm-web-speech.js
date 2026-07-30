(function attachCybergirlAudio(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CybergirlAudio = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCybergirlAudio() {
  "use strict";

  const TARGET_SAMPLE_RATE = 16000;
  const TARGET_CHANNELS = 1;
  const PACKET_MS = 20;

  class PcmWebSpeechEngine {
    constructor(options = {}) {
      this.workletUrl = options.workletUrl || "audio/pcm16-processor.js";
      this.language = options.language || "vi-VN";
      this.signalFloor = Number(options.signalFloor || 0.00025);
      this.onState = options.onState || (() => {});
      this.onPcm = options.onPcm || (() => {});
      this.onResult = options.onResult || (() => {});
      this.onSpeechStart = options.onSpeechStart || (() => {});
      this.onSpeechEnd = options.onSpeechEnd || (() => {});
      this.onError = options.onError || (() => {});
      this.onLog = options.onLog || (() => {});
      this.stream = null;
      this.track = null;
      this.context = null;
      this.source = null;
      this.worklet = null;
      this.silentGain = null;
      this.recognition = null;
      this.listening = false;
      this.shouldRun = false;
      this.profile = "processed";
      this.deviceId = "";
      this.recognitionTrackMode = "none";
      this.recognitionState = "idle";
      this.restartTimer = null;
      this.startWatchdog = null;
      this.restartAttempt = 0;
      this.recoveryAttempts = 0;
      this.recoveryInProgress = false;
      this.signalCandidateFrames = 0;
      this.signalVerified = false;
      this.openedAt = 0;
      this.telemetry = {
        sequence: -1,
        sampleRate: TARGET_SAMPLE_RATE,
        channelCount: TARGET_CHANNELS,
        format: "s16le",
        rms: 0,
        peak: 0,
        signalVerified: false
      };
    }

    static supported(scope = root) {
      return Boolean(
        (scope.SpeechRecognition || scope.webkitSpeechRecognition)
        && scope.navigator?.mediaDevices?.getUserMedia
        && (scope.AudioContext || scope.webkitAudioContext)
        && scope.AudioWorkletNode
      );
    }

    snapshot() {
      return {
        listening: this.listening,
        profile: this.profile,
        deviceId: this.deviceId,
        recognitionState: this.recognitionState,
        recognitionTrackMode: this.recognitionTrackMode,
        trackReadyState: this.track?.readyState || "ended",
        trackMuted: Boolean(this.track?.muted),
        trackLabel: this.track?.label || "",
        inputSampleRate: this.track?.getSettings?.().sampleRate || 0,
        pcm: { ...this.telemetry },
        recoveryAttempts: this.recoveryAttempts
      };
    }

    async enumerateInputs() {
      if (!root.navigator?.mediaDevices?.enumerateDevices) return [];
      const devices = await root.navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Microphone ${index + 1}`
        }));
    }

    async start(options = {}) {
      if (this.listening) return this.snapshot();
      if (!PcmWebSpeechEngine.supported(root)) {
        throw new Error(
          "Microsoft Edge chưa cung cấp đủ Web Speech, getUserMedia và AudioWorklet."
        );
      }
      this.deviceId = String(options.deviceId || this.deviceId || "");
      this.profile = options.profile || this.profile || "processed";
      this.language = options.language || this.language || "vi-VN";
      this.shouldRun = true;
      this.listening = true;
      this.signalCandidateFrames = 0;
      this.signalVerified = false;
      this.openedAt = now();
      this.emitState("requesting");
      try {
        await this.openSharedTrack();
        await this.startRecognition();
        return this.snapshot();
      } catch (error) {
        this.shouldRun = false;
        this.listening = false;
        await this.releaseAudio();
        this.emitState("error", { error: error.message });
        this.onError(error);
        throw error;
      }
    }

    async stop(options = {}) {
      this.shouldRun = false;
      this.listening = false;
      clearTimeout(this.restartTimer);
      clearTimeout(this.startWatchdog);
      this.disposeRecognition();
      if (options.commit !== false) this.onSpeechEnd({ reason: "manual-stop" });
      await this.releaseAudio();
      this.recognitionState = "idle";
      this.recognitionTrackMode = "none";
      this.emitState("idle");
    }

    async recoverInput(options = {}) {
      if (this.recoveryInProgress) return this.snapshot();
      this.recoveryInProgress = true;
      this.recoveryAttempts += 1;
      const nextProfile = options.profile
        || (this.profile === "processed" ? "compatibility" : "processed");
      const selectedDevice = this.deviceId;
      this.emitState("recovering", {
        profile: nextProfile,
        attempt: this.recoveryAttempts,
        manual: Boolean(options.manual)
      });
      try {
        await this.stop({ commit: false });
        this.profile = nextProfile;
        return await this.start({
          deviceId: selectedDevice,
          profile: nextProfile,
          language: this.language
        });
      } finally {
        this.recoveryInProgress = false;
      }
    }

    async openSharedTrack() {
      const supported = root.navigator.mediaDevices.getSupportedConstraints?.() || {};
      const constraints = microphoneConstraints(this.deviceId, supported, this.profile);
      try {
        this.stream = await root.navigator.mediaDevices.getUserMedia({
          audio: constraints,
          video: false
        });
      } catch (error) {
        if (
          !this.deviceId
          || !["OverconstrainedError", "NotFoundError"].includes(error.name)
        ) throw error;
        this.onLog("Thiết bị đã lưu không còn tồn tại; dùng microphone mặc định.");
        this.deviceId = "";
        this.stream = await root.navigator.mediaDevices.getUserMedia({
          audio: microphoneConstraints("", supported, this.profile),
          video: false
        });
      }
      this.track = this.stream.getAudioTracks()[0];
      if (!this.track || this.track.readyState !== "live") {
        throw new Error("Windows không trả về MediaStreamTrack âm thanh đang hoạt động.");
      }
      try {
        this.track.contentHint = "speech-recognition";
      } catch {
        try { this.track.contentHint = "speech"; } catch { /* Edge cũ */ }
      }
      this.track.addEventListener?.("ended", () => {
        if (!this.shouldRun) return;
        this.shouldRun = false;
        this.listening = false;
        const error = new Error("Microphone đã bị Windows hoặc thiết bị ngắt kết nối.");
        this.emitState("error", { error: error.message });
        this.onError(error);
      });
      this.track.addEventListener?.("mute", () => this.emitState("muted"));
      this.track.addEventListener?.("unmute", () => this.emitState("track-live"));

      const Context = root.AudioContext || root.webkitAudioContext;
      this.context = new Context({ latencyHint: "interactive" });
      if (this.context.state === "suspended") await this.context.resume();
      await this.context.audioWorklet.addModule(this.workletUrl);
      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = new root.AudioWorkletNode(this.context, "cybergirl-pcm16", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          targetSampleRate: TARGET_SAMPLE_RATE,
          packetMs: PACKET_MS
        }
      });
      this.silentGain = this.context.createGain();
      this.silentGain.gain.value = 0;
      this.worklet.port.onmessage = (event) => this.handlePcmPacket(event.data);
      this.source.connect(this.worklet);
      this.worklet.connect(this.silentGain);
      this.silentGain.connect(this.context.destination);
      this.emitState("track-live", {
        label: this.track.label || "Microphone",
        settings: sanitizeSettings(this.track.getSettings?.() || {})
      });
      this.onLog(
        `Track dùng chung: ${this.track.label || "micro mặc định"} · `
        + `${this.track.getSettings?.().sampleRate || "?"} Hz → PCM16 16000 Hz mono`
      );
    }

    async releaseAudio() {
      if (this.worklet?.port) this.worklet.port.onmessage = null;
      for (const node of [this.source, this.worklet, this.silentGain]) {
        try { node?.disconnect(); } catch { /* đã ngắt */ }
      }
      for (const mediaTrack of this.stream?.getTracks?.() || []) mediaTrack.stop();
      if (this.context && this.context.state !== "closed") {
        try { await this.context.close(); } catch { /* Edge đang đóng */ }
      }
      this.stream = null;
      this.track = null;
      this.context = null;
      this.source = null;
      this.worklet = null;
      this.silentGain = null;
      this.signalCandidateFrames = 0;
      this.signalVerified = false;
    }

    handlePcmPacket(packet) {
      if (packet?.type !== "pcm16") return;
      const rms = Number(packet.rms || 0);
      const peak = Number(packet.peak || 0);
      if (rms >= this.signalFloor && peak >= this.signalFloor * 1.8) {
        this.signalCandidateFrames += 1;
      } else {
        this.signalCandidateFrames = 0;
      }
      if (!this.signalVerified && this.signalCandidateFrames >= 3) {
        this.signalVerified = true;
        this.emitState("signal-verified", { rms, peak });
        this.onLog(`PCM16 thật đã xác minh · RMS ${rms.toFixed(5)} · peak ${peak.toFixed(5)}`);
      }
      this.telemetry = {
        sequence: Number(packet.sequence),
        sampleRate: Number(packet.sampleRate),
        channelCount: Number(packet.channelCount),
        format: packet.format,
        rms,
        peak,
        timestamp: Number(packet.timestamp),
        byteLength: packet.buffer?.byteLength || 0,
        signalVerified: this.signalVerified
      };
      this.onPcm({ ...this.telemetry, buffer: packet.buffer });

      if (
        this.listening
        && ["audio-open", "recognizing"].includes(this.recognitionState)
        && !this.signalVerified
        && !this.recoveryInProgress
        && this.recoveryAttempts === 0
        && now() - this.openedAt > 3500
      ) {
        this.recoverInput().catch((error) => {
          this.emitState("no-signal", { error: error.message });
          this.onError(error);
        });
      }
    }

    async startRecognition() {
      const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
      const recognition = new Recognition();
      this.recognition = recognition;
      recognition.lang = this.language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      // vi-VN chưa nằm trong danh sách model on-device của Edge 150; để false
      // giúp Edge/Windows tự chọn dịch vụ nền tảng hiện có.
      if ("processLocally" in recognition) recognition.processLocally = false;

      const ready = deferred();
      recognition.onstart = () => {
        this.restartAttempt = 0;
        this.recognitionState = "recognizer-ready";
        this.emitState("recognizer-ready");
      };
      recognition.onaudiostart = () => {
        clearTimeout(this.startWatchdog);
        this.recognitionState = "audio-open";
        this.emitState("armed", { trackMode: this.recognitionTrackMode });
        ready.resolve(this.snapshot());
      };
      recognition.onspeechstart = () => {
        this.recognitionState = "recognizing";
        this.emitState("recognizing");
        this.onSpeechStart({ source: "web-speech" });
      };
      recognition.onspeechend = () => {
        this.recognitionState = "audio-open";
        this.emitState("armed", { trackMode: this.recognitionTrackMode });
        this.onSpeechEnd({ source: "web-speech" });
      };
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        let confidence = 0;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const alternative = event.results[index][0];
          const text = String(alternative?.transcript || "").trim();
          if (!text) continue;
          confidence = Math.max(confidence, Number(alternative.confidence || 0));
          if (event.results[index].isFinal) finalText += `${text} `;
          else interimText += `${text} `;
        }
        this.onResult({
          finalText: finalText.trim(),
          interimText: interimText.trim(),
          confidence
        });
      };
      recognition.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        const error = new Error(edgeErrorMessage(event.error));
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
          this.shouldRun = false;
          this.listening = false;
          this.recognitionState = "error";
        }
        clearTimeout(this.startWatchdog);
        ready.reject(error);
        this.emitState("error", { error: error.message, code: event.error });
        this.onError(error);
      };
      recognition.onend = () => {
        this.recognitionState = "ended";
        if (this.shouldRun) this.scheduleRestart();
      };

      this.startWatchdog = setTimeout(() => {
        const error = new Error(
          "Edge Web Speech không mở audio sau 8 giây. Kiểm tra quyền micro và policy SpeechRecognitionEnabled."
        );
        ready.reject(error);
        this.emitState("error", { error: error.message });
      }, 8000);
      await this.safeStartRecognition("initial");
      return ready.promise;
    }

    async safeStartRecognition(reason) {
      if (!this.track || this.track.readyState !== "live" || this.track.muted) {
        throw new Error("Track microphone dùng chung không còn hoạt động.");
      }
      try {
        this.recognitionTrackMode = this.deviceId
          ? "shared-selected-track"
          : "shared-default-track";
        this.recognition.start(this.track);
        return true;
      } catch (error) {
        if (error.name === "InvalidStateError" && reason === "restart") return false;
        if (["TypeError", "NotSupportedError"].includes(error.name)) {
          if (this.deviceId) {
            throw new Error(
              "Edge này chưa nhận track microphone đã chọn. Hãy dùng thiết bị mặc định của Windows."
            );
          }
          this.recognitionTrackMode = "edge-default-fallback";
          this.onLog("Edge chưa nhận start(audioTrack); dùng microphone mặc định của Windows.");
          this.recognition.start();
          return true;
        }
        throw new Error(`Không khởi động được Edge Web Speech: ${error.message}`);
      }
    }

    scheduleRestart() {
      clearTimeout(this.restartTimer);
      const delay = Math.min(2200, 220 + this.restartAttempt * 260);
      this.restartAttempt += 1;
      this.emitState("reconnecting", { attempt: this.restartAttempt, delay });
      this.restartTimer = setTimeout(async () => {
        if (!this.shouldRun || !this.recognition) return;
        try {
          const started = await this.safeStartRecognition("restart");
          if (!started) this.scheduleRestart();
        } catch (error) {
          this.onError(error);
          this.scheduleRestart();
        }
      }, delay);
    }

    disposeRecognition() {
      clearTimeout(this.restartTimer);
      clearTimeout(this.startWatchdog);
      if (!this.recognition) return;
      const recognition = this.recognition;
      recognition.onstart = null;
      recognition.onaudiostart = null;
      recognition.onspeechstart = null;
      recognition.onspeechend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort?.(); } catch { /* chưa chạy */ }
      this.recognition = null;
    }

    emitState(state, detail = {}) {
      this.onState({
        state,
        recognitionState: this.recognitionState,
        trackMode: this.recognitionTrackMode,
        profile: this.profile,
        ...detail
      });
    }
  }

  function microphoneConstraints(deviceId, supported, profile) {
    const constraints = deviceId ? { deviceId: { exact: deviceId } } : {};
    constraints.channelCount = { ideal: TARGET_CHANNELS };
    const processed = profile !== "compatibility";
    for (const name of ["echoCancellation", "noiseSuppression", "autoGainControl"]) {
      if (supported[name]) constraints[name] = { ideal: processed };
    }
    if (supported.sampleRate) constraints.sampleRate = { ideal: 48000 };
    if (supported.latency) constraints.latency = { ideal: 0.01 };
    return constraints;
  }

  function sanitizeSettings(settings) {
    return {
      deviceId: settings.deviceId,
      groupId: settings.groupId,
      channelCount: settings.channelCount,
      sampleRate: settings.sampleRate,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl
    };
  }

  function edgeErrorMessage(code) {
    return {
      "not-allowed": "Edge đang chặn quyền microphone.",
      "service-not-allowed": "Dịch vụ Web Speech bị policy Edge/Windows chặn.",
      "audio-capture": "Edge không lấy được âm thanh từ microphone đã chọn.",
      "network": "Web Speech không kết nối được dịch vụ nhận dạng tiếng Việt.",
      "language-not-supported": "Web Speech chưa hỗ trợ ngôn ngữ vi-VN.",
      "language-unavailable": "Model/dịch vụ tiếng Việt của Edge chưa sẵn sàng."
    }[code] || `Edge Web Speech: ${code}`;
  }

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function now() {
    return root.performance?.now?.() || Date.now();
  }

  function pcm16FromFloat(samples) {
    const output = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const value = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
      output[index] = value < 0
        ? Math.round(value * 0x8000)
        : Math.round(value * 0x7fff);
    }
    return output;
  }

  return {
    PcmWebSpeechEngine,
    TARGET_SAMPLE_RATE,
    TARGET_CHANNELS,
    PACKET_MS,
    pcm16FromFloat,
    microphoneConstraints,
    edgeErrorMessage
  };
}));
