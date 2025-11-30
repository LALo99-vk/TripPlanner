import { Capacitor } from '@capacitor/core';

/**
 * Get the API base URL based on the platform
 * In Capacitor apps, we need to use the actual server IP, not localhost
 */
export const getApiBaseUrl = (): string => {
  const isNative = Capacitor.isNativePlatform();
  
  if (isNative) {
    // For native apps, use environment variable or default to a deployed server
    // In development, you'll need to set this to your computer's IP address
    // Example: http://192.168.1.100:3001/api
    return import.meta.env.VITE_API_BASE_URL || 'http://192.168.1.100:3001/api';
  }
  
  // For web, use the standard URL
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
};

/**
 * Get the Socket.io URL based on the platform
 */
export const getSocketUrl = (): string => {
  const isNative = Capacitor.isNativePlatform();
  
  if (isNative) {
    // For native apps, use environment variable or default to a deployed server
    return import.meta.env.VITE_SOCKET_URL || 'http://192.168.1.100:3001';
  }
  
  // For web, use the standard URL
  return import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
};

