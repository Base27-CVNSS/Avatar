"use strict";

/**
 * AudioWorklet duy nhất cho cả Edge Extension và Cybergirl Windows.
 *
 * Đầu vào của Windows/Edge thường là Float32 44,1/48 kHz. Processor trộn về
 * mono, resample theo dòng thời gian và phát gói PCM signed 16-bit little-endian
 * ở 16 kHz. Không có mẫu âm thanh nào rời khỏi trang; main thread chỉ nhận gói
 * PCM để đo mức tín hiệu, VAD, lip-sync và chẩn đoán.
 */
class CybergirlPcm16Processor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const processorOptions = options.processorOptions || {};
    this.targetSampleRate = Number(processorOptions.targetSampleRate || 16000);
    this.packetMs = Number(processorOptions.packetMs || 20);
    this.packetSamples = Math.max(
      160,
      Math.round(this.targetSampleRate * this.packetMs / 1000)
    );
    this.sourceToTargetRatio = sampleRate / this.targetSampleRate;
    this.sourceIndex = 0;
    this.nextTargetAt = 0;
    this.previousSample = 0;
    this.sequence = 0;
    this.packet = new Int16Array(this.packetSamples);
    this.packetOffset = 0;
  }

  process(inputs, outputs) {
    const channels = inputs[0] || [];
    const outputChannels = outputs[0] || [];
    const frameLength = channels[0]?.length || 0;
    if (!frameLength) return true;

    for (let index = 0; index < frameLength; index += 1) {
      let mono = 0;
      for (const channel of channels) mono += channel[index] || 0;
      mono /= Math.max(1, channels.length);

      if (this.sourceIndex === 0) this.previousSample = mono;
      while (this.nextTargetAt <= this.sourceIndex) {
        const fraction = this.sourceIndex === 0
          ? 1
          : Math.max(0, Math.min(1, this.nextTargetAt - (this.sourceIndex - 1)));
        const interpolated = this.previousSample
          + (mono - this.previousSample) * fraction;
        this.appendSample(interpolated);
        this.nextTargetAt += this.sourceToTargetRatio;
      }
      this.previousSample = mono;
      this.sourceIndex += 1;

      for (const output of outputChannels) output[index] = mono;
    }
    return true;
  }

  appendSample(value) {
    const normalized = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
    const pcm = normalized < 0
      ? Math.round(normalized * 0x8000)
      : Math.round(normalized * 0x7fff);
    this.packet[this.packetOffset] = pcm;
    this.packetOffset += 1;
    if (this.packetOffset < this.packet.length) return;

    let sum = 0;
    let peak = 0;
    for (const sample of this.packet) {
      const float = sample / (sample < 0 ? 0x8000 : 0x7fff);
      sum += float * float;
      peak = Math.max(peak, Math.abs(float));
    }
    const buffer = this.packet.buffer;
    this.port.postMessage({
      type: "pcm16",
      sequence: this.sequence,
      sampleRate: this.targetSampleRate,
      channelCount: 1,
      format: "s16le",
      rms: Math.sqrt(sum / this.packet.length),
      peak,
      timestamp: currentFrame / sampleRate,
      buffer
    }, [buffer]);
    this.sequence += 1;
    this.packet = new Int16Array(this.packetSamples);
    this.packetOffset = 0;
  }
}

registerProcessor("cybergirl-pcm16", CybergirlPcm16Processor);
