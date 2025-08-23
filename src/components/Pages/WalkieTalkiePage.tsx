import React, { useState } from 'react';
import { Radio, Mic, MicOff, Volume2, VolumeX, Users, Wifi, WifiOff } from 'lucide-react';
import { VoiceMessage } from '../../types';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';

const WalkieTalkiePage: React.FC = () => {
  const [isConnected, setIsConnected] = useState(true);
  const [volume, setVolume] = useState(80);
  const [selectedChannel, setSelectedChannel] = useState('group-1');
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: '1',
      from: 'Rahul',
      to: 'Everyone',
      audioUrl: '#',
      duration: 3000,
      timestamp: new Date(Date.now() - 300000),
      isPlayed: true
    },
    {
      id: '2',
      from: 'Priya',
      to: 'Everyone',
      audioUrl: '#',
      duration: 5000,
      timestamp: new Date(Date.now() - 120000),
      isPlayed: false
    }
  ]);

  const {
    isRecording,
    audioUrl,
    duration,
    startRecording,
    stopRecording,
    clearRecording
  } = useVoiceRecording();

  const channels = [
    { id: 'group-1', name: 'Goa Trip Group', members: 5, active: 3 },
    { id: 'emergency', name: 'Emergency Channel', members: 12, active: 2 },
    { id: 'family', name: 'Family Channel', members: 8, active: 1 }
  ];

  const sendVoiceMessage = () => {
    if (audioUrl) {
      const newMessage: VoiceMessage = {
        id: Date.now().toString(),
        from: 'You',
        to: 'Everyone',
        audioUrl: audioUrl,
        duration: duration,
        timestamp: new Date(),
        isPlayed: false
      };
      
      setMessages(prev => [newMessage, ...prev]);
      clearRecording();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">
            Walkie-Talkie
          </h1>
          <p className="text-xl text-secondary">
            Stay connected with your travel group with instant voice messages
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Control Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Connection Status */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="font-semibold text-primary">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <button
                  onClick={() => setIsConnected(!isConnected)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {isConnected ? <Wifi className="h-5 w-5 text-green-500" /> : <WifiOff className="h-5 w-5 text-red-500" />}
                </button>
              </div>

              {/* Volume Control */}
              <div className="flex items-center space-x-4 mb-6">
                <VolumeX className="h-5 w-5 text-muted" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <Volume2 className="h-5 w-5 text-secondary" />
                <span className="text-sm font-medium text-secondary w-12">{volume}%</span>
              </div>

              {/* Push to Talk Button */}
              <div className="text-center">
                <button
                  onMouseDown={toggleRecording}
                  onMouseUp={() => isRecording && stopRecording()}
                  onTouchStart={toggleRecording}
                  onTouchEnd={() => isRecording && stopRecording()}
                  disabled={!isConnected}
                  className={`w-32 h-32 rounded-full border-8 font-bold text-lg transition-all duration-200 ${
                    isRecording
                      ? 'bg-red-500 border-red-300 text-white scale-110 animate-pulse shadow-2xl'
                      : isConnected
                      ? 'bg-gradient-to-r from-blue-500 to-green-500 border-blue-300 text-white hover:scale-105 shadow-lg'
                      : 'bg-white/20 border-white/30 text-muted cursor-not-allowed'
                  }`}
                >
                  {isRecording ? (
                    <div className="flex flex-col items-center">
                      <MicOff className="h-8 w-8 mb-1" />
                      <span className="text-sm">Release</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Mic className="h-8 w-8 mb-1" />
                      <span className="text-sm">Hold to Talk</span>
                    </div>
                  )}
                </button>
                
                <p className="text-sm text-secondary mt-4">
                  {isRecording 
                    ? 'Recording... Release to send' 
                    : 'Press and hold to record voice message'
                  }
                </p>
              </div>

              {/* Voice Message Preview */}
              {audioUrl && (
                <div className="mt-6 p-4 glass-card border border-blue-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-primary">Voice Message Ready</span>
                    <span className="text-sm text-secondary">{formatDuration(duration)}</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <audio controls src={audioUrl} className="flex-1" />
                    <button
                      onClick={sendVoiceMessage}
                      className="premium-button-primary px-4 py-2 rounded-lg"
                    >
                      Send
                    </button>
                    <button
                      onClick={clearRecording}
                      className="premium-button-secondary px-4 py-2 rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Message History */}
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-primary mb-6">Recent Messages</h2>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.map((message) => (
                  <div key={message.id} className="flex items-center space-x-4 p-4 glass-card hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {message.from.charAt(0)}
                    </div>
                    
                    <div className="flex-grow">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-primary">{message.from}</span>
                        <span className="text-sm text-muted">
                          {message.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <div className="flex-1 glass-card p-2">
                          <div className="flex items-center space-x-2">
                            <Radio className="h-4 w-4 text-indigo-500" />
                            <span className="text-sm text-secondary">Voice message • {formatDuration(message.duration)}</span>
                            {!message.isPlayed && (
                              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                            )}
                          </div>
                        </div>
                        
                        <button 
                          className="p-2 premium-button-primary rounded-lg"
                          onClick={() => {
                            // In real app, this would play the audio
                            setMessages(prev => 
                              prev.map(m => m.id === message.id ? { ...m, isPlayed: true } : m)
                            );
                          }}
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Channels & Controls */}
          <div className="space-y-6">
            {/* Channel Selection */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
                <Users className="h-5 w-5 mr-2 text-indigo-500" />
                Channels
              </h3>
              
              <div className="space-y-3">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                      selectedChannel === channel.id
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                        : 'glass-card hover:bg-white/10 text-primary'
                    }`}
                  >
                    <div className="font-semibold">{channel.name}</div>
                    <div className={`text-sm ${selectedChannel === channel.id ? 'text-indigo-100' : 'text-secondary'}`}>
                      {channel.members} members • {channel.active} active
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Emergency Features */}
            <div className="glass-card p-6 border border-red-500/30">
              <h3 className="text-lg font-bold text-primary mb-3">🚨 Emergency Mode</h3>
              <p className="text-sm mb-4 text-secondary">
                Instantly broadcast to all travel groups and emergency services
              </p>
              <button className="w-full premium-button-primary py-3 rounded-xl font-semibold">
                Activate SOS
              </button>
            </div>

            {/* Tips */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-primary mb-4">💡 Tips</h3>
              <div className="space-y-3 text-sm text-secondary">
                <p>• Keep messages short and clear</p>
                <p>• Use different channels for different purposes</p>
                <p>• Check your connection before important communications</p>
                <p>• Emergency channel is monitored 24/7</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalkieTalkiePage;