import { StyleSheet } from 'react-native';

export const BADGE_COLORS = {
  HUMAN: '#22c55e',        // green
  AI_DETECTED: '#ef4444',  // red
  ANALYZING: '#6b7280',    // grey
  DISCONNECTED: '#374151', // dark grey
} as const;

export const BADGE_LABELS = {
  HUMAN: 'OK',
  AI_DETECTED: 'AI',
  ANALYZING: '...',
  DISCONNECTED: '—',
} as const;

export const badgeStyles = StyleSheet.create({
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
