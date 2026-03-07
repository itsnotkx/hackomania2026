# Quick Start Guide - Deepfake Detector

## Prerequisites

### Backend
- Python 3.10 or 3.11
- ~4GB free disk space (for model weights)

### Frontend
- Node.js 18+ and npm
- Expo CLI
- iOS Simulator (macOS) or Android Emulator

---

## 🚀 Running the Backend

### 1. Set up Python environment

**Option A: Using venv (recommended)**
```powershell
cd deepfake-detector/backend
python -m venv venv
.\venv\Scripts\activate
```

**Option B: Using conda**
```powershell
cd deepfake-detector/backend
conda create -n deepfake python=3.11
conda activate deepfake
```

### 2. Install dependencies

```powershell
pip install -r requirements.txt
```

> ⏱️ This will take 5-10 minutes as it downloads PyTorch and transformers.

### 3. Download the AI model

```powershell
python scripts/download_model.py
```

This downloads the wav2vec2 model (~400MB) to `model_weights/`

### 4. Start the backend server

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

✅ Backend should now be running at `http://localhost:8000`

**Test it:** Open http://localhost:8000/health in your browser
```json
{
  "status": "ok",
  "model_loaded": true,
  "version": "1.0.0"
}
```

---

## 📱 Running the Frontend (Mobile App)

### 1. Install dependencies

```powershell
cd deepfake-detector/frontend
npm install
```

### 2. Configure backend URL

**For Android Emulator/iOS Simulator:**
The `.env` file is already configured with `localhost` which should work.

**For Physical Device:**
Edit `.env` and replace `localhost` with your computer's local IP:
```
EXPO_PUBLIC_API_URL=http://192.168.1.XXX:8000/api/v1
EXPO_PUBLIC_WS_URL=ws://192.168.1.XXX:8000/ws/v1
```

To find your IP:
```powershell
ipconfig
# Look for "IPv4 Address" under your active network adapter
```

### 3. Start the Expo dev server

```powershell
npm start
```

### 4. Run on device/simulator

Once the Metro bundler starts, press:
- **`i`** - Open in iOS Simulator
- **`a`** - Open in Android Emulator  
- **Scan QR code** - With Expo Go app on physical device

---

## ✅ Testing the App

### Test 1: Backend Connection
1. Open the app
2. You should see "✓ Backend Connected" on the welcome screen
3. If not, check backend is running and `.env` URL is correct

### Test 2: Floating Bubble
1. Tap "Get Started"
2. Select a source type (e.g., "Phone Call")
3. Tap "Start Detection"
4. Grant microphone permission
5. The floating **🫧 bubble** should appear
6. Speak into your mic - you should see the score change

### Test 3: Color Indicators
- **🟢 Green** (0-30%) - Normal voice (likely real)
- **🟠 Amber** (30-60%) - Uncertain
- **🔴 Red** (60-100%) - Likely AI-generated

> **Note:** Most human voices will show green/amber. To test red, you'd need to play AI-generated audio.

---

## 🐛 Troubleshooting

### Backend Issues

**"Model not loading"**
```powershell
cd backend
python scripts/download_model.py
```

**Port 8000 already in use**
```powershell
# Use a different port
uvicorn app.main:app --port 8001
# Then update frontend .env with the new port
```

**Import errors**
```powershell
pip install -r requirements.txt --force-reinstall
```

### Frontend Issues

**"Cannot connect to backend"**
1. Ensure backend is running (`http://localhost:8000/health`)
2. Check `.env` has correct IP (not `localhost` for physical devices)
3. Ensure firewall allows port 8000
4. For physical devices, computer and phone must be on same WiFi

**"Expo command not found"**
```powershell
npm install -g expo-cli
```

**Metro bundler issues**
```powershell
npm start -- --clear
```

**Dependencies issues**
```powershell
rm -rf node_modules package-lock.json
npm install
```

### Permission Issues

**Microphone not working**
- Android: Grant permissions in Settings > Apps > Expo Go > Permissions
- iOS: Grant permissions when prompted

**Floating bubble not showing**
- Make sure detection is started
- Check if you accidentally closed the bubble (restart detection)

---

## 📊 API Documentation

Once backend is running, visit:
- **OpenAPI Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health
- **Config:** http://localhost:8000/api/v1/config

---

## 🎯 Running a Complete Test

### Scenario: Detect AI Voice in a YouTube Video

1. **Start Backend:**
   ```powershell
   cd backend
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

2. **Start Frontend:**
   ```powershell
   cd frontend  
   npm start
   # Press 'a' for Android or 'i' for iOS
   ```

3. **In the App:**
   - Tap "Get Started"
   - Select **📺 Video/YouTube**
   - Tap "Start Detection"
   - Grant microphone permission
   - Open YouTube in a browser/app
   - Play a video
   - Watch the floating bubble update in real-time!

4. **Expected Behavior:**
   - Bubble appears in top-right
   - Score updates every 2 seconds
   - You can drag the bubble around
   - Color changes based on AI probability
   - Session appears in History tab after stopping

---

## 🔥 Quick Commands Reference

```powershell
# Backend
cd deepfake-detector/backend
.\venv\Scripts\activate                # Activate venv
uvicorn app.main:app --reload          # Start server
python scripts/test_inference.py       # Test model

# Frontend
cd deepfake-detector/frontend
npm start                              # Start Expo
npm start -- --clear                   # Clear cache and start
npm run android                        # Direct Android launch
npm run ios                            # Direct iOS launch
```

---

## 💡 Tips

1. **First run:** Backend model loading takes ~30 seconds on first request
2. **Performance:** Run backend and frontend on same machine for best latency
3. **Testing:** Use real voice recordings to test green scores
4. **AI audio:** Test red scores with AI voice generators (ElevenLabs, etc.)
5. **Network:** For demos, use same WiFi network for all devices

---

## 🎓 What's Happening Under the Hood

1. **Frontend** captures microphone audio in 2-second chunks
2. **WebSocket** streams chunks to backend in real-time
3. **Backend** runs AI model inference on each chunk
4. **Model** outputs a score (0.0 = real, 1.0 = fake)
5. **Backend** sends score back via WebSocket
6. **Frontend** updates the floating bubble with color-coded indicator

All in under 200ms! ⚡

---

Need help? Check the API contract at `api-contract.md` or the backend/frontend READMEs.
