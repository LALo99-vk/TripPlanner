// Haptic feedback utility for mobile devices
import { Capacitor } from '@capacitor/core';

let Haptics: any = null;

// Dynamically import Haptics only on native platforms
if (Capacitor.isNativePlatform()) {
  import('@capacitor/haptics').then(module => {
    Haptics = module.Haptics;
  });
}

/**
 * Trigger light haptic feedback (for button taps)
 */
export const hapticLight = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: 'light' });
    } catch (e) {
      // Silently fail on unsupported devices
    }
  }
};

/**
 * Trigger medium haptic feedback (for selections)
 */
export const hapticMedium = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: 'medium' });
    } catch (e) {
      // Silently fail
    }
  }
};

/**
 * Trigger heavy haptic feedback (for important actions)
 */
export const hapticHeavy = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: 'heavy' });
    } catch (e) {
      // Silently fail
    }
  }
};

/**
 * Trigger success haptic feedback
 */
export const hapticSuccess = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: 'success' });
    } catch (e) {
      // Silently fail
    }
  }
};

/**
 * Trigger error haptic feedback
 */
export const hapticError = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: 'error' });
    } catch (e) {
      // Silently fail
    }
  }
};

/**
 * Trigger warning haptic feedback
 */
export const hapticWarning = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: 'warning' });
    } catch (e) {
      // Silently fail
    }
  }
};

/**
 * Trigger selection changed haptic feedback
 */
export const hapticSelection = async () => {
  if (Haptics && Capacitor.isNativePlatform()) {
    try {
      await Haptics.selectionChanged();
    } catch (e) {
      // Silently fail
    }
  }
};

