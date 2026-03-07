declare module 'react-native-floating-bubble' {
  /**
   * Show the floating bubble overlay at position (x, y) on screen.
   * Requires SYSTEM_ALERT_WINDOW permission to be granted.
   */
  export function showFloatingBubble(x?: number, y?: number): void;

  /**
   * Hide the floating bubble overlay.
   */
  export function hideFloatingBubble(): void;

  /**
   * Check if SYSTEM_ALERT_WINDOW (draw over other apps) permission is granted.
   * Returns a promise resolving to true/false.
   */
  export function checkPermission(): Promise<boolean>;

  /**
   * Request SYSTEM_ALERT_WINDOW permission via native dialog.
   */
  export function requestPermission(): Promise<void>;

  /**
   * Initialize the floating bubble service.
   */
  export function initialize(): void;

  /**
   * Reopen the host app from the floating bubble.
   */
  export function reopenApp(): void;

  const FloatingBubble: {
    showFloatingBubble: typeof showFloatingBubble;
    hideFloatingBubble: typeof hideFloatingBubble;
    checkPermission: typeof checkPermission;
    requestPermission: typeof requestPermission;
    initialize: typeof initialize;
    reopenApp: typeof reopenApp;
  };

  export default FloatingBubble;
}
