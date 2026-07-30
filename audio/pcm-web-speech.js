(function attachCybergirlAudio(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CybergirlAudio = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCybergirlAudio(root) {
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
      this.recognitionWatchdogMs = Number(options.recognitionWatchdogMs || 4500);
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
      this.recognitionFallbackUsed = false;
      this.pendingSystemFallback = false;
      this.recognitionBlocked = false;
      this.audioRoute = "windows-system-voice";
      this.restartTimer = null;
      this.startWatchdog = null;
      this.restartAttempt = 0;
      this.recognitionGeneration = 0;
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
        scope.navigator?.mediaDevices?.getUserMedia
        && (scope.AudioContext || scope.webkitAudioContext)
        && scope.AudioWorkletNode
      );
    }

    static speechSupported(scope = root) {
      return Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition);
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
        audioRoute: this.audioRoute,
        speechAvailable: PcmWebSpeechEngine.speechSupported(root),
        pcm: { ...this.telemetry },
        recoveryAttempts: this.recoveryAttempts
      };
    }

    async enumerateInputs() {
      if (!root.navigator?.mediaDevices?.enumerateDevices) return [];
      const devices = await root.navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === "audioinput")
        .sort((left, right) => windowsVoiceInputScore(right) - windowsVoiceInputScore(left))
        .map((device, index) => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Microphone ${index + 1}`,
          route: windowsVoiceRoute(device)
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
      this.recognitionFallbackUsed = false;
      this.pendingSystemFallback = false;
      this.recognitionBlocked = false;
      this.signalCandidateFrames = 0;
      this.signalVerified = false;
      this.openedAt = now();
      this.emitState("requesting");
      try {
        await this.openSharedTrack();
        this.startRecognition().catch((error) => this.reportSpeechError(error));
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
      this.recognitionBlocked = false;
      this.pendingSystemFallback = false;
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
      let openedWithAutomaticRoute = !this.deviceId;
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
        openedWithAutomaticRoute = true;
        this.stream = await root.navigator.mediaDevices.getUserMedia({
          audio: microphoneConstraints("", supported, this.profile),
          video: false
        });
      }

      if (openedWithAutomaticRoute) {
        const devices = await root.navigator.mediaDevices.enumerateDevices?.() || [];
        const preferred = selectWindowsVoiceInput(devices);
        const currentDeviceId = this.stream.getAudioTracks()[0]?.getSettings?.().deviceId || "";
        if (
          preferred?.deviceId
          && preferred.deviceId !== "default"
          && preferred.deviceId !== currentDeviceId
        ) {
          try {
            const preferredStream = await root.navigator.mediaDevices.getUserMedia({
              audio: microphoneConstraints(preferred.deviceId, supported, this.profile),
              video: false
            });
            for (const oldTrack of this.stream.getTracks()) oldTrack.stop();
            this.stream = preferredStream;
            this.deviceId = preferred.deviceId;
            this.onLog(`Windows System Voice đã chọn ${preferred.label}.`);
          } catch (error) {
            this.onLog(
              `Không khóa được ${preferred.label}; tiếp tục dùng microphone mặc định của Windows.`
            );
          }
        }
      }

      this.track = this.stream.getAudioTracks()[0];
      if (!this.track || this.track.readyState !== "live") {
        throw new Error("Windows không trả về MediaStreamTrack âm thanh đang hoạt động.");
      }
      const trackSettings = this.track.getSettings?.() || {};
      this.deviceId = trackSettings.deviceId || this.deviceId;
      this.audioRoute = windowsVoiceRoute({
        deviceId: this.deviceId,
        label: this.track.label
      });
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
        route: this.audioRoute,
        settings: sanitizeSettings(trackSettings)
      });
      this.onLog(
        `${this.audioRoute === "windows-realtek" ? "Realtek Windows Voice" : "Windows System Voice"}: `
        + `${this.track.label || "micro mặc định"} · `
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
      if (!Recognition) {
        const error = speechError(
          "Edge hiện không cung cấp Web Speech; PCM Realtek vẫn đang hoạt động."
        );
        this.recognitionState = "unavailable";
        this.emitState("speech-unavailable", { error: error.message });
        this.onError(error);
        return false;
      }
      const recognition = new Recognition();
      this.recognition = recognition;
      recognition.lang = this.language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      // vi-VN chưa nằm trong danh sách model on-device của Edge 150; để false
      // giúp Edge/Windows tự chọn dịch vụ nền tảng hiện có.
      if ("processLocally" in recognition) recognition.processLocally = false;

      recognition.onstart = () => {
        this.restartAttempt = 0;
        this.recognitionState = "recognizer-ready";
        this.emitState("recognizer-ready");
      };
      recognition.onaudiostart = () => {
        clearTimeout(this.startWatchdog);
        this.recognitionState = "audio-open";
        this.emitState("armed", { trackMode: this.recognitionTrackMode });
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
        const receivedAt = Date.now();
        const segments = [];
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const alternative = event.results[index][0];
          const text = String(alternative?.transcript || "").trim();
          if (!text) continue;
          const segmentConfidence = Number(alternative.confidence || 0);
          const final = Boolean(event.results[index].isFinal);
          confidence = Math.max(confidence, segmentConfidence);
          segments.push({
            id: `${this.recognitionGeneration}-${index}`,
            text,
            final,
            speechFinal: final,
            generation: this.recognitionGeneration,
            resultIndex: index,
            receivedAt,
            confidence: segmentConfidence
          });
          if (final) finalText += `${text} `;
          else interimText += `${text} `;
        }
        this.onResult({
          finalText: finalText.trim(),
          interimText: interimText.trim(),
          confidence,
          generation: this.recognitionGeneration,
          resultIndex: event.resultIndex,
          receivedAt,
          segments
        });
      };
      recognition.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        const error = speechError(edgeErrorMessage(event.error));
        if (
          ["audio-capture", "network"].includes(event.error)
          && !this.recognitionFallbackUsed
          && this.recognitionTrackMode.startsWith("shared-")
        ) {
          this.pendingSystemFallback = true;
        }
        if (
          ["not-allowed", "service-not-allowed", "language-not-supported", "language-unavailable"]
            .includes(event.error)
        ) {
          this.recognitionBlocked = true;
        }
        clearTimeout(this.startWatchdog);
        this.recognitionState = "error";
        this.emitState("speech-error", { error: error.message, code: event.error });
        this.onError(error);
      };
      recognition.onend = () => {
        this.recognitionState = "ended";
        if (this.pendingSystemFallback && this.shouldRun) {
          this.pendingSystemFallback = false;
          this.recognitionFallbackUsed = true;
          this.emitState("speech-fallback", {
            trackMode: "windows-system-voice",
            reason: "Edge không nhận track trực tiếp"
          });
          this.restartTimer = setTimeout(() => {
            this.safeStartRecognition("fallback", true).catch(
              (error) => this.reportSpeechError(error)
            );
          }, 160);
          return;
        }
        if (this.shouldRun && !this.recognitionBlocked) this.scheduleRestart();
      };

      await this.safeStartRecognition("initial");
      this.armRecognitionWatchdog();
      return true;
    }

    async safeStartRecognition(reason, forceSystemVoice = false) {
      if (!this.track || this.track.readyState !== "live" || this.track.muted) {
        throw new Error("Track microphone dùng chung không còn hoạt động.");
      }
      try {
        this.recognitionGeneration += 1;
        if (forceSystemVoice || this.recognitionFallbackUsed) {
          this.recognitionTrackMode = "windows-system-voice";
          this.recognition.start();
          this.armRecognitionWatchdog();
          return true;
        }
        this.recognitionTrackMode = this.deviceId
          ? "shared-selected-track"
          : "shared-default-track";
        this.recognition.start(this.track);
        return true;
      } catch (error) {
        if (error.name === "InvalidStateError" && reason === "restart") return false;
        if (["TypeError", "NotSupportedError"].includes(error.name)) {
          this.recognitionFallbackUsed = true;
          this.recognitionTrackMode = "windows-system-voice";
          this.onLog(
            "Edge chưa nhận start(audioTrack); chuyển Web Speech sang Windows System Voice."
          );
          this.recognition.start();
          this.armRecognitionWatchdog();
          return true;
        }
        throw speechError(`Không khởi động được Edge Web Speech: ${error.message}`);
      }
    }

    armRecognitionWatchdog() {
      clearTimeout(this.startWatchdog);
      this.startWatchdog = setTimeout(() => {
        if (!this.shouldRun || this.recognitionState === "audio-open") return;
        if (!this.recognitionFallbackUsed && this.recognitionTrackMode.startsWith("shared-")) {
          this.pendingSystemFallback = true;
          this.emitState("speech-fallback", {
            trackMode: "windows-system-voice",
            reason: "Web Speech không mở track trong thời gian cho phép"
          });
          try {
            this.recognition.abort();
          } catch (error) {
            this.pendingSystemFallback = false;
            this.reportSpeechError(error);
          }
          return;
        }
        this.reportSpeechError(speechError(
          "Windows Voice chưa khởi động Web Speech; PCM Realtek vẫn đang hoạt động."
        ));
      }, this.recognitionWatchdogMs);
    }

    reportSpeechError(error) {
      const normalized = error?.scope === "speech"
        ? error
        : speechError(error?.message || String(error));
      this.recognitionState = "error";
      this.emitState("speech-error", { error: normalized.message });
      this.onError(normalized);
    }

    scheduleRestart() {
      clearTimeout(this.restartTimer);
      const delay = Math.min(2200, 220 + this.restartAttempt * 260);
      this.restartAttempt += 1;
      this.emitState("reconnecting", { attempt: this.restartAttempt, delay });
      this.restartTimer = setTimeout(async () => {
        if (!this.shouldRun || !this.recognition) return;
        try {
          const started = await this.safeStartRecognition(
            "restart",
            this.recognitionFallbackUsed
          );
          if (!started) this.scheduleRestart();
        } catch (error) {
          this.reportSpeechError(error);
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

  function windowsVoiceInputScore(device) {
    if (device?.kind && device.kind !== "audioinput") return Number.NEGATIVE_INFINITY;
    const label = String(device?.label || "").toLocaleLowerCase("vi-VN");
    const deviceId = String(device?.deviceId || "").toLocaleLowerCase("vi-VN");
    let score = 0;
    if (/(stereo mix|what u hear|loopback|speaker|output|đầu ra)/u.test(label)) score -= 500;
    if (/realtek/u.test(label)) score += 220;
    if (/(microphone array|mic array|mảng mic|micrô mảng)/u.test(label)) score += 80;
    if (/(microphone|micrô|micro)/u.test(label)) score += 45;
    if (/(communications|giao tiếp)/u.test(label) || deviceId === "communications") score += 35;
    if (/(default|mặc định)/u.test(label) || deviceId === "default") score += 20;
    return score;
  }

  function selectWindowsVoiceInput(devices) {
    const inputs = Array.from(devices || [])
      .filter((device) => device.kind === "audioinput")
      .sort((left, right) => windowsVoiceInputScore(right) - windowsVoiceInputScore(left));
    return inputs.find((device) => windowsVoiceInputScore(device) > -100) || inputs[0] || null;
  }

  function windowsVoiceRoute(device) {
    return /realtek/u.test(String(device?.label || "").toLocaleLowerCase("vi-VN"))
      ? "windows-realtek"
      : "windows-system-voice";
  }

  function speechError(message) {
    const error = new Error(message);
    error.scope = "speech";
    return error;
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
    windowsVoiceInputScore,
    selectWindowsVoiceInput,
    windowsVoiceRoute,
    edgeErrorMessage
  };
}));
