import React from 'react';
import { View, Text } from 'react-native';
import { BADGE_COLORS, BADGE_LABELS, badgeStyles } from './badgeStyles';

export type BadgeState = 'HUMAN' | 'AI_DETECTED' | 'ANALYZING' | 'DISCONNECTED';

type Props = {
  state: BadgeState;
};

/**
 * BadgeOverlay renders the circular verdict badge.
 * Used both inside the app and as the visual content of the floating bubble.
 * Four states: HUMAN (green/OK), AI_DETECTED (red/AI), ANALYZING (grey/...), DISCONNECTED (dark/—)
 */
export function BadgeOverlay({ state }: Props) {
  return (
    <View style={[badgeStyles.badge, { backgroundColor: BADGE_COLORS[state] }]}>
      <Text style={badgeStyles.label}>{BADGE_LABELS[state]}</Text>
    </View>
  );
}
