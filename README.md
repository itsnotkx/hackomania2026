# NoScam — Live AI Audio Deepfake Detector

> A real-time AI-generated audio detection system built to combat scams and fake news, with a focus on protecting vulnerable communities in Southeast Asia.

---

## The Problem

Voice cloning and AI-generated audio are increasingly weaponised in phone scams, fake news, and social engineering attacks. Seniors are disproportionately targeted — a quick phone call from a "government official" or a "family member in distress" is all it takes. Existing solutions focus on detecting AI-generated **text**, but the audio layer has remained largely unaddressed.

NoScam fills that gap.

---

## How It Works

### Primary Layer — AI Audio Detection

Audio is streamed in real time to the backend, where it is analysed by the **[NII Yamagishi Lab `wav2vec-large-anti-deepfake` model](https://huggingface.co/nii-yamagishilab/wav2vec-large-anti-deepfake)** from HuggingFace. This model was trained on the ASVspoof 2021 Deepfake track and over 74,000 hours of data, making it robust against a wide range of voice synthesis techniques.

### Sliding Window Approach

Rather than analysing audio in isolated chunks and making a single binary decision, NoScam uses a **sliding window** strategy:

- Incoming audio is split into short, overlapping chunks (~2 seconds each).
- Each chunk receives an independent fakeness score (0 = real, 1 = fake).
- A **rolling average** across the last N scores smooths out transient noise and one-off misclassifications.
- The rolling average drives the final displayed verdict, making the system resilient to brief silence, background noise, or ambiguous segments.

This means a single uncertain chunk will not trigger a false alarm — consistent patterns of AI-generated audio are what raise the flag.

### Secondary Layer — Transcription + Urgency Analysis

When the primary model is uncertain (score in the 0.3–0.7 range), a secondary pipeline activates automatically:

1. **Google Cloud Speech-to-Text** transcribes the buffered audio, with native support for Singapore English, Mandarin, Malay, and Tamil.
2. The transcript is sent to **[SEA-LION](https://sea-lion.ai/) (aisingapore/Gemma-SEA-LION-v4-27B-IT)** — AI Singapore's Southeast Asia-focused LLM — to classify the urgency of the call content.
3. SEA-LION returns a structured urgency verdict (`low` / `medium` / `high` / `critical`) with reasoning, flagging patterns common in regional scams: impersonation of officials, financial coercion, high-pressure tactics, and phishing language.

This dual-layer approach means that even if the audio synthesis fools the acoustic model, suspicious *content* can still surface a warning.

### Complementing Existing Solutions

This system is designed to complement **[Ahref's](https://ahrefs.com/) AI-generated text detection** capability. Where Ahref identifies AI-written articles and content, NoScam adds an orthogonal **audio detection layer** — together forming a more complete defence against AI-generated disinformation across both written and spoken media.

---

## Architecture

```
Audio Stream (mic / phone call / file)
        │
        ▼
┌───────────────────────┐
│   Backend (FastAPI)   │
│  WebSocket /ws/v1/... │
│                       │
│  ┌─────────────────┐  │
│  │  Sliding Window │  │
│  │  wav2vec model  │  │◄── HuggingFace (NII Yamagishi Lab)
│  │  (per chunk)    │  │
│  └────────┬────────┘  │
│           │ uncertain? │
│  ┌────────▼────────┐  │
│  │ GCP Speech-to-  │  │◄── Google Cloud Speech-to-Text
│  │ Text (en-SG +   │  │    (en-SG, zh, ms, ta)
│  │ multilingual)   │  │
│  └────────┬────────┘  │
│           │            │
│  ┌────────▼────────┐  │
│  │  SEA-LION LLM   │  │◄── AI Singapore SEA-LION v4 27B
│  │ urgency scoring │  │
│  └─────────────────┘  │
└───────────────────────┘
        │
        ▼
  Frontend verdict + urgency alert
```

---

## Frontends

Three interfaces are provided, targeting different user profiles:

### 1. Web App (`/frontend`) — General Users
A clean, browser-based dashboard that lets anyone analyse audio in real time or upload a file for post-hoc analysis. Designed to be accessible and self-explanatory — no technical knowledge required.

### 2. Browser Extension (`/extension`) — Tech-Savvy Users
A Chrome extension that runs passively in the background during browser-based calls (e.g. video conferencing, voice notes). It captures the remote speaker's audio via the browser's audio capture API and streams it to the backend, overlaying a live verdict without interrupting the call.

### 3. Android App (`/android`) — Seniors (Primary Target)
The Android application is the most critical frontend, because **phone calls are the primary vector for scams targeting seniors**. The app integrates with the device's microphone to monitor calls and surface a real-time warning when AI-generated audio is detected — before the victim acts on it.

---

## Tech Stack

| Component | Technology |
|---|---|
| Backend | Python, FastAPI, WebSockets |
| AI Audio Detection | `nii-yamagishilab/wav2vec-large-anti-deepfake` (HuggingFace) |
| Speech-to-Text | Google Cloud Speech-to-Text v1 |
| Content Analysis | SEA-LION `aisingapore/Gemma-SEA-LION-v4-27B-IT` |
| Web Frontend | Next.js |
| Browser Extension | Vanilla JS, Chrome Extension Manifest V3 |
| Mobile | Android (Kotlin) |
| Deployment | Docker, Docker Compose |

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- GCP service account JSON key with Speech-to-Text enabled
- SEA-LION API key from [sea-lion.ai](https://sea-lion.ai/)

### Running the Backend

```bash
cd backend

# Set environment variables
export GCP_CREDENTIALS_JSON=/path/to/service-account.json
export SEALION_API_KEY=your_key_here

docker compose up --build
```

The backend starts on `http://localhost:8000`. The model downloads automatically on first run and is cached in a Docker volume for subsequent starts.

### Running the Web Frontend

```bash
cd frontend
npm install
npm run dev
```

### Loading the Browser Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `/extension` directory

### Android App

Open `/android` in Android Studio and run on a device or emulator (API 26+).

---

## API Overview

| Endpoint | Description |
|---|---|
| `GET /health` | Backend health and model readiness |
| `POST /sessions` | Create a new streaming session |
| `WS /ws/v1/stream/{session_id}` | Real-time audio streaming and scoring |
| `POST /analyze` | One-shot file analysis |
| `GET /config` | Current backend configuration |

---

## Project Structure

```
deepfake-detector/
├── backend/          # FastAPI backend, ML inference, WebSocket server
├── frontend/         # Next.js web app
├── extension/        # Chrome browser extension
└── android/          # Android mobile app
```
