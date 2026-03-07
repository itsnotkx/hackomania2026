import { PermissionsAndroid, Linking, Platform } from 'react-native';
import { checkPermission, requestPermission } from 'react-native-floating-bubble';

/**
 * Request RECORD_AUDIO at runtime.
 * Must be called while the app activity is in the foreground.
 * Returns true if granted, false if denied.
 */
export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone Permission',
      message:
        'NoScam needs access to your microphone to detect AI-generated voices in real time.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Check if SYSTEM_ALERT_WINDOW (draw over other apps) is granted.
 * Uses react-native-floating-bubble's native check — do NOT use PermissionsAndroid for this.
 * Standard requestPermissions() silently does nothing for SYSTEM_ALERT_WINDOW.
 */
export async function checkOverlayPermission(): Promise<boolean> {
  try {
    const result = await checkPermission();
    return Boolean(result);
  } catch {
    return false;
  }
}

/**
 * Redirect user to system settings to grant SYSTEM_ALERT_WINDOW.
 * This is the ONLY way to request this permission — requestPermissions() does nothing.
 * Opens Settings > Apps > NoScam > Display over other apps.
 */
export async function requestOverlayPermission(): Promise<void> {
  await Linking.sendIntent(
    'android.settings.action.MANAGE_OVERLAY_PERMISSION',
    [{ key: 'android.provider.extra.APP_PACKAGE', value: 'com.noscamandroid' }],
  );
}
