import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useDetectionStore } from '../../stores/detectionStore';
import { Verdict } from '../../types';

const BUBBLE_SIZE = 80;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const getColorForVerdict = (verdict: Verdict): string => {
  switch (verdict) {
    case 'likely_real':
      return '#22c55e'; // Green
    case 'uncertain':
      return '#f59e0b'; // Amber
    case 'likely_fake':
      return '#ef4444'; // Red
  }
};

const getTextForVerdict = (verdict: Verdict): string => {
  switch (verdict) {
    case 'likely_real':
      return 'REAL';
    case 'uncertain':
      return 'UNCERTAIN';
    case 'likely_fake':
      return 'AI DETECTED';
  }
};

export const FloatingBubble: React.FC = () => {
  const { bubbleState, showBubble, setShowBubble } = useDetectionStore();
  const pan = React.useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 100, y: 100 })).current;
  const scale = React.useRef(new Animated.Value(1)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Animated.spring(scale, {
          toValue: 1.1,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        // Snap to edge
        const snapToRight = gesture.moveX > SCREEN_WIDTH / 2;
        Animated.spring(pan, {
          toValue: {
            x: snapToRight ? SCREEN_WIDTH - BUBBLE_SIZE - 20 : 20,
            y: Math.max(50, Math.min(SCREEN_HEIGHT - BUBBLE_SIZE - 50, gesture.moveY)),
          },
          useNativeDriver: false,
        }).start();

        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Pulse animation when detecting AI
  useEffect(() => {
    if (bubbleState.verdict === 'likely_fake' && bubbleState.isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [bubbleState.verdict, bubbleState.isActive]);

  if (!showBubble) return null;

  const bubbleColor = getColorForVerdict(bubbleState.verdict);
  const bubbleText = getTextForVerdict(bubbleState.verdict);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: Animated.multiply(scale, pulseAnim) },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
        {/* Score percentage */}
        <Text style={styles.scoreText}>{Math.round(bubbleState.score)}%</Text>
        
        {/* Verdict text */}
        <Text style={styles.verdictText}>{bubbleText}</Text>
        
        {/* Confidence indicator */}
        {bubbleState.isActive && (
          <View style={styles.confidenceBar}>
            <View
              style={[
                styles.confidenceFill,
                {
                  width: `${bubbleState.confidence * 100}%`,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => setShowBubble(false)}
      >
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    zIndex: 9999,
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  scoreText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  verdictText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  confidenceBar: {
    width: 50,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
