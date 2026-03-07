import AudioRecord from 'react-native-audio-record';
import ReactNativeForegroundService from '@supersami/rn-foreground-service';

// 16kHz × 1 channel × 2 bytes/sample × 2 seconds = 64,000 bytes
const CHUNK_BYTES = 64_000;

const AUDIO_OPTIONS = {
  sampleRate: 16000,   // MUST match backend expectation
  channels: 1,         // mono
  bitsPerSample: 16,   // int16
  audioSource: 6,      // VOICE_COMMUNICATION — optimized for speech, reduces background noise
  wavFile: '',         // empty = stream only, no file write
};

let pcmBuffer: Buffer[] = [];
let totalBytes = 0;
let chunkCallback: ((chunk: ArrayBuffer) => void) | null = null;

/**
 * Start audio capture foreground service and PCM streaming.
 * @param onChunkReady Called with each 64000-byte ArrayBuffer chunk (2s of audio at 16kHz mono int16).
 *
 * IMPORTANT: Must be called while app is in the foreground.
 * Android 14 will silently deny mic access if foreground service is started from background.
 */
export async function startAudioCapture(
  onChunkReady: (chunk: ArrayBuffer) => void,
): Promise<void> {
  chunkCallback = onChunkReady;
  pcmBuffer = [];
  totalBytes = 0;

  // Start foreground service FIRST — required for Android 14 microphone access from background
  // ReactNativeForegroundService uses start()/stop(), not startService()/stopService()
  // ServiceType cast: @supersami/rn-foreground-service .d.ts omits ServiceType but the JS
  // implementation passes it through to startService() — required on Android 14 for
  // FOREGROUND_SERVICE_TYPE_MICROPHONE.
  const fgServiceConfig = {
    id: 1001,
    title: 'NoScam',
    message: 'Monitoring for AI-generated speech...',
    icon: 'ic_notification',
    importance: 'low',
    ServiceType: 'microphone',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ReactNativeForegroundService.start(fgServiceConfig as any);

  // Initialize AudioRecord AFTER the foreground service is running
  AudioRecord.init(AUDIO_OPTIONS);

  AudioRecord.on('data', (base64Data: string) => {
    // react-native-audio-record emits base64-encoded PCM chunks.
    // Accumulate until exactly 64000 bytes, then send one complete 2-second frame.
    const bytes = Buffer.from(base64Data, 'base64');
    pcmBuffer.push(bytes);
    totalBytes += bytes.length;

    if (totalBytes >= CHUNK_BYTES) {
      const combined = Buffer.concat(pcmBuffer);
      const chunk = combined.slice(0, CHUNK_BYTES);

      // Send as ArrayBuffer — NOT Buffer, NOT base64 string
      chunkCallback?.(chunk.buffer as ArrayBuffer);

      // Keep remainder bytes for next chunk (avoid losing audio between chunks)
      const remainder = combined.slice(CHUNK_BYTES);
      pcmBuffer = remainder.length > 0 ? [remainder] : [];
      totalBytes = remainder.length;
    }
  });

  AudioRecord.start();
}

/**
 * Stop audio capture and tear down the foreground service.
 */
export async function stopAudioCapture(): Promise<void> {
  AudioRecord.stop();
  chunkCallback = null;
  pcmBuffer = [];
  totalBytes = 0;

  await ReactNativeForegroundService.stop();
}
