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
    avatarReady: false,
    mouth: { x: 0.5, y: 0.665, width: 0.16 },
    face: null,
    patches: { mouth: null, eyes: [] },
    featureWork: { mouth: document.createElement("canvas"), eyes: [document.createElement("canvas"), document.createElement("canvas")] },
    faceMesh: null,
    faceMeshResolver: null,
    faceMeshRejecter: null,
    detectingFace: false,
    mouthOpen: 0,
    mouthTarget: 0,
    viseme: "idle",
    calibrating: false,
    calibrationIndex: 0,
    manualPoints: {},
    showGuidesUntil: 0,
    blink: {
      amount: 0,
      startedAt: 0,
      duration: 190,
      nextAt: performance.now() + 2600 + Math.random() * 2200
    },
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
      await storage.set("avatarVnPreferencesV2", {
        mouthGain: Number(ui.mouthSize.value),
        faceMotion: Number(ui.faceMotion.value),
        rate: Number(ui.rate.value),
        pitch: Number(ui.pitch.value)
      });
    } catch (error) {
      console.warn("Không thể lưu tùy chọn:", error);
    }
  }

  async function restorePreferences() {
    try {
      const saved = await storage.get("avatarVnPreferencesV2");
      if (!saved) return;
      if (saved.mouthGain) ui.mouthSize.value = String(clamp(Number(saved.mouthGain), 35, 100));
      if (saved.faceMotion !== undefined) ui.faceMotion.value = String(clamp(Number(saved.faceMotion), 0, 100));
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
    state.image.onload = async () => {
      state.avatarReady = true;
      setFallbackFaceGeometry();
      setStage("Đang phân tích mặt", label);
      setDetectionStatus("Đang nhận diện khuôn mặt", "Tìm môi, mắt và tỷ lệ gương mặt bằng Face Mesh.");
      await detectFaceLandmarks();
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
    state.image.onload = () => {
      state.avatarReady = true;
      setSampleFaceGeometry();
      setStage("Sẵn sàng", "Ảnh mẫu đã được nạp");
      setDetectionStatus("Đã định vị khuôn mặt mẫu", "Môi và hai mắt dùng mốc cài sẵn.", "success");
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

  function setSampleFaceGeometry() {
    applyFaceGeometry({
      source: "sample",
      box: { x: 0.23, y: 0.1, width: 0.54, height: 0.66 },
      mouth: { x: 0.5, y: 0.665, width: 0.18, height: 0.052, angle: 0 },
      eyes: [
        { x: 0.414, y: 0.477, width: 0.07, height: 0.035, angle: 0 },
        { x: 0.586, y: 0.477, width: 0.07, height: 0.035, angle: 0 }
      ],
      landmarks: []
    });
  }

  function applyFaceGeometry(face, showGuides = true) {
    state.face = face;
    state.mouth = {
      x: face.mouth.x,
      y: face.mouth.y,
      width: face.mouth.width
    };
    buildFeaturePatches();
    if (showGuides) state.showGuidesUntil = performance.now() + 1800;
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

  async function detectWithNativeFaceDetector() {
    if (!window.FaceDetector) return null;
    const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: false });
    const faces = await detector.detect(state.image);
    if (!faces.length) return null;
    const imageWidth = state.image.naturalWidth;
    const imageHeight = state.image.naturalHeight;
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

  async function detectWithMediaPipe() {
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
      mesh.send({ image: state.image }).catch((error) => {
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

  async function detectFaceLandmarks() {
    if (!state.avatarReady || state.detectingFace) return;
    state.detectingFace = true;
    ui.detectFaceButton.disabled = true;
    ui.detectFaceButton.textContent = "Đang nhận diện…";
    setDetectionStatus("Đang chạy Face Mesh", "Mô hình xử lý ảnh ngay trên thiết bị.");
    try {
      let geometry = null;
      try {
        geometry = await detectWithNativeFaceDetector();
      } catch (nativeError) {
        console.info("Native FaceDetector không khả dụng:", nativeError);
      }
      if (!geometry) {
        const results = await detectWithMediaPipe();
        geometry = geometryFromMesh(results.multiFaceLandmarks?.[0]);
      }
      if (!geometry) throw new Error("Không tìm thấy đủ landmark khuôn mặt.");
      applyFaceGeometry(geometry);
      setDetectionStatus(
        geometry.source === "mediapipe" ? "Đã nhận diện 468 điểm mặt" : "Đã nhận diện bằng Edge",
        "Môi, hai mắt và tỷ lệ mặt đã khóa theo ảnh upload.",
        "success"
      );
      setStage("Khuôn mặt đã khóa", "Khẩu hình mềm và chớp mắt đã sẵn sàng");
      showToast("Đã tự động định vị môi, mắt và gương mặt.");
    } catch (error) {
      console.error("Face detection failed:", error);
      const fileHint = window.location.protocol === "file:"
        ? " Hãy cài bằng edge://extensions để mô hình WASM hoạt động."
        : "";
      setDetectionStatus("Không thể tự nhận diện", `Dùng “Chỉnh 5 điểm” để định vị thủ công.${fileHint}`, "error");
      setStage("Cần hiệu chỉnh", "Chọn Chỉnh 5 điểm để đặt mắt và miệng");
      showToast(`Không nhận diện được khuôn mặt.${fileHint}`, true);
    } finally {
      state.detectingFace = false;
      ui.detectFaceButton.disabled = false;
      ui.detectFaceButton.textContent = "Nhận diện tự động";
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
    applyFaceGeometry({
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
    });
    toggleCalibration(false);
    setDetectionStatus("Đã hiệu chỉnh thủ công", "Đã khóa hai mắt, hai khóe miệng và tâm môi.", "success");
    showToast("Đã hoàn tất hiệu chỉnh 5 điểm khuôn mặt.");
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
    if (!state.face?.mouth || !state.patches.mouth) return;
    const feature = state.face.mouth;
    const patch = state.patches.mouth;
    const shape = visemeShape();
    const mouthGain = Number(ui.mouthSize.value) / 100;
    const effectiveOpen = clamp(openAmount * (0.62 + shape.open * 0.45) * mouthGain, 0, 0.88);
    if (effectiveOpen < 0.018) return;

    const imageWidth = state.image.naturalWidth || state.image.width;
    const sourceMouthWidth = feature.width * imageWidth * (patch.sourceScale || 1);
    const regionWidth = sourceMouthWidth * 1.08;
    const regionHeight = sourceMouthWidth * 0.48;
    const gap = sourceMouthWidth * (0.012 + effectiveOpen * 0.095);
    const centerX = patch.width / 2;
    const centerY = patch.height / 2;
    const work = state.featureWork.mouth;
    if (work.width !== patch.width || work.height !== patch.height) {
      work.width = patch.width;
      work.height = patch.height;
    }
    const workContext = work.getContext("2d");
    workContext.clearRect(0, 0, work.width, work.height);
    workContext.drawImage(patch, 0, 0);

    workContext.save();
    workContext.beginPath();
    workContext.ellipse(centerX, centerY, regionWidth * 0.56, regionHeight * 0.58, 0, 0, Math.PI * 2);
    workContext.clip();

    if (!patch.cavityColor) {
      try {
        const pixel = patch.getContext("2d").getImageData(
          Math.round(centerX),
          Math.round(centerY),
          1,
          1
        ).data;
        patch.cavityColor = `rgb(${Math.round(pixel[0] * 0.25 + 14)}, ${Math.round(pixel[1] * 0.12 + 5)}, ${Math.round(pixel[2] * 0.18 + 9)})`;
      } catch {
        patch.cavityColor = "rgb(42, 8, 17)";
      }
    }

    const cavityWidth = regionWidth * (state.viseme === "round" ? 0.29 : 0.44);
    workContext.fillStyle = patch.cavityColor;
    workContext.beginPath();
    workContext.ellipse(
      centerX,
      centerY + gap * 0.08,
      cavityWidth,
      Math.max(regionHeight * 0.055, gap * 0.7),
      0,
      0,
      Math.PI * 2
    );
    workContext.fill();

    const sourceX = centerX - regionWidth / 2;
    const topY = centerY - regionHeight / 2;
    const halfHeight = regionHeight / 2;
    const destinationWidth = regionWidth * shape.width;
    const destinationX = centerX - destinationWidth / 2;
    workContext.globalAlpha = 0.985;
    workContext.drawImage(
      patch,
      sourceX,
      topY,
      regionWidth,
      halfHeight,
      destinationX,
      topY - gap * 0.44,
      destinationWidth,
      halfHeight
    );
    workContext.drawImage(
      patch,
      sourceX,
      centerY,
      regionWidth,
      halfHeight,
      destinationX,
      centerY + gap * 0.44,
      destinationWidth,
      halfHeight
    );
    workContext.restore();

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
    }
    if (!state.blink.startedAt) {
      state.blink.amount = 0;
      return;
    }
    const progress = (timestamp - state.blink.startedAt) / state.blink.duration;
    if (progress >= 1) {
      state.blink.amount = 0;
      state.blink.startedAt = 0;
      state.blink.nextAt = timestamp + 2400 + Math.random() * 4300;
      return;
    }
    state.blink.amount = Math.sin(Math.PI * progress) ** 1.7 * clamp(0.48 + motion * 0.46, 0, 0.92);
  }

  function drawEyeBlink(fit, eye, index, amount) {
    const patch = state.patches.eyes[index];
    if (!patch || amount < 0.015) return;
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
    workContext.globalAlpha = amount * 0.42;
    workContext.strokeStyle = "#241715";
    workContext.lineWidth = Math.max(1, eyeWidth * 0.022);
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

  function drawFaceGuides(fit, timestamp) {
    if (!state.face || (!state.calibrating && timestamp > state.showGuidesUntil)) return;
    ctx.save();
    ctx.strokeStyle = "rgba(52, 226, 189, .9)";
    ctx.fillStyle = "rgba(52, 226, 189, .95)";
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
    updateBlink(timestamp);

    if (!state.avatarReady) {
      drawEmptyStage();
      requestAnimationFrame(renderFrame);
      return;
    }

    const fit = getCoverTransform();
    const active = state.activeSignal !== "idle" || state.speechActive;
    const t = timestamp / 1000;
    const motion = Number(ui.faceMotion.value) / 100;
    const bobX = Math.sin(t * (active ? 1.35 : 0.52)) * (active ? 1.15 : 0.45) * motion;
    const bobY = Math.sin(t * (active ? 1.78 : 0.72)) * (active ? 1.65 : 0.7) * motion;
    const breath = 1 + Math.sin(t * 1.05) * 0.0009 * motion;
    const headRotation = Math.sin(t * 0.43) * 0.0022 * motion;
    const faceCenterX = state.face
      ? fit.x + (state.face.box.x + state.face.box.width / 2) * fit.drawWidth
      : ui.canvas.width / 2;
    const faceCenterY = state.face
      ? fit.y + (state.face.box.y + state.face.box.height / 2) * fit.drawHeight
      : ui.canvas.height / 2;

    ctx.fillStyle = "#050a12";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx.save();
    ctx.translate(faceCenterX + bobX, faceCenterY + bobY);
    ctx.rotate(headRotation);
    ctx.scale(breath, breath);
    ctx.translate(-faceCenterX, -faceCenterY);
    ctx.drawImage(state.image, fit.x, fit.y, fit.drawWidth, fit.drawHeight);
    if (state.face?.eyes) {
      state.face.eyes.forEach((eye, index) => drawEyeBlink(fit, eye, index, state.blink.amount));
    }
    drawAnimatedMouth(fit, state.mouthOpen);
    ctx.restore();
    drawFaceGuides(fit, timestamp);
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
      state.mouthTarget = punctuation ? 0.01 : 0.28 + Math.random() * 0.38;
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
      state.mouthTarget = state.viseme === "closed" ? 0.04 : 0.54;
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
    ui.detectFaceButton.addEventListener("click", detectFaceLandmarks);
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
      state.mouth = { x: 0.5, y: 0.665, width: 0.16 };
      ui.mouthSize.value = "68";
      ui.faceMotion.value = "35";
      ui.rate.value = "1";
      ui.pitch.value = "1";
      ui.transcriptText.textContent = "Bản chép lời sẽ xuất hiện ở đây khi bật microphone.";
      updateRangeLabels();
      useSampleImage(true);
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
