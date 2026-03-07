import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  requestMicPermission,
  checkOverlayPermission,
  requestOverlayPermission,
} from '../permissions/PermissionManager';

type Props = {
  onPermissionsGranted: () => void;
};

export default function PermissionSetupScreen({ onPermissionsGranted }: Props) {
  const [micGranted, setMicGranted] = useState(false);
  const [overlayGranted, setOverlayGranted] = useState(false);

  const handleMicPermission = async () => {
    const granted = await requestMicPermission();
    setMicGranted(granted);
    if (!granted) {
      Alert.alert(
        'Microphone Required',
        'NoScam cannot detect AI voices without microphone access. Please grant the permission.',
      );
    }
  };

  const handleOverlayPermission = async () => {
    const alreadyGranted = await checkOverlayPermission();
    if (alreadyGranted) {
      setOverlayGranted(true);
      return;
    }
    Alert.alert(
      'Overlay Permission Required',
      'NoScam needs to show a badge over other apps. You will be taken to Settings — enable "Display over other apps" for NoScam, then return here.',
      [
        {
          text: 'Open Settings',
          onPress: async () => {
            await requestOverlayPermission();
            const granted = await checkOverlayPermission();
            setOverlayGranted(granted);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const canProceed = micGranted && overlayGranted;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NoScam Setup</Text>
      <Text style={styles.subtitle}>Grant permissions to enable real-time AI detection</Text>

      <TouchableOpacity
        style={[styles.button, micGranted && styles.buttonGranted]}
        onPress={handleMicPermission}
        disabled={micGranted}>
        <Text style={styles.buttonText}>
          {micGranted ? '✓ Microphone — Granted' : 'Grant Microphone Access'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, overlayGranted && styles.buttonGranted]}
        onPress={handleOverlayPermission}
        disabled={overlayGranted}>
        <Text style={styles.buttonText}>
          {overlayGranted ? '✓ Overlay — Granted' : 'Grant Overlay Permission'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.startButton, !canProceed && styles.startButtonDisabled]}
        onPress={onPermissionsGranted}
        disabled={!canProceed}>
        <Text style={styles.startButtonText}>Start Monitoring</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#9ca3af', fontSize: 14, marginBottom: 40 },
  button: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  buttonGranted: { borderColor: '#22c55e', backgroundColor: '#14532d' },
  buttonText: { color: '#fff', fontSize: 15 },
  startButton: { backgroundColor: '#2563eb', borderRadius: 8, padding: 16, marginTop: 24, alignItems: 'center' },
  startButtonDisabled: { backgroundColor: '#374151' },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
