(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const ui = {
    imageInput: $("#imageInput"),
    audioInput: $("#audioInput"),
    dropZone: $("#dropZone"),
    detectFaceButton: $("#detectFaceButton"),
    calibrateButton: $("#calibrateButton"),
    faceDetectionStatus: $("#faceDetectionStatus"),
    mouthSize: $("#mouthSize"),
    mouthSizeValue: $("#mouthSizeValue"),
    faceMotion: $("#faceMotion"),
    faceMotionValue: $("#faceMotionValue"),
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
    calibrationText: $("#calibrationText"),
    runtimeMode: $("#runtimeMode"),
    runtimeWarning: $("#runtimeWarning"),
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
    masterImageButton: $("#masterImageButton"),
    recordWebmButton: $("#recordWebmButton"),
    emotionChip: $("#emotionChip"),
    companionStatus: $("#companionStatus"),
    nativeVadStatus: $("#nativeVadStatus"),
    nativeSttStatus: $("#nativeSttStatus"),
    nativeLlmStatus: $("#nativeLlmStatus"),
    nativeTtsStatus: $("#nativeTtsStatus"),
    characterSelect: $("#characterSelect"),
    modelProfileSelect: $("#modelProfileSelect"),
    providerSelect: $("#providerSelect"),
    apiBaseUrl: $("#apiBaseUrl"),
    apiModel: $("#apiModel"),
    apiKey: $("#apiKey"),
    openRouterSettings: $("#openRouterSettings"),
    openRouterReferer: $("#openRouterReferer"),
    openRouterTitle: $("#openRouterTitle"),
    openRouterZdr: $("#openRouterZdr"),
    sileroPath: $("#sileroPath"),
    whisperCliPath: $("#whisperCliPath"),
    whisperModelPath: $("#whisperModelPath"),
    llamaServerPath: $("#llamaServerPath"),
    ggufPath: $("#ggufPath"),
    ttsEngineSelect: $("#ttsEngineSelect"),
    ttsVoice: $("#ttsVoice"),
    piperPath: $("#piperPath"),
    piperModelPath: $("#piperModelPath"),
    connectNativeButton: $("#connectNativeButton"),
    benchmarkTtsButton: $("#benchmarkTtsButton"),
    ttsBenchmarkResult: $("#ttsBenchmarkResult"),
    autoSpeak: $("#autoSpeak"),
    voiceAutoSend: $("#voiceAutoSend"),
    fullDuplex: $("#fullDuplex"),
    echoGuard: $("#echoGuard"),
    memoryEnabled: $("#memoryEnabled"),
    emotionEnabled: $("#emotionEnabled"),
    pipelineHealth: $("#pipelineHealth"),
    saveApiButton: $("#saveApiButton"),
    testApiButton: $("#testApiButton"),
    chatMessages: $("#chatMessages"),
    chatInput: $("#chatInput"),
    sendChatButton: $("#sendChatButton"),
    clearChatButton: $("#clearChatButton"),
    clearMemoryButton: $("#clearMemoryButton"),
    liveTalkButton: $("#liveTalkButton"),
    recordVoiceButton: $("#recordVoiceButton"),
    recordingTimer: $("#recordingTimer"),
    liveModeStatus: $("#liveModeStatus"),
    recordingPreview: $("#recordingPreview"),
    recordedVoicePlayer: $("#recordedVoicePlayer"),
    deleteVoiceButton: $("#deleteVoiceButton"),
    toast: $("#toast")
  };

  const ctx = ui.canvas.getContext("2d", { alpha: false });
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const DEFAULT_IMAGE = "assets/default-avatar.webp";
  const MASTER_WIDTH = 7680;
  const MASTER_HEIGHT = 4320;
  const CYBERGIRL_TOKEN = document.querySelector('meta[name="cybergirl-token"]')?.content || "";
  const CALIBRATION_STEPS = [
    { key: "leftEye", label: "Bấm tâm mắt bên trái ảnh" },
    { key: "rightEye", label: "Bấm tâm mắt bên phải ảnh" },
    { key: "mouthLeft", label: "Bấm khóe miệng bên trái" },
    { key: "mouthRight", label: "Bấm khóe miệng bên phải" },
    { key: "mouthCenter", label: "Bấm chính giữa hai môi" }
  ];

  const state = {
    image: new Image(),
    imageUrl: null,
    imageRevision: 0,
    pendingDetectionRevision: null,
    avatarReady: false,
    mouth: { x: 0.5, y: 0.665, width: 0.16 },
    face: null,
    faceQuality: 100,
    patches: { mouth: null, eyes: [] },
    featureWork: {
      mouth: document.createElement("canvas"),
      mouthLayer: document.createElement("canvas"),
      mouthMask: document.createElement("canvas"),
      eyes: [document.createElement("canvas"), document.createElement("canvas")]
    },
    faceMesh: null,
    faceMeshResolver: null,
    faceMeshRejecter: null,
    detectingFace: false,
    mouthOpen: 0,
    mouthTarget: 0,
    viseme: "idle",
    mouthShape: {
      width: 1,
      open: 0,
      targetWidth: 1,
      targetOpen: 0
    },
    liveViseme: "neutral",
    liveVisemeUntil: 0,
    calibrating: false,
    calibrationIndex: 0,
    manualPoints: {},
    showGuidesUntil: 0,
    blink: {
      amount: 0,
      startedAt: 0,
      duration: 190,
      nextAt: performance.now() + 2600 + Math.random() * 2200,
      repeatAfter: false,
      isRepeat: false
    },
    headMotion: {
      x: 0,
      y: 0,
      rotation: 0,
      targetX: 0,
      targetY: 0,
      targetRotation: 0,
      nextTargetAt: performance.now() + 900
    },
    gaze: {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      nextTargetAt: performance.now() + 700
    },
    emotion: {
      name: "trung_tính",
      intensity: 0.3,
      arousal: 0.22,
      gaze_x: 0,
      gaze_y: 0,
      head_energy: 1,
      blink_factor: 1
    },
    activeSignal: "idle",
    analyser: null,
    timeData: null,
    frequencyData: null,
    spectralViseme: "neutral",
    audioContext: null,
    captureDestination: null,
    activeSource: null,
    mediaElementSource: null,
    recordedMediaSource: null,
    micStream: null,
    recognition: null,
    recognitionShouldRun: false,
    finalTranscript: "",
    speechActive: false,
    ttsTimer: null,
    visemeTimers: [],
    lastTtsText: "",
    audioObjectUrl: null,
    level: 0,
    lastActivityAt: 0,
    lastFrameAt: 0,
    toastTimer: null,
    companionReady: false,
    nativeReady: false,
    nativeListening: false,
    nativeComponents: {},
    characters: {},
    chatHistory: [],
    sendingChat: false,
    voiceSendTimer: null,
    resumeMicAfterTts: false,
    mediaRecorder: null,
    recordedChunks: [],
    voiceRecorder: null,
    voiceRecordingStream: null,
    voiceRecordingOwnsStream: false,
    voiceRecordingChunks: [],
    voiceRecordingStartedAt: 0,
    voiceRecordingTimer: null,
    voiceRecordingUrl: null,
    conversationPhase: "idle"
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
    ui.liveDot.style.background = isLive ? "#ff80b7" : "#ff4f9a";
    ui.liveDot.style.boxShadow = isLive
      ? "0 0 12px rgba(255,128,183,.85)"
      : "0 0 12px rgba(255,79,154,.75)";
  }

  function setConversationPhase(phase, detail = "") {
    const labels = {
      idle: "Đang chờ người dùng",
      listening: "Đang nghe bạn nói",
      recording: "Đang ghi âm cục bộ",
      transcribing: "Đang nhận dạng tiếng Việt",
      thinking: "Cybergirl đang suy nghĩ",
      speaking: "Cybergirl đang trả lời",
      interrupted: "Đã ngắt lời · tiếp tục nghe"
    };
    state.conversationPhase = phase;
    ui.liveModeStatus.textContent = detail || labels[phase] || labels.idle;
    ui.liveModeStatus.classList.toggle("active", phase !== "idle");
  }

  function syncMicrophoneControls(active) {
    ui.liveTalkButton.classList.toggle("active", active);
    ui.liveTalkButton.setAttribute("aria-pressed", String(active));
    ui.liveTalkButton.lastChild.textContent = active
      ? " Dừng Chat live"
      : " Bắt đầu Chat live";
    ui.micButton.textContent = active
      ? "Dừng microphone"
      : "Bắt đầu nhận giọng Việt";
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
      await storage.set("cybergirlPreferencesV2", {
        mouthGain: Number(ui.mouthSize.value),
        faceMotion: Number(ui.faceMotion.value),
        rate: Number(ui.rate.value),
        pitch: Number(ui.pitch.value),
        autoSpeak: ui.autoSpeak.checked,
        voiceAutoSend: ui.voiceAutoSend.checked,
        fullDuplex: ui.fullDuplex.checked,
        echoGuard: ui.echoGuard.checked,
        emotionEnabled: ui.emotionEnabled.checked
      });
    } catch (error) {
      console.warn("Không thể lưu tùy chọn:", error);
    }
  }

  async function restorePreferences() {
    try {
      const saved = await storage.get("cybergirlPreferencesV2");
      if (!saved) return;
      if (saved.mouthGain) ui.mouthSize.value = String(clamp(Number(saved.mouthGain), 25, 75));
      if (saved.faceMotion !== undefined) ui.faceMotion.value = String(clamp(Number(saved.faceMotion), 0, 100));
      if (saved.rate) ui.rate.value = String(saved.rate);
      if (saved.pitch) ui.pitch.value = String(saved.pitch);
      if (saved.autoSpeak !== undefined) ui.autoSpeak.checked = Boolean(saved.autoSpeak);
      if (saved.voiceAutoSend !== undefined) ui.voiceAutoSend.checked = Boolean(saved.voiceAutoSend);
      if (saved.fullDuplex !== undefined) ui.fullDuplex.checked = Boolean(saved.fullDuplex);
      if (saved.echoGuard !== undefined) ui.echoGuard.checked = Boolean(saved.echoGuard);
      if (saved.emotionEnabled !== undefined) ui.emotionEnabled.checked = Boolean(saved.emotionEnabled);
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
      Boolean(ctx),
      Boolean(window.FaceMesh || window.FaceDetector)
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
    if (!capabilities[4]) missing.push("Face Mesh");
    ui.capabilityText.textContent = `Thiếu: ${missing.join(", ")}`;
  }

  function configureRuntimeContext() {
    const extensionMode = window.location.protocol === "chrome-extension:"
      && Boolean(globalThis.chrome?.runtime?.id);
    const desktopMode = window.location.protocol === "http:" && Boolean(CYBERGIRL_TOKEN);
    ui.runtimeWarning.hidden = window.location.protocol !== "file:";
    ui.runtimeMode.textContent = desktopMode
      ? "GUI Windows · Edge local"
      : extensionMode
        ? "Extension · WASM local"
        : "Chế độ tương thích";
    if (extensionMode || desktopMode) ui.runtimeMode.classList.add("status-private");
  }

  function setCompanionStatus(title, detail, tone = "") {
    ui.companionStatus.classList.remove("success", "error");
    if (tone) ui.companionStatus.classList.add(tone);
    ui.companionStatus.querySelector("strong").textContent = title;
    ui.companionStatus.querySelector("small").textContent = detail;
  }

  async function companionFetch(path, options = {}) {
    if (!CYBERGIRL_TOKEN) {
      throw new Error("Hãy chạy ứng dụng Cybergirl Windows để sử dụng hội thoại AI.");
    }
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Cybergirl-Token": CYBERGIRL_TOKEN,
        ...(options.headers || {})
      }
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Lõi Cybergirl trả về dữ liệu không hợp lệ (${response.status}).`);
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.loi || `Yêu cầu thất bại (${response.status}).`);
    }
    return payload;
  }

  function nativeMessagingAvailable() {
    return location.protocol === "chrome-extension:"
      && Boolean(globalThis.chrome?.runtime?.sendMessage);
  }

  async function nativeRequest(type, payload = {}) {
    if (!nativeMessagingAvailable()) {
      throw new Error("Native Messaging chỉ hoạt động khi Cybergirl được tải dưới dạng Edge Extension.");
    }
    const response = await chrome.runtime.sendMessage({
      channel: "cybergirl-native-request",
      type,
      payload
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Companion cục bộ không phản hồi.");
    }
    return response.result;
  }

  function fillNativeConfig(config = {}) {
    ui.sileroPath.value = config.silero_vad_path || "";
    ui.whisperCliPath.value = config.whisper_cli_path || "";
    ui.whisperModelPath.value = config.whisper_model_path || "";
    ui.llamaServerPath.value = config.llama_server_path || "";
    ui.ggufPath.value = config.gguf_path || "";
    ui.ttsEngineSelect.value = config.tts_engine || "windows-sapi";
    ui.ttsVoice.value = config.tts_voice || "";
    ui.piperPath.value = config.piper_path || "";
    ui.piperModelPath.value = config.piper_model_path || "";
    ui.memoryEnabled.checked = Boolean(config.memory_enabled);
    ui.emotionEnabled.checked = config.emotion_enabled !== false;
    ui.fullDuplex.checked = config.full_duplex !== false;
    ui.echoGuard.checked = config.echo_guard !== false;
    ui.openRouterReferer.value = config.openrouter_referer
      || "https://github.com/Base27-CVNSS/Avatar";
    ui.openRouterTitle.value = config.openrouter_title || "Cybergirl";
    ui.openRouterZdr.checked = Boolean(config.openrouter_zdr);
    updateOpenRouterVisibility();
  }

  function setNativeComponents(components = {}, conversation = {}, config = {}) {
    state.nativeComponents = components;
    const localLlmReady = components.llama_server && components.gguf_model;
    const remoteOrAdapterReady = ["ollama", "openai-compatible"].includes(config.provider)
      || (["openai", "gemini", "openrouter"].includes(config.provider) && config.api_key_present);
    const llmReady = config.provider === "gguf" ? localLlmReady : remoteOrAdapterReady;
    [
      [ui.nativeVadStatus, components.silero_vad, "VAD"],
      [ui.nativeSttStatus, components.whisper_cli && components.whisper_model, "Whisper"],
      [ui.nativeLlmStatus, llmReady, config.provider === "gguf" ? "GGUF" : "LLM/API"],
      [ui.nativeTtsStatus, components.tts_local, "TTS"]
    ].forEach(([element, ready, label]) => {
      element.classList.toggle("ready", Boolean(ready));
      element.textContent = `${label} · ${ready ? "sẵn sàng" : "thiếu model"}`;
    });
    const readyCount = [
      components.silero_vad,
      components.whisper_cli && components.whisper_model,
      llmReady,
      components.tts_local
    ].filter(Boolean).length;
    ui.pipelineHealth.textContent = [
      `Health ${readyCount}/4 module`,
      conversation.full_duplex ? "full-duplex" : "half-duplex",
      conversation.echo_guard ? "echo-guard" : "không echo-guard",
      conversation.memory_enabled
        ? `memory ${conversation.memory_turns || 0} lượt`
        : "memory tắt"
    ].join(" · ");
  }

  function applyEmotion(emotion = {}) {
    state.emotion = {
      ...state.emotion,
      ...emotion
    };
    const labels = {
      "trung_tính": "Trung tính",
      "vui": "Vui",
      "buồn": "Buồn",
      "quan_tâm": "Quan tâm",
      "ngạc_nhiên": "Ngạc nhiên",
      "căng_thẳng": "Căng thẳng",
      "bình_tĩnh": "Bình tĩnh"
    };
    ui.emotionChip.textContent = labels[state.emotion.name] || state.emotion.name;
    ui.emotionChip.dataset.emotion = state.emotion.name;
  }

  function populateModelProfiles(registry = {}) {
    const current = ui.modelProfileSelect.value;
    ui.modelProfileSelect.replaceChildren();
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Tùy chỉnh thủ công";
    ui.modelProfileSelect.append(custom);
    for (const profile of registry.models || []) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = `${profile.label}${profile.offline ? " · offline" : " · API"}`;
      option.dataset.profile = JSON.stringify(profile);
      ui.modelProfileSelect.append(option);
    }
    ui.modelProfileSelect.value = [...ui.modelProfileSelect.options]
      .some((option) => option.value === current) ? current : "custom";
  }

  function applyModelProfile() {
    const option = ui.modelProfileSelect.selectedOptions[0];
    if (!option?.dataset.profile) return;
    const profile = JSON.parse(option.dataset.profile);
    ui.providerSelect.value = profile.provider;
    ui.apiBaseUrl.value = profile.base_url;
    ui.apiModel.value = profile.model;
    updateOpenRouterVisibility();
    showToast(`Đã chọn ${profile.label}.`);
  }

  function handleNativeEvent(message) {
    const name = message?.event;
    const data = message?.data || {};
    if (name === "native.disconnected") {
      state.nativeReady = false;
      state.nativeListening = false;
      syncMicrophoneControls(false);
      setConversationPhase("idle", "Companion đã ngắt kết nối");
      setCompanionStatus("Companion đã ngắt kết nối", data.error || "Hãy cài hoặc đăng ký lại Native Host.", "error");
      return;
    }
    if (name === "audio.level") {
      state.level = clamp(Number(data.rms || 0) * 8, 0, 1);
      state.activeSignal = "mic";
      return;
    }
    if (name === "audio.echo_suppressed") {
      ui.pipelineHealth.textContent = "Echo-guard đang loại tiếng vọng từ loa · microphone vẫn mở.";
      return;
    }
    if (name === "vad.speech_start") {
      stopTts(false);
      setConversationPhase("listening");
      setStage("Đang nghe câu nói", "Silero VAD phát hiện tiếng Việt", true);
      return;
    }
    if (name === "stt.started") {
      ui.transcriptText.textContent = "Whisper đang phiên âm cục bộ…";
      setConversationPhase("transcribing");
      setStage("Đang phiên âm", "Whisper CPU · dữ liệu ở trên máy", true);
      return;
    }
    if (name === "stt.final") {
      const text = String(data.text || "").trim();
      ui.transcriptText.textContent = text || "Whisper không trả về nội dung.";
      if (text) {
        appendChatMessage("user", text);
        state.chatHistory.push({ role: "user", content: text });
      }
      return;
    }
    if (name === "llm.thinking") {
      setConversationPhase("thinking");
      setStage("Đang suy nghĩ", `${data.provider || "AI"} đang tạo câu trả lời`, true);
      return;
    }
    if (name === "llm.answer") {
      const text = String(data.text || "").trim();
      if (text) {
        appendChatMessage("assistant", text);
        state.chatHistory.push({ role: "assistant", content: text });
        ui.speechText.value = text;
      }
      setConversationPhase("speaking");
      setStage("Đã trả lời", "Companion cục bộ");
      return;
    }
    if (name === "emotion.changed") {
      applyEmotion(data);
      return;
    }
    if (name === "tts.started") {
      state.speechActive = true;
      state.activeSignal = "tts";
      state.lastTtsText = String(data.text || "");
      setConversationPhase("speaking");
      if (Array.isArray(data.visemes) && data.visemes.length) {
        scheduleTimedVisemes(data.visemes);
      } else {
        scheduleTextAlignedVisemes(state.lastTtsText, Number(ui.rate.value));
      }
      setStage("Đang phát TTS cục bộ", `${data.engine || "TTS"} · RTF ${data.rtf ?? "—"}`, true);
      return;
    }
    if (name === "tts.ended" || name === "conversation.interrupted") {
      stopTts(false);
      setConversationPhase(
        name === "tts.ended" ? (state.nativeListening ? "listening" : "idle") : "interrupted"
      );
      setStage(name === "tts.ended" ? "Hoàn tất" : "Đã ngắt lời", "Companion tiếp tục lắng nghe");
      return;
    }
    if (name === "pipeline.error") {
      setCompanionStatus("Chuỗi giọng nói gặp lỗi", data.error || "Lỗi không xác định.", "error");
      showToast(data.error || "Companion gặp lỗi.", true);
    }
  }

  if (nativeMessagingAvailable()) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.channel === "cybergirl-native-event") {
        handleNativeEvent(message.message);
      }
    });
  }

  function populateCharacters(characters, active = "") {
    state.characters = Object.fromEntries(
      characters.map((character) => [character.id, character])
    );
    ui.characterSelect.replaceChildren();
    for (const character of characters) {
      const option = document.createElement("option");
      option.value = character.id;
      option.textContent = character.label;
      option.dataset.model = character.llm_model || "";
      ui.characterSelect.append(option);
    }
    if (active && characters.some((character) => character.id === active)) {
      ui.characterSelect.value = active;
    }
  }

  function applyProviderDefaults(force = false) {
    const provider = ui.providerSelect.value;
    const defaults = {
      gguf: {
        base: "http://127.0.0.1:27829/v1",
        model: "qwen3-4b-vi",
        needsKey: false
      },
      openai: {
        base: "https://api.openai.com/v1",
        model: "gpt-5.6-sol",
        needsKey: true
      },
      openrouter: {
        base: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o",
        needsKey: true
      },
      ollama: {
        base: "http://127.0.0.1:11434",
        model: "qwen3:4b",
        needsKey: false
      },
      "openai-compatible": {
        base: "http://127.0.0.1:11434/v1",
        model: "qwen3:4b",
        needsKey: false
      },
      gemini: {
        base: "https://generativelanguage.googleapis.com/v1",
        model: "gemini-3.6-flash",
        needsKey: true
      }
    }[provider];
    if (!defaults) return;
    if (force || !ui.apiBaseUrl.value.trim()) ui.apiBaseUrl.value = defaults.base;
    if (force || !ui.apiModel.value.trim()) ui.apiModel.value = defaults.model;
    updateOpenRouterVisibility();
    const keyNames = {
      openai: "OpenAI",
      gemini: "Gemini",
      openrouter: "OpenRouter"
    };
    ui.apiKey.placeholder = defaults.needsKey
      ? `Nhập khóa ${keyNames[provider]} · chỉ giữ trong RAM`
      : "Không bắt buộc · chỉ giữ trong phiên";
  }

  function updateOpenRouterVisibility() {
    ui.openRouterSettings.hidden = ui.providerSelect.value !== "openrouter";
  }

  async function loadCompanionConfig() {
    if (nativeMessagingAvailable()) {
      try {
        const status = await nativeRequest("status");
        state.companionReady = true;
        state.nativeReady = true;
        const config = status.config || {};
        ui.providerSelect.value = config.provider || "gguf";
        ui.apiBaseUrl.value = config.base_url || "http://127.0.0.1:27829/v1";
        ui.apiModel.value = config.model || "qwen3-4b-vi";
        fillNativeConfig(config);
        setNativeComponents(status.components, status.conversation, config);
        populateModelProfiles(await nativeRequest("registry"));
        const response = await fetch("characters.json");
        const characters = await response.json();
        populateCharacters(
          Object.entries(characters).map(([id, value]) => ({ id, ...value }))
        );
        setCompanionStatus(
          "Companion cục bộ đã kết nối",
          `Native Messaging · ${status.language} · khóa API không ghi xuống đĩa`,
          "success"
        );
        return;
      } catch (error) {
        state.nativeReady = false;
        setCompanionStatus(
          "Chưa kết nối được companion cục bộ",
          `${error.message} Ảnh và giọng Edge vẫn hoạt động độc lập.`,
          "error"
        );
      }
    }

    if (!CYBERGIRL_TOKEN) {
      state.companionReady = false;
      setCompanionStatus(
        "Chưa chạy lõi Cybergirl Windows",
        "Ảnh và giọng Edge vẫn dùng được; hội thoại AI cần mở bằng ứng dụng Windows.",
        "error"
      );
      try {
        const response = await fetch("characters.json");
        const characters = await response.json();
        populateCharacters(
          Object.entries(characters).map(([id, value]) => ({ id, ...value }))
        );
      } catch {
        ui.characterSelect.innerHTML = '<option value="">Không có dữ liệu nhân vật</option>';
      }
      return;
    }

    try {
      const config = await companionFetch("/api/cau-hinh");
      state.companionReady = true;
      ui.providerSelect.value = config.provider;
      ui.apiBaseUrl.value = config.base_url;
      ui.apiModel.value = config.model;
      ui.openRouterReferer.value = config.openrouter_referer
        || "https://github.com/Base27-CVNSS/Avatar";
      ui.openRouterTitle.value = config.openrouter_title || "Cybergirl";
      ui.openRouterZdr.checked = Boolean(config.openrouter_zdr);
      updateOpenRouterVisibility();
      populateCharacters(config.characters, config.active_character);
      setCompanionStatus(
        "Cybergirl Windows đã sẵn sàng",
        `${config.che_do} · khóa API ${config.co_khoa_api ? "đang có trong phiên" : "chưa nhập"}`,
        "success"
      );
    } catch (error) {
      state.companionReady = false;
      setCompanionStatus("Không kết nối được lõi Cybergirl", error.message, "error");
    }
  }

  function currentApiPayload() {
    return {
      provider: ui.providerSelect.value,
      base_url: ui.apiBaseUrl.value.trim(),
      model: ui.apiModel.value.trim(),
      api_key: ui.apiKey.value.trim(),
      openrouter_referer: ui.openRouterReferer.value.trim(),
      openrouter_title: ui.openRouterTitle.value.trim(),
      openrouter_zdr: ui.openRouterZdr.checked,
      active_character: ui.characterSelect.value,
      silero_vad_path: ui.sileroPath.value.trim(),
      whisper_cli_path: ui.whisperCliPath.value.trim(),
      whisper_model_path: ui.whisperModelPath.value.trim(),
      llama_server_path: ui.llamaServerPath.value.trim(),
      gguf_path: ui.ggufPath.value.trim(),
      tts_engine: ui.ttsEngineSelect.value,
      tts_voice: ui.ttsVoice.value.trim(),
      piper_path: ui.piperPath.value.trim(),
      piper_model_path: ui.piperModelPath.value.trim(),
      character_id: ui.characterSelect.value || "mai",
      auto_chat: ui.voiceAutoSend.checked,
      auto_speak: ui.autoSpeak.checked,
      memory_enabled: ui.memoryEnabled.checked,
      emotion_enabled: ui.emotionEnabled.checked,
      full_duplex: ui.fullDuplex.checked,
      echo_guard: ui.echoGuard.checked,
      system_prompt: state.characters[ui.characterSelect.value]?.system_prompt || ""
    };
  }

  async function saveCompanionConfig(showSuccess = true) {
    try {
      let config;
      if (nativeMessagingAvailable()) {
        const status = await nativeRequest("configure", currentApiPayload());
        config = status.config;
        state.nativeReady = true;
        setNativeComponents(status.components, status.conversation, config);
      } else {
        config = await companionFetch("/api/cau-hinh", {
          method: "POST",
          body: JSON.stringify(currentApiPayload())
        });
      }
      state.companionReady = true;
      ui.apiKey.value = "";
      setCompanionStatus(
        "Đã lưu cấu hình Cybergirl",
        `${config.provider} · ${config.model} · khóa chỉ giữ trong phiên`,
        "success"
      );
      if (showSuccess) showToast("Đã lưu cấu hình API và nhân vật.");
      return true;
    } catch (error) {
      setCompanionStatus("Không lưu được cấu hình", error.message, "error");
      showToast(error.message, true);
      return false;
    }
  }

  async function testCompanionApi() {
    ui.testApiButton.disabled = true;
    ui.testApiButton.textContent = "Đang kiểm tra…";
    try {
      await saveCompanionConfig(false);
      const result = nativeMessagingAvailable()
        ? await nativeRequest("chat", {
          message: "Chỉ trả lời đúng một câu: Kết nối thành công.",
          history: [],
          speak: false,
          remember: false
        })
        : await companionFetch("/api/kiem-tra", {
          method: "POST",
          body: JSON.stringify(currentApiPayload())
        });
      state.companionReady = true;
      ui.apiKey.value = "";
      setCompanionStatus("API hoạt động", result.tra_loi || result.text, "success");
      showToast("Kết nối API thành công.");
    } catch (error) {
      setCompanionStatus("API chưa hoạt động", error.message, "error");
      showToast(error.message, true);
    } finally {
      ui.testApiButton.disabled = false;
      ui.testApiButton.textContent = "Kiểm tra API";
    }
  }

  function appendChatMessage(role, text, label = "") {
    const article = document.createElement("article");
    article.className = `chat-message ${role}`;
    const heading = document.createElement("span");
    heading.textContent = label || (role === "user" ? "Bạn" : "Cybergirl");
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    article.append(heading, paragraph);
    ui.chatMessages.append(article);
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
    return article;
  }

  async function sendChat(messageOverride = "") {
    if (state.sendingChat) return;
    const message = (messageOverride || ui.chatInput.value).trim();
    if (!message) {
      showToast("Hãy nhập hoặc nói một câu tiếng Việt.", true);
      ui.chatInput.focus();
      return;
    }
    if (!state.companionReady && !(await saveCompanionConfig(false))) return;
    state.sendingChat = true;
    ui.sendChatButton.disabled = true;
    ui.sendChatButton.textContent = "Đang suy nghĩ…";
    const previousHistory = state.chatHistory.slice(-12);
    appendChatMessage("user", message);
    state.chatHistory.push({ role: "user", content: message });
    ui.chatInput.value = "";
    setConversationPhase("thinking");
    setStage("Đang suy nghĩ", `${ui.characterSelect.selectedOptions[0]?.textContent || "Cybergirl"} đang trả lời`, true);
    const pending = appendChatMessage("assistant pending", "Đang tạo câu trả lời tiếng Việt…");

    try {
      const result = nativeMessagingAvailable()
        ? await nativeRequest("chat", {
          message,
          history: previousHistory,
          system_prompt: state.characters[ui.characterSelect.value]?.system_prompt || "",
          speak: ui.autoSpeak.checked
        })
        : await companionFetch("/api/hoi-thoai", {
          method: "POST",
          body: JSON.stringify({
            message,
            history: previousHistory
          })
        });
      pending.remove();
      const answer = result.tra_loi || result.text;
      if (!nativeMessagingAvailable()) {
        appendChatMessage("assistant", answer, result.nhan_vat || "Cybergirl");
        state.chatHistory.push({ role: "assistant", content: answer });
      }
      ui.speechText.value = answer;
      setConversationPhase(ui.autoSpeak.checked ? "speaking" : "idle");
      setStage("Đã trả lời", result.nhan_vat || "Cybergirl");
      if (ui.autoSpeak.checked && (!nativeMessagingAvailable() || ui.ttsEngineSelect.value === "edge")) {
        speakText();
      }
    } catch (error) {
      pending.classList.remove("pending");
      pending.querySelector("p").textContent = error.message;
      setConversationPhase("idle", "Hội thoại bị gián đoạn");
      setCompanionStatus("Hội thoại bị gián đoạn", error.message, "error");
      setStage("Lỗi hội thoại", "Kiểm tra cấu hình API");
      showToast(error.message, true);
    } finally {
      state.sendingChat = false;
      ui.sendChatButton.disabled = false;
      ui.sendChatButton.textContent = "Gửi và trả lời";
      ui.chatInput.focus();
    }
  }

  function clearChat() {
    state.chatHistory = [];
    if (state.nativeReady) nativeRequest("clear_history").catch(() => {});
    ui.chatMessages.replaceChildren();
    appendChatMessage(
      "assistant",
      "Lịch sử trong phiên đã được xóa. Bộ nhớ dài hạn có nút xóa riêng."
    );
    showToast("Đã xóa lịch sử hội thoại trong phiên.");
  }

  async function clearLongTermMemory() {
    if (!state.nativeReady) {
      showToast("Bộ nhớ dài hạn chỉ có trong Companion cục bộ.", true);
      return;
    }
    ui.clearMemoryButton.disabled = true;
    try {
      const result = await nativeRequest("clear_memory", { character_only: false });
      ui.pipelineHealth.textContent = "Bộ nhớ dài hạn · 0 lượt · chỉ ở máy này";
      showToast(`Đã xóa ${result.deleted_turns || 0} lượt khỏi SQLite cục bộ.`);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      ui.clearMemoryButton.disabled = false;
    }
  }

  function normalizedSpeech(text) {
    return text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isLikelySpeakerEcho(text) {
    if (!ui.echoGuard.checked || !state.lastTtsText) return false;
    const heard = normalizedSpeech(text);
    const spoken = normalizedSpeech(state.lastTtsText);
    if (heard.length < 5) return false;
    if (spoken.includes(heard)) return true;
    const heardWords = new Set(heard.split(" "));
    const spokenWords = new Set(spoken.split(" "));
    const overlap = [...heardWords].filter((word) => spokenWords.has(word)).length;
    return overlap / Math.max(heardWords.size, 1) >= 0.72;
  }

  function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointMid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function normalizedFeature(a, b, top, bottom) {
    const center = pointMid(a, b);
    const width = pointDistance(a, b);
    return {
      x: center.x,
      y: center.y,
      width,
      height: Math.max(pointDistance(top, bottom) * 1.35, width * 0.22),
      angle: Math.atan2(b.y - a.y, b.x - a.x)
    };
  }

  function setDetectionStatus(title, detail, tone = "") {
    ui.faceDetectionStatus.classList.remove("success", "error");
    if (tone) ui.faceDetectionStatus.classList.add(tone);
    ui.faceDetectionStatus.querySelector("strong").textContent = title;
    ui.faceDetectionStatus.querySelector("small").textContent = detail;
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
    const revision = ++state.imageRevision;
    const image = new Image();
    image.onload = async () => {
      if (revision !== state.imageRevision) return;
      state.image = image;
      state.avatarReady = true;
      setFallbackFaceGeometry();
      setStage("Đang phân tích mặt", label);
      setDetectionStatus("Đang nhận diện khuôn mặt", "Tìm môi, mắt và tỷ lệ gương mặt bằng Face Mesh.");
      await detectFaceLandmarks(revision);
    };
    image.onerror = () => {
      if (revision !== state.imageRevision) return;
      state.avatarReady = false;
      showToast("Không thể đọc tệp ảnh này.", true);
    };
    image.decoding = "async";
    image.src = source;
  }

  function useDefaultImage(silent = false) {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = null;
    }
    const revision = ++state.imageRevision;
    const image = new Image();
    image.onload = async () => {
      if (revision !== state.imageRevision) return;
      state.image = image;
      state.avatarReady = true;
      setDefaultFaceGeometry();
      setStage("Đang phân tích mặt", "Ảnh chân dung mặc định");
      setDetectionStatus("Đang nhận diện ảnh mặc định", "Face Mesh đang khóa mắt, môi và tỷ lệ khuôn mặt.");
      await detectFaceLandmarks(revision);
      if (!silent && revision === state.imageRevision) showToast("Đã khôi phục ảnh chân dung mặc định.");
    };
    image.onerror = () => {
      if (revision !== state.imageRevision) return;
      state.avatarReady = false;
      showToast("Không thể nạp ảnh mẫu.", true);
    };
    image.src = DEFAULT_IMAGE;
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

  function setFallbackFaceGeometry() {
    applyFaceGeometry({
      source: "fallback",
      box: { x: 0.24, y: 0.1, width: 0.52, height: 0.76 },
      mouth: { x: 0.5, y: 0.67, width: 0.12, height: 0.035, angle: 0 },
      eyes: [
        { x: 0.41, y: 0.39, width: 0.09, height: 0.028, angle: 0 },
        { x: 0.59, y: 0.39, width: 0.09, height: 0.028, angle: 0 }
      ],
      landmarks: []
    }, false);
  }

  function setDefaultFaceGeometry() {
    applyFaceGeometry({
      source: "default",
      box: { x: 0.43, y: 0.12, width: 0.3, height: 0.63 },
      mouth: { x: 0.576, y: 0.538, width: 0.1, height: 0.032, angle: -0.02 },
      eyes: [
        { x: 0.515, y: 0.365, width: 0.055, height: 0.022, angle: -0.04 },
        { x: 0.621, y: 0.346, width: 0.052, height: 0.021, angle: -0.04 }
      ],
      landmarks: []
    });
  }

  function assessFaceGeometry(face) {
    if (!face?.box || !face?.mouth || !Array.isArray(face.eyes) || face.eyes.length < 2) {
      throw new Error("Thiếu dữ liệu mắt, miệng hoặc khung mặt.");
    }
    const values = [
      face.box.x, face.box.y, face.box.width, face.box.height,
      face.mouth.x, face.mouth.y, face.mouth.width, face.mouth.height,
      ...face.eyes.flatMap((eye) => [eye.x, eye.y, eye.width, eye.height])
    ];
    if (!values.every(Number.isFinite)) throw new Error("Landmark chứa tọa độ không hợp lệ.");

    const box = {
      x: clamp(face.box.x, 0, 0.98),
      y: clamp(face.box.y, 0, 0.98),
      width: clamp(face.box.width, 0.08, 1),
      height: clamp(face.box.height, 0.12, 1)
    };
    box.width = Math.min(box.width, 1 - box.x);
    box.height = Math.min(box.height, 1 - box.y);

    const eyes = [...face.eyes].sort((a, b) => a.x - b.x);
    const eyeMid = pointMid(eyes[0], eyes[1]);
    const eyeDistance = pointDistance(eyes[0], eyes[1]);
    const mouthRelativeX = (face.mouth.x - box.x) / box.width;
    const mouthRelativeY = (face.mouth.y - box.y) / box.height;
    const eyeRelativeY = (eyeMid.y - box.y) / box.height;
    const eyeDistanceRatio = eyeDistance / box.width;
    const mouthWidthRatio = face.mouth.width / box.width;
    const roll = Math.abs(face.mouth.angle || 0);

    if (
      mouthRelativeX < 0.04 || mouthRelativeX > 0.96
      || mouthRelativeY < 0.4 || mouthRelativeY > 1.02
      || eyeRelativeY < 0.06 || eyeRelativeY > 0.72
      || eyeDistanceRatio < 0.16 || eyeDistanceRatio > 0.78
      || mouthWidthRatio < 0.08 || mouthWidthRatio > 0.68
    ) {
      throw new Error("Landmark không có tỷ lệ khuôn mặt hợp lý.");
    }

    const score = Math.round(clamp(
      100
      - Math.abs(mouthRelativeX - 0.5) * 45
      - Math.abs(mouthRelativeY - 0.74) * 22
      - Math.abs(eyeRelativeY - 0.4) * 22
      - Math.abs(eyeDistanceRatio - 0.4) * 32
      - Math.abs(mouthWidthRatio - 0.32) * 34
      - Math.max(0, roll - 0.12) * 35,
      45,
      100
    ));

    return {
      quality: face.source === "default" || face.source === "fallback" ? 100 : score,
      geometry: {
        ...face,
        box,
        mouth: {
          ...face.mouth,
          x: clamp(face.mouth.x, box.x, box.x + box.width),
          y: clamp(face.mouth.y, box.y + box.height * 0.4, box.y + box.height),
          width: clamp(face.mouth.width, box.width * 0.12, box.width * 0.52),
          height: clamp(face.mouth.height, box.height * 0.018, box.height * 0.16),
          angle: clamp(face.mouth.angle || 0, -0.62, 0.62)
        },
        eyes: eyes.map((eye) => ({
          ...eye,
          width: clamp(eye.width, box.width * 0.08, box.width * 0.32),
          height: clamp(eye.height, box.height * 0.018, box.height * 0.12),
          angle: clamp(eye.angle || 0, -0.62, 0.62)
        }))
      }
    };
  }

  function applyFaceGeometry(face, showGuides = true) {
    const assessed = assessFaceGeometry(face);
    state.face = assessed.geometry;
    state.faceQuality = assessed.quality;
    state.mouth = {
      x: state.face.mouth.x,
      y: state.face.mouth.y,
      width: state.face.mouth.width
    };
    buildFeaturePatches();
    if (showGuides) state.showGuidesUntil = performance.now() + 1800;
    return assessed.quality;
  }

  function createAlignedPatch(feature, widthFactor, heightFactor) {
    const imageWidth = state.image.naturalWidth || state.image.width;
    const imageHeight = state.image.naturalHeight || state.image.height;
    const featureWidth = feature.width * imageWidth;
    const rawPatchWidth = Math.max(48, featureWidth * widthFactor);
    const rawPatchHeight = Math.max(32, featureWidth * heightFactor);
    const sourceScale = Math.min(1, 900 / rawPatchWidth);
    const patchWidth = Math.round(rawPatchWidth * sourceScale);
    const patchHeight = Math.round(rawPatchHeight * sourceScale);
    const patch = document.createElement("canvas");
    patch.width = patchWidth;
    patch.height = patchHeight;
    patch.sourceScale = sourceScale;
    const patchContext = patch.getContext("2d");
    patchContext.scale(sourceScale, sourceScale);
    patchContext.translate(rawPatchWidth / 2, rawPatchHeight / 2);
    patchContext.rotate(-feature.angle);
    patchContext.drawImage(
      state.image,
      -feature.x * imageWidth,
      -feature.y * imageHeight
    );
    return patch;
  }

  function buildFeaturePatches() {
    if (!state.avatarReady || !state.face) return;
    state.patches.mouth = createAlignedPatch(state.face.mouth, 1.55, 0.82);
    state.patches.eyes = state.face.eyes.map((eye) => createAlignedPatch(eye, 1.7, 0.9));
  }

  function extractLandmarkCenter(landmark, imageWidth, imageHeight) {
    const locations = Array.isArray(landmark.locations) ? landmark.locations : [landmark.locations];
    const valid = locations.filter(Boolean);
    if (!valid.length) return null;
    return {
      x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length / imageWidth,
      y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length / imageHeight
    };
  }

  async function detectWithNativeFaceDetector(image) {
    if (!window.FaceDetector) return null;
    const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: false });
    const faces = await detector.detect(image);
    if (!faces.length) return null;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const face = faces[0];
    const eyeLandmarks = (face.landmarks || []).filter((landmark) => landmark.type === "eye");
    const mouthLandmark = (face.landmarks || []).find((landmark) => landmark.type === "mouth");
    if (eyeLandmarks.length < 2 || !mouthLandmark) return null;
    const eyes = eyeLandmarks
      .map((landmark) => extractLandmarkCenter(landmark, imageWidth, imageHeight))
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    const mouthCenter = extractLandmarkCenter(mouthLandmark, imageWidth, imageHeight);
    if (eyes.length < 2 || !mouthCenter) return null;
    const eyeDistance = pointDistance(eyes[0], eyes[1]);
    const box = face.boundingBox;
    return {
      source: "native",
      box: {
        x: box.x / imageWidth,
        y: box.y / imageHeight,
        width: box.width / imageWidth,
        height: box.height / imageHeight
      },
      mouth: {
        x: mouthCenter.x,
        y: mouthCenter.y,
        width: eyeDistance * 0.78,
        height: eyeDistance * 0.18,
        angle: Math.atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x)
      },
      eyes: eyes.map((eye) => ({
        x: eye.x,
        y: eye.y,
        width: eyeDistance * 0.34,
        height: eyeDistance * 0.11,
        angle: Math.atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x)
      })),
      landmarks: [...eyes, mouthCenter]
    };
  }

  async function ensureFaceMesh() {
    if (state.faceMesh) return state.faceMesh;
    if (!window.FaceMesh) throw new Error("Face Mesh chưa được nạp.");
    const root = new URL("vendor/face_mesh/", window.location.href);
    const mesh = new window.FaceMesh({
      locateFile: (file) => new URL(file, root).href
    });
    mesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });
    mesh.onResults((results) => {
      if (state.faceMeshResolver) state.faceMeshResolver(results);
      state.faceMeshResolver = null;
      state.faceMeshRejecter = null;
    });
    state.faceMesh = mesh;
    return mesh;
  }

  async function detectWithMediaPipe(image) {
    const mesh = await ensureFaceMesh();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        state.faceMeshResolver = null;
        state.faceMeshRejecter = null;
        reject(new Error("Face Mesh quá thời gian xử lý."));
      }, 20000);
      state.faceMeshResolver = (results) => {
        window.clearTimeout(timeout);
        resolve(results);
      };
      state.faceMeshRejecter = reject;
      mesh.send({ image }).catch((error) => {
        window.clearTimeout(timeout);
        state.faceMeshResolver = null;
        state.faceMeshRejecter = null;
        reject(error);
      });
    });
  }

  function geometryFromMesh(landmarks) {
    if (!landmarks || landmarks.length < 468) return null;
    const point = (index) => ({ x: landmarks[index].x, y: landmarks[index].y });
    const mouthLeft = point(61);
    const mouthRight = point(291);
    const mouthUpper = point(13);
    const mouthLower = point(14);
    const leftEye = normalizedFeature(point(33), point(133), point(159), point(145));
    const rightEye = normalizedFeature(point(362), point(263), point(386), point(374));
    const mouthCenter = pointMid(mouthUpper, mouthLower);
    const mouthWidth = pointDistance(mouthLeft, mouthRight);
    const xs = landmarks.slice(0, 468).map((landmark) => landmark.x);
    const ys = landmarks.slice(0, 468).map((landmark) => landmark.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    return {
      source: "mediapipe",
      box: {
        x: clamp(minX - boxWidth * 0.04, 0, 1),
        y: clamp(minY - boxHeight * 0.12, 0, 1),
        width: clamp(boxWidth * 1.08, 0, 1),
        height: clamp(boxHeight * 1.14, 0, 1)
      },
      mouth: {
        x: mouthCenter.x,
        y: mouthCenter.y,
        width: mouthWidth * 1.04,
        height: Math.max(pointDistance(mouthUpper, mouthLower) * 1.25, mouthWidth * 0.14),
        angle: Math.atan2(mouthRight.y - mouthLeft.y, mouthRight.x - mouthLeft.x)
      },
      eyes: [leftEye, rightEye].sort((a, b) => a.x - b.x),
      landmarks: [point(33), point(133), point(263), point(362), mouthLeft, mouthRight, mouthUpper, mouthLower]
    };
  }

  async function detectFaceLandmarks(revision = state.imageRevision) {
    if (!state.avatarReady || revision !== state.imageRevision) return;
    if (state.detectingFace) {
      state.pendingDetectionRevision = revision;
      return;
    }
    const image = state.image;
    state.detectingFace = true;
    ui.detectFaceButton.disabled = true;
    ui.detectFaceButton.textContent = "Đang nhận diện…";
    setDetectionStatus("Đang chạy Face Mesh", "Mô hình xử lý ảnh ngay trên thiết bị.");
    try {
      let geometry = null;
      try {
        geometry = await detectWithNativeFaceDetector(image);
      } catch (nativeError) {
        console.info("Native FaceDetector không khả dụng:", nativeError);
      }
      if (!geometry) {
        const results = await detectWithMediaPipe(image);
        geometry = geometryFromMesh(results.multiFaceLandmarks?.[0]);
      }
      if (revision !== state.imageRevision) return;
      if (!geometry) throw new Error("Không tìm thấy đủ landmark khuôn mặt.");
      const quality = applyFaceGeometry(geometry);
      setDetectionStatus(
        geometry.source === "mediapipe" ? "Đã nhận diện 468 điểm mặt" : "Đã nhận diện bằng Edge",
        `Môi, hai mắt và tỷ lệ mặt đã khóa theo ảnh hiện tại · chất lượng ${quality}/100.`,
        "success"
      );
      setStage("Khuôn mặt đã khóa", "Khẩu hình mềm và chớp mắt đã sẵn sàng");
      showToast("Đã tự động định vị môi, mắt và gương mặt.");
    } catch (error) {
      if (revision !== state.imageRevision) return;
      console.error("Face detection failed:", error);
      const fileHint = window.location.protocol === "file:"
        ? " Hãy cài bằng edge://extensions để mô hình WASM hoạt động."
        : "";
      setDetectionStatus("Không thể tự nhận diện", `Dùng “Chỉnh 5 điểm” để định vị thủ công.${fileHint}`, "error");
      setStage("Cần hiệu chỉnh", "Chọn Chỉnh 5 điểm để đặt mắt và miệng");
      showToast(`Không nhận diện được khuôn mặt.${fileHint}`, true);
    } finally {
      state.detectingFace = false;
      if (revision === state.imageRevision) {
        ui.detectFaceButton.disabled = false;
        ui.detectFaceButton.textContent = "Nhận diện tự động";
      }
      const queuedRevision = state.pendingDetectionRevision;
      state.pendingDetectionRevision = null;
      if (queuedRevision === state.imageRevision && queuedRevision !== revision) {
        window.queueMicrotask(() => detectFaceLandmarks(queuedRevision));
      }
    }
  }

  function toggleCalibration(force) {
    state.calibrating = typeof force === "boolean" ? force : !state.calibrating;
    if (state.calibrating) {
      state.calibrationIndex = 0;
      state.manualPoints = {};
    }
    ui.calibrateButton.classList.toggle("active", state.calibrating);
    ui.calibrateButton.textContent = state.calibrating ? "Hủy hiệu chỉnh" : "Chỉnh 5 điểm";
    ui.calibrationHint.hidden = !state.calibrating;
    ui.canvas.classList.toggle("calibrating", state.calibrating);
    if (state.calibrating) {
      ui.calibrationText.textContent = CALIBRATION_STEPS[0].label;
      setStage("Hiệu chỉnh 1/5", CALIBRATION_STEPS[0].label);
      state.showGuidesUntil = Number.POSITIVE_INFINITY;
    } else {
      setStage("Sẵn sàng", state.face?.source === "manual" ? "Mốc mặt thủ công đã được lưu" : "Hiệu chỉnh đã hủy");
      state.showGuidesUntil = performance.now() + 1000;
    }
  }

  function setMouthFromCanvas(event) {
    if (!state.calibrating || !state.avatarReady) return;
    const rect = ui.canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (ui.canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (ui.canvas.height / rect.height);
    const fit = getCoverTransform();
    const step = CALIBRATION_STEPS[state.calibrationIndex];
    state.manualPoints[step.key] = {
      x: clamp((px - fit.x) / fit.drawWidth, 0.02, 0.98),
      y: clamp((py - fit.y) / fit.drawHeight, 0.02, 0.98)
    };
    state.calibrationIndex += 1;
    if (state.calibrationIndex < CALIBRATION_STEPS.length) {
      const nextStep = CALIBRATION_STEPS[state.calibrationIndex];
      ui.calibrationText.textContent = nextStep.label;
      setStage(`Hiệu chỉnh ${state.calibrationIndex + 1}/5`, nextStep.label);
      return;
    }

    const manual = state.manualPoints;
    const eyeMid = pointMid(manual.leftEye, manual.rightEye);
    const eyeDistance = pointDistance(manual.leftEye, manual.rightEye);
    const mouthWidth = pointDistance(manual.mouthLeft, manual.mouthRight);
    const faceHeight = Math.max(pointDistance(eyeMid, manual.mouthCenter) * 2.55, eyeDistance * 1.55);
    const faceWidth = eyeDistance * 2.15;
    const angle = Math.atan2(
      manual.mouthRight.y - manual.mouthLeft.y,
      manual.mouthRight.x - manual.mouthLeft.x
    );
    const manualGeometry = {
      source: "manual",
      box: {
        x: clamp(eyeMid.x - faceWidth / 2, 0, 1),
        y: clamp(eyeMid.y - faceHeight * 0.34, 0, 1),
        width: clamp(faceWidth, 0, 1),
        height: clamp(faceHeight, 0, 1)
      },
      mouth: {
        x: manual.mouthCenter.x,
        y: manual.mouthCenter.y,
        width: mouthWidth * 1.04,
        height: mouthWidth * 0.2,
        angle
      },
      eyes: [manual.leftEye, manual.rightEye].map((eye) => ({
        x: eye.x,
        y: eye.y,
        width: eyeDistance * 0.34,
        height: eyeDistance * 0.11,
        angle: Math.atan2(
          manual.rightEye.y - manual.leftEye.y,
          manual.rightEye.x - manual.leftEye.x
        )
      })),
      landmarks: Object.values(manual)
    };
    try {
      applyFaceGeometry(manualGeometry);
    } catch (error) {
      console.warn("Manual calibration rejected:", error);
      setDetectionStatus("Năm điểm chưa hợp lý", "Hãy đặt lại hai mắt, hai khóe miệng và tâm môi.", "error");
      showToast("Các điểm hiệu chỉnh chưa đúng tỷ lệ khuôn mặt. Hãy thử lại.", true);
      state.calibrationIndex = 0;
      state.manualPoints = {};
      ui.calibrationText.textContent = CALIBRATION_STEPS[0].label;
      setStage("Hiệu chỉnh 1/5", CALIBRATION_STEPS[0].label);
      return;
    }
    toggleCalibration(false);
    setDetectionStatus(
      "Đã hiệu chỉnh thủ công",
      `Đã khóa hai mắt, hai khóe miệng và tâm môi · chất lượng ${state.faceQuality}/100.`,
      "success"
    );
    showToast("Đã hoàn tất hiệu chỉnh 5 điểm khuôn mặt.");
  }

  function visemeFromText(text) {
    const value = text.toLocaleLowerCase("vi-VN");
    const unit = value.match(/\p{L}/u)?.[0] || value[0] || "";
    if (/[mbp]/u.test(unit)) return "closed";
    if (/[uưoôơ]/u.test(unit)) return "round";
    if (/[aăâeê]/u.test(unit)) return "wide";
    if (/[iy]/u.test(unit)) return "narrow";
    if (/[fv]/u.test(unit) || value.startsWith("ph")) return "bite";
    if (/[lntdđ]/u.test(unit)) return "tongue";
    return "neutral";
  }

  function buildVietnameseVisemeTimeline(text) {
    const normalized = text.toLocaleLowerCase("vi-VN");
    const units = [];
    const compoundVisemes = {
      ph: { viseme: "bite", target: 0.23, weight: 0.9 },
      th: { viseme: "tongue", target: 0.29, weight: 0.86 },
      tr: { viseme: "neutral", target: 0.27, weight: 0.88 },
      ch: { viseme: "narrow", target: 0.25, weight: 0.86 },
      nh: { viseme: "narrow", target: 0.24, weight: 0.84 },
      ng: { viseme: "neutral", target: 0.22, weight: 0.88 },
      kh: { viseme: "neutral", target: 0.26, weight: 0.9 },
      gh: { viseme: "neutral", target: 0.24, weight: 0.86 },
      qu: { viseme: "round", target: 0.35, weight: 1.02 },
      gi: { viseme: "narrow", target: 0.27, weight: 0.9 }
    };
    for (let index = 0; index < normalized.length; index += 1) {
      const current = normalized[index];
      const pair = normalized.slice(index, index + 2);
      if (compoundVisemes[pair]) {
        units.push(compoundVisemes[pair]);
        index += 1;
        continue;
      }
      if (/[\p{L}\p{N}]/u.test(current)) {
        const viseme = visemeFromText(current);
        const target = {
          closed: 0.035,
          round: 0.41,
          wide: 0.46,
          narrow: 0.27,
          bite: 0.21,
          tongue: 0.3,
          neutral: 0.28
        }[viseme];
        units.push({ viseme, target, weight: /[aăâeêioôơuưy]/u.test(current) ? 1.12 : 0.82 });
        continue;
      }
      if (/[.,!?;:]/u.test(current)) {
        units.push({ viseme: "closed", target: 0.008, weight: /[.!?]/u.test(current) ? 2.4 : 1.55 });
      } else if (/\s/u.test(current)) {
        units.push({ viseme: "closed", target: 0.014, weight: 0.55 });
      }
    }
    return units.length ? units : [{ viseme: "closed", target: 0.008, weight: 1 }];
  }

  function getVisemeShape(viseme = state.viseme) {
    switch (viseme) {
      case "closed": return { width: 1, open: 0.02 };
      case "round": return { width: 0.87, open: 0.72 };
      case "wide": return { width: 1.04, open: 0.66 };
      case "narrow": return { width: 0.94, open: 0.3 };
      case "bite": return { width: 0.98, open: 0.22 };
      case "tongue": return { width: 0.98, open: 0.46 };
      case "neutral": return { width: 1, open: 0.42 };
      default: return { width: 1, open: 0 };
    }
  }

  function setViseme(viseme) {
    state.viseme = viseme;
    const shape = getVisemeShape(viseme);
    state.mouthShape.targetWidth = shape.width;
    state.mouthShape.targetOpen = shape.open;
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
    const level = clamp((rms - 0.012) * 7.8, 0, 1);
    if (state.frequencyData && level > 0.055) {
      state.analyser.getByteFrequencyData(state.frequencyData);
      const bandEnergy = (from, to) => {
        let total = 0;
        for (let index = from; index < to; index += 1) total += state.frequencyData[index] || 0;
        return total / Math.max(1, to - from);
      };
      const low = bandEnergy(1, 18);
      const mid = bandEnergy(18, 52);
      const high = bandEnergy(52, Math.min(128, state.frequencyData.length));
      state.spectralViseme = low > high * 1.35
        ? "round"
        : high > low * 1.28
          ? "wide"
          : mid > low * 1.18
            ? "narrow"
            : "neutral";
    }
    return level;
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
    if (!state.face?.mouth || !state.patches.mouth) return;
    const feature = state.face.mouth;
    const patch = state.patches.mouth;
    const shape = {
      width: state.mouthShape.width,
      open: state.mouthShape.open
    };
    const mouthGain = Number(ui.mouthSize.value) / 100;
    const effectiveOpen = clamp(openAmount * (0.6 + shape.open * 0.4) * mouthGain, 0, 0.72);
    const mouthAperture = clamp((effectiveOpen - 0.035) / 0.62, 0, 1);
    if (mouthAperture < 0.012) return;

    const imageWidth = state.image.naturalWidth || state.image.width;
    const sourceMouthWidth = feature.width * imageWidth * (patch.sourceScale || 1);
    const regionWidth = sourceMouthWidth * 1.08;
    const regionHeight = sourceMouthWidth * 0.48;
    const gap = sourceMouthWidth * mouthAperture * 0.095;
    const centerX = patch.width / 2;
    const centerY = patch.height / 2;
    const work = state.featureWork.mouth;
    const layer = state.featureWork.mouthLayer;
    const mask = state.featureWork.mouthMask;
    for (const canvas of [work, layer, mask]) {
      if (canvas.width !== patch.width || canvas.height !== patch.height) {
        canvas.width = patch.width;
        canvas.height = patch.height;
      }
    }
    const workContext = work.getContext("2d");
    const layerContext = layer.getContext("2d");
    const maskContext = mask.getContext("2d");
    workContext.clearRect(0, 0, work.width, work.height);
    workContext.drawImage(patch, 0, 0);
    layerContext.clearRect(0, 0, layer.width, layer.height);
    maskContext.clearRect(0, 0, mask.width, mask.height);

    if (!patch.mouthPalette) {
      try {
        const pixel = patch.getContext("2d").getImageData(
          Math.round(centerX),
          Math.round(centerY),
          1,
          1
        ).data;
        const luminance = pixel[0] * 0.2126 + pixel[1] * 0.7152 + pixel[2] * 0.0722;
        const core = Math.round(clamp(luminance * 0.16, 16, 30));
        const edge = Math.round(clamp(luminance * 0.3, 28, 52));
        patch.mouthPalette = {
          core: [core + 5, core + 2, core],
          edge: [edge + 6, edge + 3, edge]
        };
      } catch {
        patch.mouthPalette = {
          core: [23, 19, 17],
          edge: [42, 36, 33]
        };
      }
    }

    const apertureHalfWidth = regionWidth * (shape.width < 0.91 ? 0.24 : 0.31);
    const apertureHalfHeight = Math.max(regionHeight * 0.012, gap * 0.52);
    const apertureVisibility = clamp((mouthAperture - 0.14) / 0.86, 0, 1);
    const [coreR, coreG, coreB] = patch.mouthPalette.core;
    const [edgeR, edgeG, edgeB] = patch.mouthPalette.edge;
    const apertureGradient = layerContext.createLinearGradient(
      centerX,
      centerY - apertureHalfHeight,
      centerX,
      centerY + apertureHalfHeight
    );
    apertureGradient.addColorStop(0, `rgba(${edgeR}, ${edgeG}, ${edgeB}, 0.72)`);
    apertureGradient.addColorStop(0.45, `rgba(${coreR}, ${coreG}, ${coreB}, 0.98)`);
    apertureGradient.addColorStop(1, `rgba(${coreR}, ${coreG}, ${coreB}, 0.9)`);
    layerContext.globalAlpha = Math.min(0.92, apertureVisibility * 1.35);
    layerContext.fillStyle = apertureGradient;
    layerContext.beginPath();
    layerContext.moveTo(centerX - apertureHalfWidth, centerY);
    layerContext.bezierCurveTo(
      centerX - apertureHalfWidth * 0.52,
      centerY - apertureHalfHeight * 0.92,
      centerX + apertureHalfWidth * 0.52,
      centerY - apertureHalfHeight * 0.92,
      centerX + apertureHalfWidth,
      centerY
    );
    layerContext.bezierCurveTo(
      centerX + apertureHalfWidth * 0.5,
      centerY + apertureHalfHeight,
      centerX - apertureHalfWidth * 0.5,
      centerY + apertureHalfHeight,
      centerX - apertureHalfWidth,
      centerY
    );
    layerContext.closePath();
    layerContext.fill();

    const lipHalfWidth = regionWidth * 0.42;
    const lipOuterHeight = regionHeight * 0.46;
    const lipInnerCurve = Math.max(regionHeight * 0.014, gap * 0.12);
    const upperCornerY = centerY - gap * 0.12;
    const upperCenterY = centerY - gap * 0.3;
    const lowerCornerY = centerY + gap * 0.12;
    const lowerCenterY = centerY + gap * 0.3;

    layerContext.save();
    layerContext.beginPath();
    layerContext.moveTo(centerX - lipHalfWidth, upperCornerY);
    layerContext.bezierCurveTo(
      centerX - lipHalfWidth * 0.48,
      upperCenterY - lipInnerCurve,
      centerX + lipHalfWidth * 0.48,
      upperCenterY - lipInnerCurve,
      centerX + lipHalfWidth,
      upperCornerY
    );
    layerContext.lineTo(centerX + lipHalfWidth, centerY - lipOuterHeight);
    layerContext.lineTo(centerX - lipHalfWidth, centerY - lipOuterHeight);
    layerContext.closePath();
    layerContext.clip();
    layerContext.translate(centerX, -gap * 0.32);
    layerContext.scale(shape.width, 1);
    layerContext.translate(-centerX, 0);
    layerContext.globalAlpha = 0.995;
    layerContext.drawImage(patch, 0, 0);
    layerContext.restore();

    layerContext.save();
    layerContext.beginPath();
    layerContext.moveTo(centerX - lipHalfWidth, lowerCornerY);
    layerContext.bezierCurveTo(
      centerX - lipHalfWidth * 0.48,
      lowerCenterY + lipInnerCurve,
      centerX + lipHalfWidth * 0.48,
      lowerCenterY + lipInnerCurve,
      centerX + lipHalfWidth,
      lowerCornerY
    );
    layerContext.lineTo(centerX + lipHalfWidth, centerY + lipOuterHeight);
    layerContext.lineTo(centerX - lipHalfWidth, centerY + lipOuterHeight);
    layerContext.closePath();
    layerContext.clip();
    layerContext.translate(centerX, gap * 0.32);
    layerContext.scale(shape.width, 1);
    layerContext.translate(-centerX, 0);
    layerContext.globalAlpha = 0.995;
    layerContext.drawImage(patch, 0, 0);
    layerContext.restore();

    const maskRadiusX = regionWidth * 0.46;
    const maskRadiusY = regionHeight * 0.52;
    maskContext.save();
    maskContext.translate(centerX, centerY);
    maskContext.scale(1, maskRadiusY / maskRadiusX);
    const feather = maskContext.createRadialGradient(0, 0, 0, 0, 0, maskRadiusX);
    feather.addColorStop(0, "rgba(255, 255, 255, 1)");
    feather.addColorStop(0.72, "rgba(255, 255, 255, 1)");
    feather.addColorStop(0.9, "rgba(255, 255, 255, 0.72)");
    feather.addColorStop(1, "rgba(255, 255, 255, 0)");
    maskContext.fillStyle = feather;
    maskContext.fillRect(-maskRadiusX, -maskRadiusX, maskRadiusX * 2, maskRadiusX * 2);
    maskContext.restore();

    layerContext.save();
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.drawImage(mask, 0, 0);
    layerContext.restore();
    workContext.drawImage(layer, 0, 0);

    const mouthX = fit.x + feature.x * fit.width * fit.scale;
    const mouthY = fit.y + feature.y * fit.height * fit.scale;
    const patchTargetScale = fit.scale / (patch.sourceScale || 1);
    ctx.save();
    ctx.translate(mouthX, mouthY);
    ctx.rotate(feature.angle);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      work,
      -work.width * patchTargetScale / 2,
      -work.height * patchTargetScale / 2,
      work.width * patchTargetScale,
      work.height * patchTargetScale
    );
    ctx.restore();
  }

  function updateBlink(timestamp) {
    const motion = Number(ui.faceMotion.value) / 100;
    if (motion <= 0 || !state.face?.eyes?.length) {
      state.blink.amount = 0;
      return;
    }
    if (!state.blink.startedAt && timestamp >= state.blink.nextAt) {
      state.blink.startedAt = timestamp;
      state.blink.duration = 155 + Math.random() * 70;
      state.blink.isRepeat = state.blink.repeatAfter;
      state.blink.repeatAfter = false;
    }
    if (!state.blink.startedAt) {
      state.blink.amount = 0;
      return;
    }
    const progress = (timestamp - state.blink.startedAt) / state.blink.duration;
    if (progress >= 1) {
      state.blink.amount = 0;
      state.blink.startedAt = 0;
      if (!state.blink.isRepeat && Math.random() < 0.14) {
        state.blink.repeatAfter = true;
        state.blink.nextAt = timestamp + 85 + Math.random() * 55;
      } else {
        const blinkFactor = clamp(Number(state.emotion.blink_factor || 1), 0.55, 1.8);
        state.blink.nextAt = timestamp + (2400 + Math.random() * 4300) / blinkFactor;
      }
      state.blink.isRepeat = false;
      return;
    }
    state.blink.amount = Math.sin(Math.PI * progress) ** 1.7 * clamp(0.48 + motion * 0.46, 0, 0.92);
  }

  function drawEyeBlink(fit, eye, index, amount, gaze = { x: 0, y: 0 }) {
    const patch = state.patches.eyes[index];
    const gazeStrength = Math.abs(gaze.x) + Math.abs(gaze.y);
    if (!patch || (amount < 0.015 && gazeStrength < 0.015)) return;
    const imageWidth = state.image.naturalWidth || state.image.width;
    const eyeWidth = eye.width * imageWidth * (patch.sourceScale || 1);
    const regionWidth = eyeWidth * 1.08;
    const regionHeight = eyeWidth * 0.5;
    const centerX = patch.width / 2;
    const centerY = patch.height / 2;
    const work = state.featureWork.eyes[index];
    if (work.width !== patch.width || work.height !== patch.height) {
      work.width = patch.width;
      work.height = patch.height;
    }
    const workContext = work.getContext("2d");
    workContext.clearRect(0, 0, work.width, work.height);
    workContext.drawImage(patch, 0, 0);
    if (gazeStrength >= 0.015) {
      workContext.save();
      workContext.beginPath();
      workContext.ellipse(centerX, centerY, regionWidth * 0.34, regionHeight * 0.43, 0, 0, Math.PI * 2);
      workContext.clip();
      workContext.globalAlpha = clamp(gazeStrength * 0.42, 0.08, 0.38);
      workContext.drawImage(
        patch,
        gaze.x * regionWidth * 0.035,
        gaze.y * regionHeight * 0.045
      );
      workContext.restore();
    }
    workContext.save();
    workContext.beginPath();
    workContext.ellipse(centerX, centerY, regionWidth * 0.56, regionHeight * 0.58, 0, 0, Math.PI * 2);
    workContext.clip();
    workContext.globalAlpha = amount;

    const skinBandHeight = Math.max(2, regionHeight * 0.2);
    workContext.drawImage(
      patch,
      centerX - regionWidth / 2,
      centerY - regionHeight * 0.62,
      regionWidth,
      skinBandHeight,
      centerX - regionWidth / 2,
      centerY - regionHeight / 2,
      regionWidth,
      regionHeight / 2
    );
    workContext.drawImage(
      patch,
      centerX - regionWidth / 2,
      centerY + regionHeight * 0.42,
      regionWidth,
      skinBandHeight,
      centerX - regionWidth / 2,
      centerY,
      regionWidth,
      regionHeight / 2
    );
    workContext.globalAlpha = amount * 0.24;
    workContext.strokeStyle = "#4a2a32";
    workContext.lineWidth = Math.max(0.8, eyeWidth * 0.015);
    workContext.lineCap = "round";
    workContext.beginPath();
    workContext.moveTo(centerX - regionWidth * 0.35, centerY);
    workContext.quadraticCurveTo(centerX, centerY + regionHeight * 0.07, centerX + regionWidth * 0.35, centerY);
    workContext.stroke();
    workContext.restore();

    const eyeX = fit.x + eye.x * fit.width * fit.scale;
    const eyeY = fit.y + eye.y * fit.height * fit.scale;
    const patchTargetScale = fit.scale / (patch.sourceScale || 1);
    ctx.save();
    ctx.translate(eyeX, eyeY);
    ctx.rotate(eye.angle);
    ctx.drawImage(
      work,
      -work.width * patchTargetScale / 2,
      -work.height * patchTargetScale / 2,
      work.width * patchTargetScale,
      work.height * patchTargetScale
    );
    ctx.restore();
  }

  function updateHeadMotion(timestamp, motion, active) {
    const head = state.headMotion;
    if (timestamp >= head.nextTargetAt) {
      const phaseScale = {
        idle: 0.46,
        listening: 0.58,
        recording: 0.64,
        transcribing: 0.54,
        thinking: 0.72,
        speaking: 1,
        interrupted: 0.68
      }[state.conversationPhase] || (active ? 1 : 0.48);
      const activityScale = active ? phaseScale : Math.min(phaseScale, 0.5);
      const emotionEnergy = clamp(Number(state.emotion.head_energy || 1), 0.45, 1.7);
      const listeningBias = ["listening", "recording", "transcribing"].includes(
        state.conversationPhase
      ) ? 0.18 : 0;
      head.targetX = (
        (Math.random() - 0.5) * 1.8 * activityScale
        + Number(state.emotion.gaze_x || 0) * 0.62
      ) * motion * emotionEnergy;
      head.targetY = (
        (Math.random() - 0.5) * 2.2 * activityScale
        + Number(state.emotion.gaze_y || 0) * 0.5
        + listeningBias
      ) * motion * emotionEnergy;
      head.targetRotation = (Math.random() - 0.5) * 0.0048 * activityScale * motion * emotionEnergy;
      head.nextTargetAt = timestamp + 1250 + Math.random() * 2100;
    }
    const easing = active ? 0.036 : 0.024;
    head.x += (head.targetX - head.x) * easing;
    head.y += (head.targetY - head.y) * easing;
    head.rotation += (head.targetRotation - head.rotation) * easing;
    const speakingNod = state.conversationPhase === "speaking"
      ? Math.sin(timestamp / 310) * state.level * 0.26 * motion
      : 0;
    const listeningResponse = ["listening", "recording"].includes(state.conversationPhase)
      ? Math.sin(timestamp / 760) * Math.min(state.level, 0.5) * 0.18 * motion
      : 0;
    return {
      x: head.x,
      y: head.y + state.level * 0.22 * motion + speakingNod + listeningResponse,
      rotation: head.rotation
    };
  }

  function updateGaze(timestamp, motion) {
    const gaze = state.gaze;
    if (timestamp >= gaze.nextTargetAt) {
      const arousal = clamp(Number(state.emotion.arousal || 0.22), 0, 1);
      const listening = ["listening", "recording", "transcribing"].includes(
        state.conversationPhase
      );
      const phaseBiasX = state.conversationPhase === "thinking" ? 0.14 : 0;
      const phaseBiasY = state.conversationPhase === "thinking" ? -0.08 : 0;
      gaze.targetX = clamp(
        (listening ? 0 : Number(state.emotion.gaze_x || 0))
        + phaseBiasX
        + (Math.random() - 0.5) * (listening ? 0.1 : 0.22 + arousal * 0.2),
        -1,
        1
      );
      gaze.targetY = clamp(
        (listening ? 0 : Number(state.emotion.gaze_y || 0))
        + phaseBiasY
        + (Math.random() - 0.5) * (listening ? 0.075 : 0.16),
        -0.7,
        0.7
      );
      gaze.nextTargetAt = timestamp
        + (listening ? 1050 : 650)
        + Math.random() * (1800 - arousal * 700);
    }
    const easing = 0.055;
    gaze.x += (gaze.targetX - gaze.x) * easing;
    gaze.y += (gaze.targetY - gaze.y) * easing;
    return { x: gaze.x * motion, y: gaze.y * motion };
  }

  function drawFaceGuides(fit, timestamp) {
    if (!state.face || (!state.calibrating && timestamp > state.showGuidesUntil)) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 79, 154, .9)";
    ctx.fillStyle = "rgba(255, 79, 154, .95)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    const box = state.face.box;
    ctx.strokeRect(
      fit.x + box.x * fit.drawWidth,
      fit.y + box.y * fit.drawHeight,
      box.width * fit.drawWidth,
      box.height * fit.drawHeight
    );
    for (const eye of state.face.eyes) {
      ctx.beginPath();
      ctx.ellipse(
        fit.x + eye.x * fit.drawWidth,
        fit.y + eye.y * fit.drawHeight,
        eye.width * fit.drawWidth * 0.55,
        eye.height * fit.drawHeight * 0.62,
        eye.angle,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    const mouth = state.face.mouth;
    ctx.beginPath();
    ctx.ellipse(
      fit.x + mouth.x * fit.drawWidth,
      fit.y + mouth.y * fit.drawHeight,
      mouth.width * fit.drawWidth * 0.54,
      Math.max(mouth.height * fit.drawHeight * 0.75, 7),
      mouth.angle,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of Object.values(state.manualPoints)) {
      ctx.beginPath();
      ctx.arc(
        fit.x + point.x * fit.drawWidth,
        fit.y + point.y * fit.drawHeight,
        7,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function renderFrame(timestamp) {
    requestAnimationFrame(renderFrame);
    const frameInterval = document.hidden ? 100 : (1000 / 30);
    if (state.lastFrameAt && timestamp - state.lastFrameAt < frameInterval) return;
    state.lastFrameAt = timestamp;

    const audioLevel = calculateAudioLevel();
    if (state.activeSignal === "audio" || state.activeSignal === "mic") {
      const controlledMouthLevel = audioLevel < 0.045
        ? 0
        : clamp((audioLevel - 0.045) * 0.72, 0, 0.62);
      state.mouthTarget = controlledMouthLevel;
      if (audioLevel > 0.08) {
        const envelopeViseme = state.spectralViseme;
        setViseme(
          state.activeSignal === "mic" && timestamp < state.liveVisemeUntil
            ? state.liveViseme
            : envelopeViseme
        );
        state.lastActivityAt = timestamp;
      } else if (timestamp - state.lastActivityAt > 130) {
        setViseme("closed");
      }
    } else if (!state.speechActive) {
      state.mouthTarget = 0;
      setViseme("idle");
    }

    state.level += (Math.max(audioLevel, state.speechActive ? state.mouthTarget : 0) - state.level) * 0.22;
    state.mouthOpen += (state.mouthTarget - state.mouthOpen) * (state.mouthTarget > state.mouthOpen ? 0.38 : 0.22);
    const shapeEase = state.mouthShape.targetOpen > state.mouthShape.open ? 0.34 : 0.23;
    state.mouthShape.open += (state.mouthShape.targetOpen - state.mouthShape.open) * shapeEase;
    state.mouthShape.width += (state.mouthShape.targetWidth - state.mouthShape.width) * 0.27;
    updateMeter(state.level);
    updateBlink(timestamp);

    if (!state.avatarReady) {
      drawEmptyStage();
      return;
    }

    const fit = getCoverTransform();
    const active = state.activeSignal !== "idle" || state.speechActive;
    const t = timestamp / 1000;
    const motion = Number(ui.faceMotion.value) / 100;
    const head = updateHeadMotion(timestamp, motion, active);
    const gaze = updateGaze(timestamp, motion);
    const breath = 1 + Math.sin(t * 1.05) * 0.0009 * motion;
    const faceCenterX = state.face
      ? fit.x + (state.face.box.x + state.face.box.width / 2) * fit.drawWidth
      : ui.canvas.width / 2;
    const faceCenterY = state.face
      ? fit.y + (state.face.box.y + state.face.box.height / 2) * fit.drawHeight
      : ui.canvas.height / 2;

    ctx.fillStyle = "#050a12";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx.save();
    ctx.translate(faceCenterX + head.x, faceCenterY + head.y);
    ctx.rotate(head.rotation);
    ctx.scale(breath, breath);
    ctx.translate(-faceCenterX, -faceCenterY);
    ctx.drawImage(state.image, fit.x, fit.y, fit.drawWidth, fit.drawHeight);
    if (state.face?.eyes) {
      state.face.eyes.forEach((eye, index) => drawEyeBlink(
        fit, eye, index, state.blink.amount, gaze
      ));
    }
    drawAnimatedMouth(fit, state.mouthOpen);
    ctx.restore();
    drawFaceGuides(fit, timestamp);
  }

  function stopTts(updateStatus = true) {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    state.speechActive = false;
    state.activeSignal = state.activeSignal === "tts" ? "idle" : state.activeSignal;
    state.mouthTarget = 0;
    setViseme("idle");
    window.clearInterval(state.ttsTimer);
    state.ttsTimer = null;
    state.visemeTimers.forEach((timer) => window.clearTimeout(timer));
    state.visemeTimers = [];
    if (updateStatus) setStage("Đã dừng", "Giọng đọc đã dừng");
  }

  function scheduleTimedVisemes(timeline) {
    state.visemeTimers.forEach((timer) => window.clearTimeout(timer));
    state.visemeTimers = timeline.slice(0, 1_200).map((item) => window.setTimeout(() => {
      if (!state.speechActive) return;
      setViseme(String(item.viseme || "neutral"));
      state.mouthTarget = clamp(Number(item.open || 0.02), 0.008, 0.58);
      state.mouthShape.targetWidth = clamp(Number(item.width || 1), 0.72, 1.25);
      state.lastActivityAt = performance.now();
      const releaseTimer = window.setTimeout(() => {
        if (state.speechActive) {
          state.mouthTarget = clamp(Number(item.release_open || item.open || 0.02), 0.008, 0.58);
        }
      }, Math.max(24, Number(item.duration_ms || 80) * 0.66));
      state.visemeTimers.push(releaseTimer);
    }, Math.max(0, Number(item.at_ms || 0))));
  }

  function scheduleTextAlignedVisemes(text, rate = 1) {
    const units = buildVietnameseVisemeTimeline(text);
    window.clearTimeout(state.ttsTimer);
    const millisecondsPerWeight = clamp(90 / Math.max(0.55, Number(rate) || 1), 58, 150);
    let cursor = 0;
    const timeline = units.map((unit, index) => {
      const duration = millisecondsPerWeight * unit.weight;
      const next = units[index + 1] || { target: 0.008 };
      const shape = getVisemeShape(unit.viseme);
      const item = {
        at_ms: cursor,
        duration_ms: duration,
        viseme: unit.viseme,
        open: unit.target,
        width: shape.width,
        release_open: unit.target * 0.62 + next.target * 0.38
      };
      cursor += duration;
      return item;
    });
    scheduleTimedVisemes(timeline);
    state.ttsTimer = window.setTimeout(() => {
      if (state.speechActive) {
        state.mouthTarget = 0.012;
        setViseme("closed");
      }
    }, cursor + 60);
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

    ui.audioPlayer.pause();
    stopTts(false);
    state.lastTtsText = text;

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
      setConversationPhase("speaking");
      scheduleTextAlignedVisemes(text, utterance.rate);
      setStage("Đang phát giọng", `${selected?.name || "Giọng mặc định"} · ${utterance.lang}`, true);
    };
    utterance.onboundary = (event) => {
      const sample = text.slice(event.charIndex, event.charIndex + Math.max(event.charLength || 1, 2));
      const boundaryUnit = buildVietnameseVisemeTimeline(sample)[0];
      setViseme(boundaryUnit.viseme);
      state.mouthTarget = boundaryUnit.target;
      state.lastActivityAt = performance.now();
    };
    utterance.onend = () => {
      stopTts(false);
      setConversationPhase(
        state.nativeListening || state.recognitionShouldRun ? "listening" : "idle"
      );
      setStage("Hoàn tất", "Đã phát xong nội dung tiếng Việt");
    };
    utterance.onerror = (event) => {
      state.resumeMicAfterTts = false;
      stopTts(false);
      setConversationPhase("idle");
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
      state.frequencyData = new Uint8Array(state.analyser.frequencyBinCount);
      state.captureDestination = state.audioContext.createMediaStreamDestination();
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
    state.mediaElementSource.connect(state.captureDestination);
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
    if (state.nativeReady
      && state.nativeComponents.silero_vad
      && state.nativeComponents.whisper_cli
      && state.nativeComponents.whisper_model) {
      try {
        await saveCompanionConfig(false);
        await nativeRequest("start_listening");
        state.nativeListening = true;
        state.activeSignal = "mic";
        state.finalTranscript = "";
        ui.micOrb.classList.add("active");
        ui.micTitle.textContent = "Companion đang nghe";
        ui.micHint.textContent = "Silero VAD 16 kHz → Whisper tiếng Việt cục bộ.";
        syncMicrophoneControls(true);
        setConversationPhase("listening");
        setStage("Đang nghe", "Silero VAD + Whisper CPU", true);
        return true;
      } catch (error) {
        showToast(error.message, true);
        setConversationPhase("idle", "Không mở được microphone");
        setStage("Không mở được companion", "Kiểm tra model VAD, Whisper và microphone");
        return false;
      }
    }

    if (!SpeechRecognition) {
      showToast("Microsoft Edge trên thiết bị này không cung cấp Speech Recognition.", true);
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Không thể mở microphone. Hãy chạy dưới dạng Edge Extension hoặc HTTPS.", true);
      return false;
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
      state.activeSource.connect(state.captureDestination);
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
        let completed = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const cleaned = text.trim();
            if (state.speechActive && isLikelySpeakerEcho(cleaned)) {
              ui.pipelineHealth.textContent = "Echo-guard đã loại câu TTS bị microphone thu lại.";
              continue;
            }
            if (state.speechActive && ui.fullDuplex.checked) {
              stopTts(false);
              if (state.nativeReady) nativeRequest("interrupt").catch(() => {});
              setConversationPhase("interrupted");
              setStage("Bạn đã ngắt lời", "Cybergirl dừng nói và tiếp tục lắng nghe", true);
            }
            state.finalTranscript += `${cleaned} `;
            completed += `${cleaned} `;
          }
          else interim += text;
        }
        const visibleText = `${state.finalTranscript}${interim}`.trim();
        ui.transcriptText.textContent = visibleText || "Đang nghe…";
        setConversationPhase(interim ? "transcribing" : "listening");
        if (visibleText) {
          state.liveViseme = visemeFromText(visibleText.slice(-2));
          state.liveVisemeUntil = performance.now() + 190;
          setViseme(state.liveViseme);
        }
        if (completed.trim() && ui.voiceAutoSend.checked && state.companionReady) {
          window.clearTimeout(state.voiceSendTimer);
          state.voiceSendTimer = window.setTimeout(
            () => sendChat(completed.trim()),
            620
          );
        }
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
      syncMicrophoneControls(true);
      setConversationPhase("listening");
      setStage("Đang nghe", "Microphone + nhận dạng vi-VN", true);
      return true;
    } catch (error) {
      console.error(error);
      showToast("Edge chưa được cấp quyền microphone. Kiểm tra biểu tượng ổ khóa/quyền của extension.", true);
      syncMicrophoneControls(false);
      setConversationPhase("idle", "Chưa được cấp quyền microphone");
      setStage("Thiếu quyền microphone", "Cấp quyền rồi thử lại");
      return false;
    }
  }

  async function stopMic(updateStatus = true) {
    if (state.voiceRecorder?.state === "recording" && !state.voiceRecordingOwnsStream) {
      stopVoiceRecording();
    }
    if (state.nativeListening) {
      try {
        await nativeRequest("stop_listening");
      } catch (error) {
        console.warn("Không dừng được microphone companion:", error);
      }
      state.nativeListening = false;
    }
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
    syncMicrophoneControls(false);
    setConversationPhase("idle");
    if (updateStatus) setStage("Đã dừng", "Microphone đã được đóng");
  }

  async function toggleLiveTalk() {
    const active = state.nativeListening || state.recognitionShouldRun || Boolean(state.micStream);
    if (active) {
      await stopMic();
      return;
    }
    if (!state.companionReady && !(await saveCompanionConfig(false))) {
      setConversationPhase("idle", "Cần cấu hình bộ não AI");
      return;
    }
    ui.voiceAutoSend.checked = true;
    await savePreferences();
    const started = await startMic();
    if (started) {
      showToast("Chat live đã bật · nói tự nhiên bằng tiếng Việt.");
      ui.chatInput.blur();
    }
  }

  function supportedAudioRecordingType() {
    if (!globalThis.MediaRecorder?.isTypeSupported) return "";
    return [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function updateVoiceRecordingTimer() {
    if (!state.voiceRecordingStartedAt) {
      ui.recordingTimer.textContent = "00:00";
      return;
    }
    const seconds = Math.floor((performance.now() - state.voiceRecordingStartedAt) / 1000);
    const minutes = Math.floor(seconds / 60);
    ui.recordingTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (seconds >= 300 && state.voiceRecorder?.state === "recording") {
      stopVoiceRecording();
      showToast("Bản ghi đã dừng ở giới hạn 5 phút.");
    }
  }

  async function startVoiceRecording() {
    if (!globalThis.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      showToast("Microsoft Edge trên thiết bị này chưa hỗ trợ ghi âm trực tiếp.", true);
      return;
    }
    stopTts(false);
    ui.audioPlayer.pause();
    ui.recordedVoicePlayer.pause();

    try {
      let stream = state.micStream;
      state.voiceRecordingOwnsStream = !stream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        });
        const audioContext = await ensureAudioContext();
        state.voiceRecordingSource = audioContext.createMediaStreamSource(stream);
        state.voiceRecordingSource.connect(state.analyser);
        state.activeSignal = "mic";
      }
      state.voiceRecordingStream = stream;
      state.voiceRecordingChunks = [];
      const mimeType = supportedAudioRecordingType();
      state.voiceRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      state.voiceRecorder.ondataavailable = (event) => {
        if (event.data?.size) state.voiceRecordingChunks.push(event.data);
      };
      state.voiceRecorder.onstop = () => {
        window.clearInterval(state.voiceRecordingTimer);
        state.voiceRecordingTimer = null;
        state.voiceRecordingSource?.disconnect();
        state.voiceRecordingSource = null;
        if (state.voiceRecordingOwnsStream) {
          state.voiceRecordingStream?.getTracks().forEach((track) => track.stop());
          if (!state.nativeListening && !state.recognitionShouldRun) {
            state.activeSignal = "idle";
          }
        }
        const duration = performance.now() - state.voiceRecordingStartedAt;
        const blob = new Blob(state.voiceRecordingChunks, {
          type: state.voiceRecorder?.mimeType || mimeType || "audio/webm"
        });
        if (blob.size) {
          if (state.voiceRecordingUrl) URL.revokeObjectURL(state.voiceRecordingUrl);
          state.voiceRecordingUrl = URL.createObjectURL(blob);
          ui.recordedVoicePlayer.src = state.voiceRecordingUrl;
          ui.recordingPreview.hidden = false;
          ui.recordingTimer.textContent = `${(duration / 1000).toFixed(1)} giây`;
          showToast("Đã ghi âm cục bộ. Bạn có thể nghe lại ngay.");
        }
        state.voiceRecorder = null;
        state.voiceRecordingStream = null;
        state.voiceRecordingOwnsStream = false;
        state.voiceRecordingChunks = [];
        state.voiceRecordingStartedAt = 0;
        ui.recordVoiceButton.classList.remove("active");
        ui.recordVoiceButton.setAttribute("aria-pressed", "false");
        ui.recordVoiceButton.lastChild.textContent = " Ghi âm";
        setConversationPhase(
          state.nativeListening || state.recognitionShouldRun ? "listening" : "idle"
        );
      };
      state.voiceRecorder.start(250);
      state.voiceRecordingStartedAt = performance.now();
      state.voiceRecordingTimer = window.setInterval(updateVoiceRecordingTimer, 250);
      ui.recordVoiceButton.classList.add("active");
      ui.recordVoiceButton.setAttribute("aria-pressed", "true");
      ui.recordVoiceButton.lastChild.textContent = " Dừng ghi";
      setConversationPhase("recording");
      setStage("Đang ghi âm", "Âm thanh chỉ nằm trong bộ nhớ trình duyệt", true);
    } catch (error) {
      console.error(error);
      showToast("Không mở được microphone để ghi âm. Hãy kiểm tra quyền của Edge.", true);
      setConversationPhase("idle", "Không mở được ghi âm");
    }
  }

  function stopVoiceRecording() {
    if (state.voiceRecorder?.state === "recording") {
      state.voiceRecorder.stop();
    }
  }

  function toggleVoiceRecording() {
    if (state.voiceRecorder?.state === "recording") stopVoiceRecording();
    else startVoiceRecording();
  }

  function deleteVoiceRecording() {
    ui.recordedVoicePlayer.pause();
    ui.recordedVoicePlayer.removeAttribute("src");
    ui.recordedVoicePlayer.load();
    if (state.voiceRecordingUrl) URL.revokeObjectURL(state.voiceRecordingUrl);
    state.voiceRecordingUrl = null;
    ui.recordingPreview.hidden = true;
    ui.recordingTimer.textContent = "00:00";
    showToast("Đã xóa bản ghi khỏi bộ nhớ.");
  }

  async function activateRecordedVoice() {
    await stopMic(false);
    stopTts(false);
    const audioContext = await ensureAudioContext();
    disconnectActiveSource();
    if (!state.recordedMediaSource) {
      state.recordedMediaSource = audioContext.createMediaElementSource(ui.recordedVoicePlayer);
    }
    state.recordedMediaSource.connect(state.analyser);
    state.recordedMediaSource.connect(audioContext.destination);
    state.recordedMediaSource.connect(state.captureDestination);
    state.activeSource = state.recordedMediaSource;
    state.activeSignal = "audio";
    setConversationPhase("speaking", "Đang phát lại bản ghi");
    setStage("Đang phát bản ghi", "Khẩu hình bám theo phổ âm thanh thật", true);
  }

  async function connectNativeCompanion() {
    ui.connectNativeButton.disabled = true;
    ui.connectNativeButton.textContent = "Đang kết nối…";
    try {
      const status = await nativeRequest("status");
      state.nativeReady = true;
      state.companionReady = true;
      fillNativeConfig(status.config);
      setNativeComponents(status.components, status.conversation, status.config);
      populateModelProfiles(await nativeRequest("registry"));
      setCompanionStatus(
        "Companion cục bộ đã kết nối",
        `${status.host} · v${status.version} · ${status.language}`,
        "success"
      );
      showToast("Đã kết nối Native Messaging.");
    } catch (error) {
      state.nativeReady = false;
      setCompanionStatus("Không kết nối được companion", error.message, "error");
      showToast(error.message, true);
    } finally {
      ui.connectNativeButton.disabled = false;
      ui.connectNativeButton.textContent = "Kết nối companion";
    }
  }

  async function benchmarkVietnameseTts() {
    ui.benchmarkTtsButton.disabled = true;
    ui.benchmarkTtsButton.textContent = "Đang đo…";
    ui.ttsBenchmarkResult.textContent = "Đang tổng hợp cùng một câu trên các engine có sẵn…";
    try {
      await saveCompanionConfig(false);
      const report = await nativeRequest("benchmark_tts", {
        text: "Xin chào, đây là phép đo giọng tiếng Việt của Cybergirl."
      });
      const lines = report.results.map((item) => item.available
        ? `${item.recommended_for_speed ? "✓ " : ""}${item.engine}: ${item.synthesis_ms} ms · RTF ${item.rtf} · ${item.characters_per_second} ký tự/giây`
        : `${item.engine}: chưa sẵn sàng · ${item.error}`);
      ui.ttsBenchmarkResult.textContent = lines.join("\n");
      showToast("Đã benchmark TTS trên máy này.");
    } catch (error) {
      ui.ttsBenchmarkResult.textContent = error.message;
      showToast(error.message, true);
    } finally {
      ui.benchmarkTtsButton.disabled = false;
      ui.benchmarkTtsButton.textContent = "Benchmark TTS";
    }
  }

  function stopAll() {
    state.resumeMicAfterTts = false;
    window.clearTimeout(state.voiceSendTimer);
    stopVoiceRecording();
    stopTts(false);
    stopMic(false);
    ui.audioPlayer.pause();
    if (state.activeSignal === "audio") {
      disconnectActiveSource();
      state.activeSignal = "idle";
    }
    state.mouthTarget = 0;
    setConversationPhase("idle");
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
    ui.faceMotionValue.textContent = `${ui.faceMotion.value}%`;
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
      link.download = `cybergirl-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Đã chụp khung hình PNG.");
    }, "image/png");
  }

  function downloadMasterImage() {
    showToast("Đang dựng ảnh master 8K trên thiết bị…");
    const source = new Image();
    source.onload = () => {
      const masterCanvas = document.createElement("canvas");
      masterCanvas.width = MASTER_WIDTH;
      masterCanvas.height = MASTER_HEIGHT;
      const masterContext = masterCanvas.getContext("2d", { alpha: false });
      masterContext.imageSmoothingEnabled = true;
      masterContext.imageSmoothingQuality = "high";
      masterContext.drawImage(source, 0, 0, MASTER_WIDTH, MASTER_HEIGHT);
      masterCanvas.toBlob((blob) => {
        if (!blob) {
          showToast("Không thể tạo ảnh master 8K.", true);
          return;
        }
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = "cybergirl-default-7680x4320.jpg";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast("Đã tạo ảnh master 7680×4320 hoàn toàn cục bộ.");
      }, "image/jpeg", 0.94);
    };
    source.onerror = () => showToast("Không thể nạp ảnh mặc định để tạo bản 8K.", true);
    source.src = DEFAULT_IMAGE;
  }

  function toggleWebmRecording() {
    if (state.mediaRecorder?.state === "recording") {
      state.mediaRecorder.stop();
      return;
    }
    if (!ui.canvas.captureStream || !globalThis.MediaRecorder) {
      showToast("Phiên bản Edge này không hỗ trợ quay Canvas WebM.", true);
      return;
    }
    const stream = ui.canvas.captureStream(30);
    const audioTrack = state.captureDestination?.stream?.getAudioTracks?.()[0];
    if (audioTrack && ["audio", "mic"].includes(state.activeSignal)) {
      stream.addTrack(audioTrack);
    }
    const mimeCandidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const mimeType = mimeCandidates.find((value) => MediaRecorder.isTypeSupported(value)) || "";
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 5_000_000
    });
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) state.recordedChunks.push(event.data);
    };
    state.mediaRecorder.onstop = () => {
      stream.getVideoTracks().forEach((track) => track.stop());
      const blob = new Blob(state.recordedChunks, { type: mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cybergirl-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      ui.recordWebmButton.classList.remove("recording");
      ui.recordWebmButton.textContent = "Quay WebM";
      state.mediaRecorder = null;
      state.recordedChunks = [];
      showToast("Đã xuất video WebM cục bộ.");
    };
    state.mediaRecorder.start(500);
    ui.recordWebmButton.classList.add("recording");
    ui.recordWebmButton.textContent = "Dừng quay";
    const audioNote = audioTrack && ["audio", "mic"].includes(state.activeSignal)
      ? "có audio Web Audio"
      : "video hình; TTS hệ thống không được Edge capture";
    setStage("Đang quay WebM", audioNote, true);
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
    ui.detectFaceButton.addEventListener("click", () => detectFaceLandmarks());
    ui.calibrateButton.addEventListener("click", () => toggleCalibration());
    ui.canvas.addEventListener("click", setMouthFromCanvas);
    ui.speakButton.addEventListener("click", speakText);
    ui.stopButton.addEventListener("click", stopAll);
    ui.micButton.addEventListener("click", () => {
      if (state.nativeListening || state.recognitionShouldRun || state.micStream) stopMic();
      else startMic();
    });
    ui.liveTalkButton.addEventListener("click", toggleLiveTalk);
    ui.recordVoiceButton.addEventListener("click", toggleVoiceRecording);
    ui.deleteVoiceButton.addEventListener("click", deleteVoiceRecording);
    ui.recordedVoicePlayer.addEventListener("play", () => {
      activateRecordedVoice().catch((error) => {
        console.error(error);
        showToast("Không thể phân tích bản ghi này.", true);
      });
    });
    ui.recordedVoicePlayer.addEventListener("pause", () => {
      if (!ui.recordedVoicePlayer.ended && state.activeSignal === "audio") {
        state.mouthTarget = 0;
        setConversationPhase("idle", "Bản ghi đang tạm dừng");
      }
    });
    ui.recordedVoicePlayer.addEventListener("ended", () => {
      if (state.activeSource === state.recordedMediaSource) disconnectActiveSource();
      state.activeSignal = "idle";
      state.mouthTarget = 0;
      setConversationPhase("idle");
      setStage("Hoàn tất", "Đã phát xong bản ghi");
    });
    ui.snapshotButton.addEventListener("click", downloadSnapshot);
    ui.masterImageButton.addEventListener("click", downloadMasterImage);
    ui.recordWebmButton.addEventListener("click", toggleWebmRecording);
    ui.copyTranscript.addEventListener("click", copyTranscript);
    ui.saveApiButton.addEventListener("click", () => saveCompanionConfig());
    ui.testApiButton.addEventListener("click", testCompanionApi);
    ui.connectNativeButton.addEventListener("click", connectNativeCompanion);
    ui.benchmarkTtsButton.addEventListener("click", benchmarkVietnameseTts);
    ui.sendChatButton.addEventListener("click", () => sendChat());
    ui.clearChatButton.addEventListener("click", clearChat);
    ui.clearMemoryButton.addEventListener("click", clearLongTermMemory);
    ui.modelProfileSelect.addEventListener("change", applyModelProfile);
    ui.providerSelect.addEventListener("change", () => {
      ui.modelProfileSelect.value = "custom";
      applyProviderDefaults(true);
    });
    ui.characterSelect.addEventListener("change", () => {
      const model = ui.characterSelect.selectedOptions[0]?.dataset.model;
      if (model && ui.providerSelect.value === "ollama") ui.apiModel.value = model;
    });
    ui.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
    ui.autoSpeak.addEventListener("change", savePreferences);
    ui.voiceAutoSend.addEventListener("change", savePreferences);
    ui.fullDuplex.addEventListener("change", savePreferences);
    ui.echoGuard.addEventListener("change", savePreferences);
    ui.emotionEnabled.addEventListener("change", savePreferences);
    ui.resetButton.addEventListener("click", () => {
      stopAll();
      state.mouth = { x: 0.5, y: 0.665, width: 0.16 };
      ui.mouthSize.value = "52";
      ui.faceMotion.value = "24";
      ui.rate.value = "1";
      ui.pitch.value = "1";
      ui.transcriptText.textContent = "Bản chép lời sẽ xuất hiện ở đây khi bật microphone.";
      clearChat();
      deleteVoiceRecording();
      state.mouthOpen = 0;
      state.mouthTarget = 0;
      setViseme("idle");
      updateRangeLabels();
      useDefaultImage(true);
      savePreferences();
      showToast("Đã đặt lại dashboard.");
    });

    ui.mouthSize.addEventListener("input", () => {
      updateRangeLabels();
    });
    ui.mouthSize.addEventListener("change", savePreferences);
    ui.faceMotion.addEventListener("input", updateRangeLabels);
    ui.faceMotion.addEventListener("change", savePreferences);
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
      stopVoiceRecording();
      stopTts(false);
      stopMic(false);
      if (state.nativeReady) nativeRequest("interrupt").catch(() => {});
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
      if (state.voiceRecordingUrl) URL.revokeObjectURL(state.voiceRecordingUrl);
    });
  }

  async function initialize() {
    configureRuntimeContext();
    detectCapabilities();
    bindEvents();
    await restorePreferences();
    await loadCompanionConfig();
    updateRangeLabels();
    applyEmotion(state.emotion);
    useDefaultImage(true);
    populateVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
      window.setTimeout(populateVoices, 300);
    }
    requestAnimationFrame(renderFrame);
  }

  initialize();
})();
