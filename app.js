(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const ui = {
    imageInput: $("#imageInput"),
    audioInput: $("#audioInput"),
    dropZone: $("#dropZone"),
    sampleButton: $("#sampleButton"),
    calibrateButton: $("#calibrateButton"),
    mouthSize: $("#mouthSize"),
    mouthSizeValue: $("#mouthSizeValue"),
    speechText: $("#speechText"),
    voiceSelect: $("#voiceSelect"),
    rate: $("#rate"),
    pitch: $("#pitch"),
    rateValue: $("#rateValue"),
    pitchValue: $("#pitchValue"),
    speakButton: $("#speakButton"),
    stopButton: $("#stopButton"),
    audioPlayer: $("#audioPlayer"),
    micButton: $("#micButton"),
    micOrb: $("#micOrb"),
    micTitle: $("#micTitle"),
    micHint: $("#micHint"),
    canvas: $("#avatarCanvas"),
    canvasShell: $("#canvasShell"),
    calibrationHint: $("#calibrationHint"),
    capabilityText: $("#capabilityText"),
    stageStatus: $("#stageStatus"),
    stageDetail: $("#stageDetail"),
    liveDot: $("#liveDot"),
    signalLabel: $("#signalLabel"),
    levelBars: $$("#levelMeter i"),
    transcriptText: $("#transcriptText"),
    copyTranscript: $("#copyTranscript"),
    resetButton: $("#resetButton"),
    snapshotButton: $("#snapshotButton"),
    toast: $("#toast")
  };

  const ctx = ui.canvas.getContext("2d", { alpha: false });
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const SAMPLE_IMAGE = "assets/demo-avatar.svg";

  const state = {
    image: new Image(),
    imageUrl: null,
    avatarReady: false,
    mouth: { x: 0.5, y: 0.665, width: 0.2 },
    mouthOpen: 0,
    mouthTarget: 0,
    viseme: "idle",
    calibrating: false,
    activeSignal: "idle",
    analyser: null,
    timeData: null,
    audioContext: null,
    activeSource: null,
    mediaElementSource: null,
    micStream: null,
    recognition: null,
    recognitionShouldRun: false,
    finalTranscript: "",
    speechActive: false,
    ttsTimer: null,
    audioObjectUrl: null,
    level: 0,
    lastActivityAt: 0,
    toastTimer: null
  };

  function showToast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.toggle("error", isError);
    ui.toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 3100);
  }

  function setStage(status, detail, isLive = false) {
    ui.stageStatus.textContent = status;
    ui.stageDetail.textContent = detail;
    ui.liveDot.style.background = isLive ? "#ff698d" : "#34e2bd";
    ui.liveDot.style.boxShadow = isLive
      ? "0 0 12px rgba(255,105,141,.8)"
      : "0 0 12px rgba(52,226,189,.8)";
  }

  function safeFileName(name) {
    return name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "avatar";
  }

  function getStorage() {
    const extensionStorage = globalThis.chrome?.storage?.local;
    if (extensionStorage) {
      return {
        async get(key) {
          const result = await extensionStorage.get(key);
          return result[key];
        },
        async set(key, value) {
          await extensionStorage.set({ [key]: value });
        }
      };
    }

    return {
      async get(key) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : undefined;
      },
      async set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    };
  }

  const storage = getStorage();

  async function savePreferences() {
    try {
      await storage.set("avatarVnPreferences", {
        mouth: state.mouth,
        rate: Number(ui.rate.value),
        pitch: Number(ui.pitch.value)
      });
    } catch (error) {
      console.warn("Không thể lưu tùy chọn:", error);
    }
  }

  async function restorePreferences() {
    try {
      const saved = await storage.get("avatarVnPreferences");
      if (!saved) return;
      if (saved.mouth) {
        state.mouth = {
          x: clamp(Number(saved.mouth.x) || 0.5, 0.05, 0.95),
          y: clamp(Number(saved.mouth.y) || 0.665, 0.1, 0.95),
          width: clamp(Number(saved.mouth.width) || 0.2, 0.1, 0.32)
        };
        ui.mouthSize.value = String(Math.round(state.mouth.width * 100));
        ui.mouthSizeValue.textContent = `${ui.mouthSize.value}%`;
      }
      if (saved.rate) ui.rate.value = String(saved.rate);
      if (saved.pitch) ui.pitch.value = String(saved.pitch);
      updateRangeLabels();
    } catch (error) {
      console.warn("Không thể đọc tùy chọn:", error);
    }
  }

  function detectCapabilities() {
    const capabilities = [
      "speechSynthesis" in window,
      Boolean(SpeechRecognition),
      Boolean(AudioContextClass),
      Boolean(ctx)
    ];
    const total = capabilities.filter(Boolean).length;

    if (total === capabilities.length) {
      ui.capabilityText.textContent = "Đủ TTS · STT · Audio · Canvas";
      return;
    }

    const missing = [];
    if (!capabilities[0]) missing.push("TTS");
    if (!capabilities[1]) missing.push("STT");
    if (!capabilities[2]) missing.push("Audio");
    if (!capabilities[3]) missing.push("Canvas");
    ui.capabilityText.textContent = `Thiếu: ${missing.join(", ")}`;
  }

  function getCoverTransform() {
    const image = state.image;
    const width = image.naturalWidth || image.width || 900;
    const height = image.naturalHeight || image.height || 900;
    const scale = Math.max(ui.canvas.width / width, ui.canvas.height / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    return {
      width,
      height,
      scale,
      drawWidth,
      drawHeight,
      x: (ui.canvas.width - drawWidth) / 2,
      y: (ui.canvas.height - drawHeight) / 2
    };
  }

  function loadImage(source, label = "Ảnh đã chọn") {
    state.image.onload = () => {
      state.avatarReady = true;
      setStage("Sẵn sàng", label);
      showToast("Đã nạp ảnh. Có thể đánh dấu lại vị trí miệng để khớp chính xác.");
    };
    state.image.onerror = () => {
      state.avatarReady = false;
      showToast("Không thể đọc tệp ảnh này.", true);
    };
    state.image.decoding = "async";
    state.image.src = source;
  }

  function useSampleImage(silent = false) {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = null;
    }
    state.mouth = { x: 0.5, y: 0.665, width: Number(ui.mouthSize.value) / 100 };
    state.image.onload = () => {
      state.avatarReady = true;
      setStage("Sẵn sàng", "Ảnh mẫu đã được nạp");
      if (!silent) showToast("Đã khôi phục ảnh mẫu.");
    };
    state.image.src = SAMPLE_IMAGE;
  }

  function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Hãy chọn tệp ảnh JPG, PNG, WebP hoặc GIF.", true);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast("Ảnh lớn hơn 25 MB. Hãy chọn ảnh nhẹ hơn.", true);
      return;
    }
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = URL.createObjectURL(file);
    loadImage(state.imageUrl, `${file.name} · chỉ lưu trên thiết bị`);
  }

  function toggleCalibration(force) {
    state.calibrating = typeof force === "boolean" ? force : !state.calibrating;
    ui.calibrateButton.classList.toggle("active", state.calibrating);
    ui.calibrateButton.textContent = state.calibrating ? "Đang chọn miệng…" : "Đánh dấu miệng";
    ui.calibrationHint.hidden = !state.calibrating;
    ui.canvas.classList.toggle("calibrating", state.calibrating);
    if (state.calibrating) setStage("Hiệu chỉnh", "Bấm chính giữa môi trên ảnh");
    else setStage("Sẵn sàng", "Vị trí miệng đã được lưu");
  }

  function setMouthFromCanvas(event) {
    if (!state.calibrating || !state.avatarReady) return;
    const rect = ui.canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (ui.canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (ui.canvas.height / rect.height);
    const fit = getCoverTransform();
    state.mouth.x = clamp((px - fit.x) / fit.drawWidth, 0.05, 0.95);
    state.mouth.y = clamp((py - fit.y) / fit.drawHeight, 0.08, 0.95);
    toggleCalibration(false);
    savePreferences();
    showToast("Đã đánh dấu tâm miệng.");
  }

  function visemeFromText(text) {
    const value = text.toLocaleLowerCase("vi-VN");
    if (/[mbp]/u.test(value)) return "closed";
    if (/[uưoôơ]/u.test(value)) return "round";
    if (/[aăâeê]/u.test(value)) return "wide";
    if (/[iy]/u.test(value)) return "narrow";
    if (/[fvph]/u.test(value)) return "bite";
    if (/[lntdđ]/u.test(value)) return "tongue";
    return "neutral";
  }

  function visemeShape() {
    switch (state.viseme) {
      case "closed": return { width: 0.94, open: 0.06 };
      case "round": return { width: 0.7, open: 0.78 };
      case "wide": return { width: 1.08, open: 0.68 };
      case "narrow": return { width: 0.83, open: 0.34 };
      case "bite": return { width: 0.94, open: 0.24 };
      case "tongue": return { width: 0.92, open: 0.5 };
      case "neutral": return { width: 0.96, open: 0.46 };
      default: return { width: 1, open: 0 };
    }
  }

  function calculateAudioLevel() {
    if (!state.analyser || !state.timeData || !["audio", "mic"].includes(state.activeSignal)) {
      return 0;
    }
    state.analyser.getByteTimeDomainData(state.timeData);
    let sum = 0;
    for (const value of state.timeData) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / state.timeData.length);
    return clamp((rms - 0.012) * 7.8, 0, 1);
  }

  function updateMeter(level) {
    const lit = Math.round(level * ui.levelBars.length);
    ui.levelBars.forEach((bar, index) => bar.classList.toggle("active", index < lit));
    ui.signalLabel.textContent = state.activeSignal === "idle"
      ? "IDLE"
      : `${state.activeSignal.toUpperCase()} · ${Math.round(level * 100)}%`;
  }

  function drawEmptyStage() {
    const gradient = ctx.createLinearGradient(0, 0, ui.canvas.width, ui.canvas.height);
    gradient.addColorStop(0, "#0a1724");
    gradient.addColorStop(1, "#090b16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx.fillStyle = "#6f8798";
    ctx.textAlign = "center";
    ctx.font = "600 26px Segoe UI, sans-serif";
    ctx.fillText("Chọn một ảnh chân dung để bắt đầu", ui.canvas.width / 2, ui.canvas.height / 2);
  }

  function drawAnimatedMouth(fit, openAmount) {
    const image = state.image;
    const sourceWidth = fit.width * state.mouth.width;
    const sourceHeight = sourceWidth * 0.52;
    const sourceX = state.mouth.x * fit.width;
    const sourceY = state.mouth.y * fit.height;
    const shape = visemeShape();
    const mouthWidth = sourceWidth * fit.scale * shape.width;
    const mouthHeight = sourceHeight * fit.scale;
    const mouthX = fit.x + sourceX * fit.scale;
    const mouthY = fit.y + sourceY * fit.scale;
    const effectiveOpen = clamp(openAmount * (0.58 + shape.open * 0.55), 0, 1);

    if (effectiveOpen < 0.025) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#2a0d18";
      ctx.lineWidth = Math.max(2, mouthHeight * 0.04);
      ctx.beginPath();
      ctx.ellipse(mouthX, mouthY, mouthWidth * 0.31, mouthHeight * 0.035, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const gap = mouthHeight * (0.08 + effectiveOpen * 0.57);
    const clipHeight = mouthHeight * (0.58 + effectiveOpen * 0.48);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, mouthWidth * 0.5, clipHeight * 0.62, 0, 0, Math.PI * 2);
    ctx.clip();

    const innerGradient = ctx.createRadialGradient(
      mouthX,
      mouthY + gap * 0.2,
      2,
      mouthX,
      mouthY + gap * 0.2,
      mouthWidth * 0.46
    );
    innerGradient.addColorStop(0, "#481322");
    innerGradient.addColorStop(0.72, "#250711");
    innerGradient.addColorStop(1, "#100309");
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.ellipse(
      mouthX,
      mouthY + gap * 0.12,
      mouthWidth * (state.viseme === "round" ? 0.3 : 0.43),
      Math.max(4, gap * 0.72),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (effectiveOpen > 0.28) {
      ctx.fillStyle = `rgba(246, 237, 223, ${clamp(0.2 + effectiveOpen * 0.65, 0, 0.85)})`;
      ctx.beginPath();
      ctx.ellipse(
        mouthX,
        mouthY - gap * 0.2,
        mouthWidth * (state.viseme === "round" ? 0.2 : 0.32),
        Math.max(2, gap * 0.14),
        0,
        Math.PI,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = `rgba(205, 80, 99, ${clamp(effectiveOpen * 0.58, 0, 0.55)})`;
      ctx.beginPath();
      ctx.ellipse(mouthX, mouthY + gap * 0.48, mouthWidth * 0.22, gap * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const topSourceX = sourceX - sourceWidth / 2;
    const topSourceY = sourceY - sourceHeight / 2;
    const halfSourceHeight = sourceHeight / 2;
    const targetX = mouthX - mouthWidth / 2;
    const halfTargetHeight = mouthHeight / 2;

    ctx.globalAlpha = 0.96;
    ctx.drawImage(
      image,
      topSourceX,
      topSourceY,
      sourceWidth,
      halfSourceHeight,
      targetX,
      mouthY - halfTargetHeight - gap * 0.23,
      mouthWidth,
      halfTargetHeight
    );
    ctx.drawImage(
      image,
      topSourceX,
      sourceY,
      sourceWidth,
      halfSourceHeight,
      targetX,
      mouthY + gap * 0.33,
      mouthWidth,
      halfTargetHeight
    );

    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#3a0b17";
    ctx.lineWidth = Math.max(2, mouthHeight * 0.045);
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, mouthWidth * 0.42, gap * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCalibrationMarker(fit) {
    if (!state.calibrating) return;
    const x = fit.x + state.mouth.x * fit.drawWidth;
    const y = fit.y + state.mouth.y * fit.drawHeight;
    const radius = Math.max(14, fit.drawWidth * state.mouth.width * 0.5);
    ctx.save();
    ctx.strokeStyle = "rgba(52, 226, 189, .95)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.restore();
  }

  function renderFrame(timestamp) {
    const audioLevel = calculateAudioLevel();
    if (state.activeSignal === "audio" || state.activeSignal === "mic") {
      state.mouthTarget = audioLevel;
      if (audioLevel > 0.08) {
        state.viseme = audioLevel > 0.62 ? "wide" : audioLevel > 0.32 ? "neutral" : "narrow";
        state.lastActivityAt = timestamp;
      } else if (timestamp - state.lastActivityAt > 130) {
        state.viseme = "closed";
      }
    } else if (!state.speechActive) {
      state.mouthTarget = 0;
      state.viseme = "idle";
    }

    state.level += (Math.max(audioLevel, state.speechActive ? state.mouthTarget : 0) - state.level) * 0.22;
    state.mouthOpen += (state.mouthTarget - state.mouthOpen) * (state.mouthTarget > state.mouthOpen ? 0.38 : 0.22);
    updateMeter(state.level);

    if (!state.avatarReady) {
      drawEmptyStage();
      requestAnimationFrame(renderFrame);
      return;
    }

    const fit = getCoverTransform();
    const active = state.activeSignal !== "idle" || state.speechActive;
    const t = timestamp / 1000;
    const bobX = active ? Math.sin(t * 1.8) * 1.5 : Math.sin(t * 0.55) * 0.6;
    const bobY = active ? Math.sin(t * 2.35) * 2.4 : Math.sin(t * 0.8) * 1.2;
    const breath = 1 + Math.sin(t * 1.15) * (active ? 0.0018 : 0.001);

    ctx.fillStyle = "#050a12";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx.save();
    ctx.translate(ui.canvas.width / 2 + bobX, ui.canvas.height / 2 + bobY);
    ctx.scale(breath, breath);
    ctx.translate(-ui.canvas.width / 2, -ui.canvas.height / 2);
    ctx.drawImage(state.image, fit.x, fit.y, fit.drawWidth, fit.drawHeight);
    drawAnimatedMouth(fit, state.mouthOpen);
    ctx.restore();
    drawCalibrationMarker(fit);
    requestAnimationFrame(renderFrame);
  }

  function stopTts(updateStatus = true) {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    state.speechActive = false;
    state.activeSignal = state.activeSignal === "tts" ? "idle" : state.activeSignal;
    state.mouthTarget = 0;
    state.viseme = "idle";
    window.clearInterval(state.ttsTimer);
    state.ttsTimer = null;
    if (updateStatus) setStage("Đã dừng", "Giọng đọc đã dừng");
  }

  function scheduleVietnameseVisemes(text, rate) {
    const units = text.match(/[\p{L}\p{N}]+|[.,!?;:]/gu) || [text];
    let index = 0;
    window.clearInterval(state.ttsTimer);
    const interval = clamp(155 / rate, 75, 250);
    state.ttsTimer = window.setInterval(() => {
      if (!state.speechActive) return;
      const unit = units[index % units.length];
      const punctuation = /^[.,!?;:]$/u.test(unit);
      state.viseme = punctuation ? "closed" : visemeFromText(unit);
      state.mouthTarget = punctuation ? 0.02 : 0.34 + Math.random() * 0.5;
      state.lastActivityAt = performance.now();
      index += 1;
    }, interval);
  }

  function speakText() {
    if (!("speechSynthesis" in window)) {
      showToast("Trình duyệt này không hỗ trợ phát giọng Web Speech.", true);
      return;
    }
    const text = ui.speechText.value.trim();
    if (!text) {
      showToast("Hãy nhập nội dung cần đọc.", true);
      ui.speechText.focus();
      return;
    }

    stopMic(false);
    ui.audioPlayer.pause();
    stopTts(false);

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const selected = voices.find((voice) => voice.voiceURI === ui.voiceSelect.value);
    if (selected) utterance.voice = selected;
    utterance.lang = selected?.lang || "vi-VN";
    utterance.rate = Number(ui.rate.value);
    utterance.pitch = Number(ui.pitch.value);
    utterance.volume = 1;

    utterance.onstart = () => {
      state.speechActive = true;
      state.activeSignal = "tts";
      scheduleVietnameseVisemes(text, utterance.rate);
      setStage("Đang phát giọng", `${selected?.name || "Giọng mặc định"} · ${utterance.lang}`, true);
    };
    utterance.onboundary = (event) => {
      const sample = text.slice(event.charIndex, event.charIndex + Math.max(event.charLength || 1, 4));
      state.viseme = visemeFromText(sample);
      state.mouthTarget = state.viseme === "closed" ? 0.08 : 0.64;
      state.lastActivityAt = performance.now();
    };
    utterance.onend = () => {
      stopTts(false);
      setStage("Hoàn tất", "Đã phát xong nội dung tiếng Việt");
    };
    utterance.onerror = (event) => {
      stopTts(false);
      if (event.error !== "canceled" && event.error !== "interrupted") {
        showToast(`Không thể phát giọng: ${event.error || "lỗi không xác định"}.`, true);
        setStage("Lỗi phát giọng", "Hãy thử một voice khác");
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  function populateVoices() {
    if (!("speechSynthesis" in window)) {
      const unsupportedOption = document.createElement("option");
      unsupportedOption.textContent = "Không hỗ trợ Web Speech TTS";
      ui.voiceSelect.replaceChildren(unsupportedOption);
      ui.voiceSelect.disabled = true;
      return;
    }
    const allVoices = window.speechSynthesis.getVoices();
    if (!allVoices.length) return;

    const voices = [...allVoices].sort((a, b) => {
      const aVi = a.lang.toLowerCase().startsWith("vi") ? 1 : 0;
      const bVi = b.lang.toLowerCase().startsWith("vi") ? 1 : 0;
      const aMs = /microsoft/i.test(a.name) ? 1 : 0;
      const bMs = /microsoft/i.test(b.name) ? 1 : 0;
      return (bVi - aVi) || (bMs - aMs) || a.name.localeCompare(b.name);
    });

    ui.voiceSelect.replaceChildren();
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} — ${voice.lang}${voice.localService ? " · thiết bị" : ""}`;
      ui.voiceSelect.append(option);
    }

    const bestVietnamese = voices.find((voice) => voice.lang.toLowerCase().startsWith("vi"));
    if (bestVietnamese) {
      ui.voiceSelect.value = bestVietnamese.voiceURI;
    } else {
      showToast("Không tìm thấy giọng vi-VN. Có thể cài thêm Vietnamese voice trong Windows Settings.", true);
    }
  }

  async function ensureAudioContext() {
    if (!AudioContextClass) throw new Error("Web Audio API không khả dụng.");
    if (!state.audioContext || state.audioContext.state === "closed") {
      state.audioContext = new AudioContextClass();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 512;
      state.analyser.smoothingTimeConstant = 0.65;
      state.timeData = new Uint8Array(state.analyser.fftSize);
      state.mediaElementSource = null;
    }
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
    return state.audioContext;
  }

  function disconnectActiveSource() {
    if (!state.activeSource) return;
    try {
      state.activeSource.disconnect();
    } catch {
      // The node may already be disconnected.
    }
    state.activeSource = null;
  }

  async function activateAudioFile() {
    stopTts(false);
    await stopMic(false);
    const audioContext = await ensureAudioContext();
    disconnectActiveSource();
    if (!state.mediaElementSource) {
      state.mediaElementSource = audioContext.createMediaElementSource(ui.audioPlayer);
    }
    state.mediaElementSource.connect(state.analyser);
    state.mediaElementSource.connect(audioContext.destination);
    state.activeSource = state.mediaElementSource;
    state.activeSignal = "audio";
    setStage("Đang phát audio", "Khẩu hình bám theo biên độ tệp âm thanh", true);
  }

  function handleAudioFile(file) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      showToast("Hãy chọn một tệp âm thanh hợp lệ.", true);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast("Tệp âm thanh lớn hơn 100 MB.", true);
      return;
    }
    if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
    state.audioObjectUrl = URL.createObjectURL(file);
    ui.audioPlayer.src = state.audioObjectUrl;
    ui.audioPlayer.dataset.fileName = safeFileName(file.name);
    ui.audioPlayer.load();
    setStage("Audio đã sẵn sàng", `${file.name} · phát để nhép môi`);
    showToast("Đã nạp âm thanh cục bộ.");
  }

  async function startMic() {
    if (!SpeechRecognition) {
      showToast("Microsoft Edge trên thiết bị này không cung cấp Speech Recognition.", true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Không thể mở microphone. Hãy chạy dưới dạng Edge Extension hoặc HTTPS.", true);
      return;
    }

    stopTts(false);
    ui.audioPlayer.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      const audioContext = await ensureAudioContext();
      disconnectActiveSource();
      state.micStream = stream;
      state.activeSource = audioContext.createMediaStreamSource(stream);
      state.activeSource.connect(state.analyser);
      state.activeSignal = "mic";
      state.recognitionShouldRun = true;
      state.finalTranscript = "";

      const recognition = new SpeechRecognition();
      recognition.lang = "vi-VN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      state.recognition = recognition;

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) state.finalTranscript += `${text.trim()} `;
          else interim += text;
        }
        const visibleText = `${state.finalTranscript}${interim}`.trim();
        ui.transcriptText.textContent = visibleText || "Đang nghe…";
        if (visibleText) state.viseme = visemeFromText(visibleText.slice(-8));
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        showToast(`Nhận dạng giọng nói: ${event.error}.`, true);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          state.recognitionShouldRun = false;
          stopMic();
        }
      };
      recognition.onend = () => {
        if (state.recognitionShouldRun) {
          window.setTimeout(() => {
            try {
              recognition.start();
            } catch {
              // A restart may race with Edge's internal state.
            }
          }, 220);
        }
      };

      recognition.start();
      ui.micOrb.classList.add("active");
      ui.micTitle.textContent = "Đang nghe tiếng Việt";
      ui.micHint.textContent = "Nói tự nhiên; lời tạm thời xuất hiện ngay.";
      ui.micButton.textContent = "Dừng microphone";
      setStage("Đang nghe", "Microphone + nhận dạng vi-VN", true);
    } catch (error) {
      console.error(error);
      showToast("Edge chưa được cấp quyền microphone. Kiểm tra biểu tượng ổ khóa/quyền của extension.", true);
      setStage("Thiếu quyền microphone", "Cấp quyền rồi thử lại");
    }
  }

  async function stopMic(updateStatus = true) {
    state.recognitionShouldRun = false;
    if (state.recognition) {
      state.recognition.onend = null;
      try {
        state.recognition.stop();
      } catch {
        // Recognition may not have started.
      }
      state.recognition = null;
    }
    if (state.micStream) {
      state.micStream.getTracks().forEach((track) => track.stop());
      state.micStream = null;
    }
    if (state.activeSignal === "mic") {
      disconnectActiveSource();
      state.activeSignal = "idle";
    }
    ui.micOrb.classList.remove("active");
    ui.micTitle.textContent = "Microphone đang tắt";
    ui.micHint.textContent = "Edge sẽ hỏi quyền truy cập khi bạn bắt đầu.";
    ui.micButton.textContent = "Bắt đầu nhận giọng Việt";
    if (updateStatus) setStage("Đã dừng", "Microphone đã được đóng");
  }

  function stopAll() {
    stopTts(false);
    stopMic(false);
    ui.audioPlayer.pause();
    if (state.activeSignal === "audio") {
      disconnectActiveSource();
      state.activeSignal = "idle";
    }
    state.mouthTarget = 0;
    setStage("Sẵn sàng", "Chọn một nguồn giọng để tiếp tục");
  }

  function switchTab(name) {
    $$(".tab").forEach((tab) => {
      const selected = tab.dataset.tab === name;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    [
      ["tts", $("#ttsPanel")],
      ["audio", $("#audioPanel")],
      ["mic", $("#micPanel")]
    ].forEach(([key, panel]) => {
      const selected = key === name;
      panel.hidden = !selected;
      panel.classList.toggle("active", selected);
    });
  }

  function updateRangeLabels() {
    ui.mouthSizeValue.textContent = `${ui.mouthSize.value}%`;
    ui.rateValue.textContent = `${Number(ui.rate.value).toFixed(1)}×`;
    ui.pitchValue.textContent = Number(ui.pitch.value).toFixed(1);
  }

  function downloadSnapshot() {
    ui.canvas.toBlob((blob) => {
      if (!blob) {
        showToast("Không thể tạo ảnh PNG.", true);
        return;
      }
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `avatar-vn-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Đã chụp khung hình PNG.");
    }, "image/png");
  }

  async function copyTranscript() {
    const text = ui.transcriptText.textContent.trim();
    if (!text || text.startsWith("Bản chép lời")) {
      showToast("Chưa có bản chép lời để sao chép.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Đã sao chép bản chép lời.");
    } catch {
      showToast("Không thể truy cập clipboard.", true);
    }
  }

  function bindEvents() {
    ui.imageInput.addEventListener("change", (event) => handleImageFile(event.target.files?.[0]));
    ui.audioInput.addEventListener("change", (event) => handleAudioFile(event.target.files?.[0]));
    ui.sampleButton.addEventListener("click", () => useSampleImage());
    ui.calibrateButton.addEventListener("click", () => toggleCalibration());
    ui.canvas.addEventListener("click", setMouthFromCanvas);
    ui.speakButton.addEventListener("click", speakText);
    ui.stopButton.addEventListener("click", stopAll);
    ui.micButton.addEventListener("click", () => {
      if (state.recognitionShouldRun || state.micStream) stopMic();
      else startMic();
    });
    ui.snapshotButton.addEventListener("click", downloadSnapshot);
    ui.copyTranscript.addEventListener("click", copyTranscript);
    ui.resetButton.addEventListener("click", () => {
      stopAll();
      state.mouth = { x: 0.5, y: 0.665, width: 0.2 };
      ui.mouthSize.value = "20";
      ui.rate.value = "1";
      ui.pitch.value = "1";
      ui.transcriptText.textContent = "Bản chép lời sẽ xuất hiện ở đây khi bật microphone.";
      updateRangeLabels();
      useSampleImage(true);
      savePreferences();
      showToast("Đã đặt lại dashboard.");
    });

    ui.mouthSize.addEventListener("input", () => {
      state.mouth.width = Number(ui.mouthSize.value) / 100;
      updateRangeLabels();
    });
    ui.mouthSize.addEventListener("change", savePreferences);
    ui.rate.addEventListener("input", updateRangeLabels);
    ui.pitch.addEventListener("input", updateRangeLabels);
    ui.rate.addEventListener("change", savePreferences);
    ui.pitch.addEventListener("change", savePreferences);

    $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

    ["dragenter", "dragover"].forEach((type) => ui.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      ui.dropZone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((type) => ui.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      ui.dropZone.classList.remove("dragging");
    }));
    ui.dropZone.addEventListener("drop", (event) => handleImageFile(event.dataTransfer.files?.[0]));
    ui.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        ui.imageInput.click();
      }
    });

    ui.audioPlayer.addEventListener("play", () => {
      activateAudioFile().catch((error) => {
        console.error(error);
        showToast("Không thể phân tích tệp âm thanh này.", true);
      });
    });
    ui.audioPlayer.addEventListener("pause", () => {
      if (!ui.audioPlayer.ended && state.activeSignal === "audio") {
        state.activeSignal = "idle";
        state.mouthTarget = 0;
        setStage("Tạm dừng", "Tệp âm thanh đang dừng");
      }
    });
    ui.audioPlayer.addEventListener("ended", () => {
      state.activeSignal = "idle";
      state.mouthTarget = 0;
      setStage("Hoàn tất", "Đã phát xong tệp âm thanh");
    });
    ui.audioPlayer.addEventListener("error", () => showToast("Edge không giải mã được định dạng âm thanh này.", true));

    window.addEventListener("beforeunload", () => {
      stopTts(false);
      stopMic(false);
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
    });
  }

  async function initialize() {
    detectCapabilities();
    bindEvents();
    await restorePreferences();
    updateRangeLabels();
    useSampleImage(true);
    populateVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
      window.setTimeout(populateVoices, 300);
    }
    requestAnimationFrame(renderFrame);
  }

  initialize();
})();
