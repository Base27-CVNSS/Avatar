(function attachSaymeeTranscript(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CybergirlSaymee = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createSaymeeTranscript() {
  "use strict";

  function createSessionId(now = Date.now(), random = Math.random) {
    const timestamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    const suffix = random().toString(36).slice(2, 10).padEnd(8, "0");
    return `saymee-${timestamp}-${suffix}`;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function wordCount(text) {
    const normalized = normalizeText(text);
    return normalized ? normalized.split(" ").length : 0;
  }

  function normalizeSegment(segment = {}, context = {}) {
    const receivedAt = Number.isFinite(Number(segment.receivedAt))
      ? Number(segment.receivedAt)
      : Date.now();
    const confidence = Number.isFinite(Number(segment.confidence))
      ? Math.max(0, Math.min(1, Number(segment.confidence)))
      : null;
    return {
      id: String(segment.id || `${context.sessionId || "session"}-mic-${receivedAt}`),
      sessionId: segment.sessionId || context.sessionId || null,
      source: segment.source || "mic",
      engine: segment.engine || "edge-web-speech",
      text: normalizeText(segment.text),
      final: Boolean(segment.final),
      speechFinal: Boolean(segment.speechFinal || segment.final),
      generation: Number(segment.generation || 0),
      resultIndex: Number(segment.resultIndex || 0),
      receivedAt,
      confidence
    };
  }

  class TranscriptSession {
    constructor(options = {}) {
      const startedAt = Number(options.startedAt || Date.now());
      this.session = {
        id: options.id || createSessionId(startedAt, options.random),
        startedAt,
        endedAt: null,
        title: String(options.title || "Cybergirl Live").slice(0, 240),
        source: "mic",
        engine: "edge-web-speech",
        language: options.language || "vi-VN"
      };
      this.finalSegments = new Map();
      this.workingSegments = new Map();
      this.lastFinal = null;
    }

    ingest(payload = {}) {
      const receivedAt = Number(payload.receivedAt || Date.now());
      const generation = Number(payload.generation || 0);
      let segments = Array.isArray(payload.segments) ? payload.segments : [];
      if (!segments.length) {
        const fallback = [];
        if (normalizeText(payload.finalText)) {
          fallback.push({
            id: `${this.session.id}-${generation}-${Number(payload.resultIndex || 0)}-final`,
            text: payload.finalText,
            final: true
          });
        }
        if (normalizeText(payload.interimText)) {
          fallback.push({
            id: `${this.session.id}-${generation}-${Number(payload.resultIndex || 0)}-interim`,
            text: payload.interimText,
            final: false
          });
        }
        segments = fallback;
      }

      const addedFinals = [];
      for (const rawSegment of segments) {
        const segment = normalizeSegment({
          ...rawSegment,
          generation: rawSegment.generation ?? generation,
          receivedAt: rawSegment.receivedAt ?? receivedAt
        }, { sessionId: this.session.id });
        if (!segment.text) {
          this.workingSegments.delete(segment.id);
          continue;
        }
        if (!segment.final) {
          if (!this.finalSegments.has(segment.id)) this.workingSegments.set(segment.id, segment);
          continue;
        }

        this.workingSegments.delete(segment.id);
        const previous = this.finalSegments.get(segment.id);
        const duplicate = this.lastFinal
          && this.lastFinal.text.toLocaleLowerCase("vi-VN") === segment.text.toLocaleLowerCase("vi-VN")
          && segment.receivedAt - this.lastFinal.receivedAt < 1200;
        if (!previous && !duplicate) {
          this.finalSegments.set(segment.id, segment);
          this.lastFinal = segment;
          addedFinals.push(segment);
        } else if (previous) {
          this.finalSegments.set(segment.id, { ...previous, ...segment });
        }
      }
      return { ...this.snapshot(), addedFinals };
    }

    clear() {
      this.finalSegments.clear();
      this.workingSegments.clear();
      this.lastFinal = null;
      this.session.startedAt = Date.now();
      this.session.endedAt = null;
      return this.snapshot();
    }

    snapshot() {
      const sortSegments = (segments) => [...segments].sort((left, right) => (
        left.generation - right.generation
        || left.resultIndex - right.resultIndex
        || left.receivedAt - right.receivedAt
      ));
      const finalSegments = sortSegments(this.finalSegments.values());
      const interimSegments = sortSegments(this.workingSegments.values());
      const finalText = finalSegments.map((segment) => segment.text).join(" ").trim();
      const interimText = interimSegments.map((segment) => segment.text).join(" ").trim();
      return {
        session: { ...this.session },
        finalSegments,
        interimSegments,
        finalText,
        interimText,
        text: [finalText, interimText].filter(Boolean).join(" "),
        segmentCount: finalSegments.length,
        wordCount: wordCount(finalText)
      };
    }
  }

  return {
    TranscriptSession,
    createSessionId,
    normalizeSegment,
    wordCount
  };
}));
