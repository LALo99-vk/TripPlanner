import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tripplanner.app',
  appName: 'AI Trip Planner',
  webDir: 'dist',
  server: {
    // For development: uncomment to use your local server
    // url: 'http://192.168.1.100:5173', // Replace with your computer's IP
    // cleartext: true,
    
    // For production: remove server config to use built files
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
