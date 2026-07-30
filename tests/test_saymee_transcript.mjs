import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { TranscriptSession, createSessionId, wordCount } = require("../audio/saymee-transcript.js");

test("Saymee tạo ID phiên ổn định theo thời gian", () => {
  const id = createSessionId(Date.UTC(2026, 6, 30, 7, 20), () => 0.25);
  assert.match(id, /^saymee-2026-07-30T07-20-00-000Z-/);
});

test("Saymee thay bản tạm tại chỗ và chỉ ghi bản cuối một lần", () => {
  const transcript = new TranscriptSession({ id: "test-session", startedAt: 1000 });
  let snapshot = transcript.ingest({
    generation: 1,
    receivedAt: 1100,
    segments: [{
      id: "1-0",
      text: "xin chào",
      final: false,
      resultIndex: 0
    }]
  });
  assert.equal(snapshot.finalText, "");
  assert.equal(snapshot.interimText, "xin chào");
  assert.equal(snapshot.segmentCount, 0);

  snapshot = transcript.ingest({
    generation: 1,
    receivedAt: 1200,
    segments: [{
      id: "1-0",
      text: "xin chào Mai",
      final: true,
      resultIndex: 0,
      confidence: 0.91
    }]
  });
  assert.equal(snapshot.text, "xin chào Mai");
  assert.equal(snapshot.interimText, "");
  assert.equal(snapshot.segmentCount, 1);
  assert.equal(snapshot.wordCount, 3);
  assert.equal(snapshot.addedFinals.length, 1);

  snapshot = transcript.ingest({
    generation: 1,
    receivedAt: 1250,
    segments: [{
      id: "1-0",
      text: "xin chào Mai",
      final: true,
      resultIndex: 0
    }]
  });
  assert.equal(snapshot.segmentCount, 1);
  assert.equal(snapshot.addedFinals.length, 0);
});

test("Saymee chặn kết quả cuối lặp do Web Speech nối lại", () => {
  const transcript = new TranscriptSession({ id: "restart-session", startedAt: 1000 });
  transcript.ingest({
    receivedAt: 2000,
    segments: [{ id: "1-0", text: "mở chẩn đoán", final: true }]
  });
  const duplicate = transcript.ingest({
    receivedAt: 2500,
    segments: [{ id: "2-0", text: "mở chẩn đoán", final: true }]
  });
  assert.equal(duplicate.segmentCount, 1);
  assert.equal(duplicate.addedFinals.length, 0);

  const later = transcript.ingest({
    receivedAt: 4000,
    segments: [{ id: "3-0", text: "mở chẩn đoán", final: true }]
  });
  assert.equal(later.segmentCount, 2);
  assert.equal(wordCount(later.finalText), 6);
});
