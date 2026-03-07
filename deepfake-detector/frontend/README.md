# Deepfake Detector - Mobile App

A React Native mobile application for real-time AI-generated audio detection with a floating bubble overlay indicator.

## Features

### 🫧 Floating Bubble Overlay
- **Draggable bubble** that displays real-time AI detection scores
- **Color-coded indicators**:
  - 🟢 **Green** - Likely Real (score < 30%)
  - 🟠 **Amber** - Uncertain (score 30-60%)
  - 🔴 **Red** - Likely AI-Generated (score > 60%)
- **Percentage score** showing AI detection confidence
- **Confidence bar** indicating detection reliability
- **Pulse animation** when AI content is detected

### 🎤 Live Detection with Multiple Source Types
- **Phone Calls** (📞) - Real-time call monitoring
- **Video/YouTube** (📺) - Monitor audio from video playback
- **Voice Messages** (🎵) - Analyze voice messages and recordings

All sources use real-time WebSocket streaming for instant results!

### 📊 Session History
- View past detection sessions
- Session statistics (avg score, peak score, duration)
- Color-coded verdicts
- Pull-to-refresh functionality

## How It Works

Unlike traditional file upload approaches, this app **captures and streams audio in real-time** for all source types:

- **Phone Call**: Captures microphone audio during calls and streams 2-second chunks
- **YouTube/Video**: Captures system audio while video plays and analyzes it live
- **Voice Message**: Captures the playback audio as the message plays

All audio is sent via WebSocket to the backend for immediate AI detection.

## Tech Stack

- **React Native** with Expo
- **Expo Router** for file-based navigation
- **Zustand** for state management
- **TypeScript** for type safety
- **WebSocket** for real-time streaming
- **Expo AV** for audio recording

## Prerequisites

- Node.js 18+ and npm/yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Backend server running (see backend README)

## Installation

1. **Install dependencies**:
   ```bash
   cd deepfake-detector/frontend
   npm install
   ```

2. **Configure backend URL**:
   Edit `.env` file:
   ```
   EXPO_PUBLIC_API_URL=http://YOUR_BACKEND_IP:8000/api/v1
   EXPO_PUBLIC_WS_URL=ws://YOUR_BACKEND_IP:8000/ws/v1
   ```
   
   > **Note**: For testing on physical devices, replace `localhost` with your computer's local IP address.

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Run on device/simulator**:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app for physical device

## Project Structure

```
frontend/
├── app/                      # Expo Router pages
│   ├── _layout.tsx          # Root layout
│   ├── index.tsx            # Welcome screen
│   └── (tabs)/              # Tab navigation
│       ├── _layout.tsx      # Tab layout
│       ├── live.tsx         # Live detection screen
│       └── history.tsx      # Session history
├── components/
│   └── detection/
│       └── FloatingBubble.tsx  # Floating bubble overlay
├── services/
│   ├── api.ts               # REST API client
│   ├── websocket.ts         # WebSocket client
│   └── audioCapture.ts      # Audio recording service
├── stores/
│   └── detectionStore.ts    # Zustand state management
├── types/
│   └── index.ts             # TypeScript definitions
└── utils/
    └── constants.ts         # App constants
```

## Usage

### Starting a Detection Session

1. Open the app and navigate to the **Detect** tab
2. **Select your audio source**:
   - 📞 **Phone Call** - For monitoring live phone calls
   - 📺 **Video/YouTube** - For analyzing video playback (YouTube, TikTok, etc.)
   - 🎵 **Voice Message** - For checking voice messages or recordings
3. Tap **Start Detection**
4. Grant microphone permissions when prompted
5. The **floating bubble** will appear, showing:
   - Real-time AI detection score (0-100%)
   - Color indicator (green/amber/red)
   - Confidence level bar

### Use Cases

**📞 Phone Call Mode**
- Start before or during a call
- The app monitors the conversation in real-time
- Bubble shows if the other person's voice is AI-generated

**📺 Video/YouTube Mode**  
- Open YouTube or any video app
- Start detection before playing the video
- The app captures and analyzes the video's audio track
- Perfect for checking if influencers are using AI voices

**🎵 Voice Message Mode**
- Before playing a voice message (WhatsApp, Telegram, etc.)
- Start detection, then play the message
- Get instant AI detection results

### Viewing History

1. Navigate to the **History** tab
2. View all past detection sessions
3. Pull down to refresh the list

## Floating Bubble Behavior

- **Draggable**: Press and drag to move the bubble
- **Snaps to edge**: Automatically snaps to left/right screen edge
- **Pulse animation**: Pulses when high AI score detected
- **Close button**: Tap × to hide (can re-enable in settings)
- **Always on top**: Overlays other app content during detection

## Permissions

### iOS
- **Microphone**: Required for live audio detection
- **Background Audio**: Allows detection while app is in background

### Android
- **RECORD_AUDIO**: Required for microphone access
- **SYSTEM_ALERT_WINDOW**: Required for floating bubble overlay
- **FOREGROUND_SERVICE**: Required for background detection

## Color Coding Guide

The app uses traffic light colors for quick interpretation:

| Score Range | Color | Meaning | Action |
|------------|-------|---------|--------|
| 0-30% | 🟢 Green | Likely Real | Content appears genuine |
| 30-60% | 🟠 Amber | Uncertain | Be cautious, unclear result |
| 60-100% | 🔴 Red | Likely AI | High probability of AI generation |

## API Integration

The app communicates with the backend via:

1. **REST API** (`/api/v1`):
   - `POST /sessions` - Create detection session
   - `DELETE /sessions/{id}` - End session
   - `POST /analyze/{id}` - Upload file for analysis
   - `GET /health` - Check backend status

2. **WebSocket** (`/ws/v1/stream/{session_id}`):
   - Send audio chunks (binary or base64)
   - Receive real-time detection results

## Development

### Running in Development Mode

```bash
npm start
```

### Type Checking

```bash
npx tsc --noEmit
```

### Building for Production

**iOS**:
```bash
eas build --platform ios
```

**Android**:
```bash
eas build --platform android
```

## Troubleshooting

### Floating Bubble Not Showing
- Ensure detection is active
- Check if bubble was manually closed
- Verify `showBubble` state in store

### Audio Not Recording
- Check microphone permissions
- Verify device is not in silent mode (iOS)
- Check audio session configuration

### WebSocket Connection Failed
- Verify backend is running and accessible
- Check `.env` configuration
- Ensure correct IP address (not `localhost` on physical devices)
- Check firewall settings

### Backend Not Connecting
- Verify backend URL in `.env`
- Check backend is running (`/health` endpoint)
- For physical devices, use local network IP, not `localhost`

## Performance Tips

- The app processes 2-second audio chunks by default
- Longer chunks reduce network overhead but increase latency
- Adjust `chunk_duration_ms` in session config for different use cases
- Clean up old sessions to save storage

## Future Enhancements

- [ ] System-wide floating bubble overlay (requires native modules)
- [ ] Notification-based detection alerts
- [ ] Custom color themes
- [ ] Adjustable sensitivity settings
- [ ] Export session data
- [ ] Voice activity detection to skip silence
- [ ] Multi-language support

## License

MIT License - See LICENSE file for details

## Support

For issues or questions, please contact the development team or open an issue on GitHub.
