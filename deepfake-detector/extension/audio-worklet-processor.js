const CHUNK_SAMPLES = 32000; // 2 s at 16 kHz

class ChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferLength = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    // Accumulate incoming 128-sample blocks
    this._buffer.push(new Float32Array(channel));
    this._bufferLength += channel.length;

    // Dispatch complete 2-second chunks to the main thread
    while (this._bufferLength >= CHUNK_SAMPLES) {
      const chunk = new Float32Array(CHUNK_SAMPLES);
      let offset = 0;
      while (offset < CHUNK_SAMPLES) {
        const piece = this._buffer[0];
        const needed = CHUNK_SAMPLES - offset;
        if (piece.length <= needed) {
          chunk.set(piece, offset);
          offset += piece.length;
          this._buffer.shift();
          this._bufferLength -= piece.length;
        } else {
          chunk.set(piece.subarray(0, needed), offset);
          this._buffer[0] = piece.subarray(needed);
          this._bufferLength -= needed;
          offset += needed;
        }
      }
      // Compute RMS for silence detection before transferring the buffer
      let sumSq = 0;
      for (let i = 0; i < CHUNK_SAMPLES; i++) sumSq += chunk[i] * chunk[i];
      const rms = Math.sqrt(sumSq / CHUNK_SAMPLES);
      // Transfer the buffer to avoid a copy
      this.port.postMessage({ type: 'chunk', samples: chunk, rms }, [chunk.buffer]);
    }

    return true; // keep processor alive
  }
}

registerProcessor('chunk-processor', ChunkProcessor);
