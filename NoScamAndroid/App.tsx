import React, { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus, PermissionsAndroid, Platform, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { showFloatingBubble, hideFloatingBubble } from 'react-native-floating-bubble';
import { BadgeOverlay } from './src/components/overlay/BadgeOverlay';
import type { BadgeState } from './src/components/overlay/BadgeOverlay';
import PermissionSetupScreen from './src/screens/PermissionSetupScreen';
import { startAudioCapture, stopAudioCapture } from './src/services/AudioCaptureService';
import { useWebSocket } from './src/hooks/useWebSocket';
import {
  checkOverlayPermission,
  requestMicPermission,
} from './src/permissions/PermissionManager';

// Replace with actual deployed Railway URL after Phase 1 deployment
// e.g. 'wss://noscam-backend-production.up.railway.app/ws'
const BACKEND_WS_URL = 'wss://YOUR_RAILWAY_URL/ws';

type PermissionsState = 'checking' | 'missing' | 'granted';

export default function App() {
  const [permissionsState, setPermissionsState] = useState<PermissionsState>('checking');
  const [isMonitoring, setIsMonitoring] = useState(false);

  const handleVerdict = useCallback((_result: { label: 'AI' | 'HUMAN' | 'UNCERTAIN'; score: number; ms: number }) => {
    // Verdict received — badgeState is updated automatically by useWebSocket hook
  }, []);

  const { badgeState, connect, disconnect, sendChunk } = useWebSocket({
    url: BACKEND_WS_URL,
    onVerdict: handleVerdict,
  });

  // Check both permissions on mount
  useEffect(() => {
    checkPermissions();
  }, []);

  // Show/hide float bubble whenever monitoring state changes
  useEffect(() => {
    if (permissionsState === 'granted' && isMonitoring) {
      showFloatingBubble(50, 100);
    } else if (!isMonitoring) {
      hideFloatingBubble();
    }
  }, [isMonitoring, permissionsState]);

  const checkPermissions = async () => {
    if (Platform.OS !== 'android') {
      setPermissionsState('missing');
      return;
    }

    const micStatus = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    const overlayGranted = await checkOverlayPermission();

    if (micStatus && overlayGranted) {
      setPermissionsState('granted');
    } else {
      setPermissionsState('missing');
    }
  };

  const handlePermissionsGranted = () => {
    setPermissionsState('granted');
  };

  const startMonitoring = async () => {
    setIsMonitoring(true);
    connect();
    // Wire audio capture output directly to WebSocket sender —
    // audio bytes flow from microphone → sendChunk → WebSocket binary frame
    await startAudioCapture(sendChunk);
  };

  const stopMonitoring = async () => {
    setIsMonitoring(false);
    await stopAudioCapture();
    disconnect();
  };

  if (permissionsState === 'checking') {
    return <View style={styles.loading} />;
  }

  if (permissionsState === 'missing') {
    return (
      <PermissionSetupScreen onPermissionsGranted={handlePermissionsGranted} />
    );
  }

  // Main monitoring screen — shown when the user returns to the NoScam app.
  // The floating bubble badge is the primary always-on-top UI while monitoring.
  return (
    <View style={styles.container}>
      <BadgeOverlay state={badgeState} />

      <Text style={styles.statusText}>
        {isMonitoring ? 'Monitoring active' : 'Monitoring stopped'}
      </Text>

      {!isMonitoring ? (
        <TouchableOpacity style={styles.startButton} onPress={startMonitoring}>
          <Text style={styles.buttonText}>Start Monitoring</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.stopButton} onPress={stopMonitoring}>
          <Text style={styles.buttonText}>Stop Monitoring</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.hint}>
        {isMonitoring
          ? 'Float bubble visible above all apps. Press home to continue using your phone.'
          : 'Tap Start to begin AI voice detection.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#111' },
  container: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  statusText: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 16,
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  stopButton: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 280,
  },
});
