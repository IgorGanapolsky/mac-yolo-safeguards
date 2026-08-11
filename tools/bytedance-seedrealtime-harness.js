'use strict';

const EventEmitter = require('events');

class ModelInternalVadInterrupter {
  static evaluateInterruptionSignal(audioFrameBuffer, isSpeaking = true) {
    if (!isSpeaking) {
      return { interruptTriggered: false, action: 'CONTINUE_STREAM' };
    }

    const energyLevel = audioFrameBuffer.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, audioFrameBuffer.length);
    const interrupt = energyLevel > 0.65;

    return {
      interruptTriggered: interrupt,
      action: interrupt ? 'HALT_EXPRESSION_IMMEDIATELY' : 'CONTINUE_STREAM',
      energyLevel: Number(energyLevel.toFixed(3)),
    };
  }
}

class ByteDanceSeedRealtimeEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.targetLatencyMs = options.targetLatencyMs || 350;
    this.isStreaming = false;
  }

  processFullDuplexStream(audioChunk, videoFrame, textPrompt) {
    const startTime = Date.now();
    this.isStreaming = true;

    const vadCheck = ModelInternalVadInterrupter.evaluateInterruptionSignal(audioChunk, true);

    if (vadCheck.interruptTriggered) {
      this.emit('interrupted', { reason: 'User spoke over model stream', energy: vadCheck.energyLevel });
      return {
        status: 'INTERRUPTED',
        latencyMs: Date.now() - startTime,
        vadCheck,
      };
    }

    const responsePayload = {
      status: 'STREAMING_DUPLEX',
      perceivedVideoFrame: Boolean(videoFrame),
      perceivedAudioChunk: Boolean(audioChunk),
      processedPrompt: textPrompt,
      latencyMs: Date.now() - startTime,
      fullDuplexZeroCascade: true,
    };

    this.emit('frame_processed', responsePayload);
    return responsePayload;
  }
}

module.exports = {
  ModelInternalVadInterrupter,
  ByteDanceSeedRealtimeEngine,
};
