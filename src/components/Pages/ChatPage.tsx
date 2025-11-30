import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Bot, User, Sparkles, MapPin, DollarSign, Plane } from 'lucide-react';
import { ChatMessage } from '../../types';
import { SAMPLE_CHAT_MESSAGES } from '../../utils/mockData';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';
import { apiService } from '../../services/api';

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(SAMPLE_CHAT_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    isRecording,
    audioUrl,
    startRecording,
    stopRecording,
    clearRecording
  } = useVoiceRecording();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getAIResponse = async (userMessage: string): Promise<string> => {
    try {
      const response = await apiService.sendChatMessage(userMessage, 'Travel chat assistance');
      return response.response;
    } catch (error: any) {
      return "I'm sorry, I'm having trouble connecting right now. Please try again in a moment. 🤖";
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: messageText,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      const aiResponseText = await getAIResponse(messageText);
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: aiResponseText,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    } catch (error) {
      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment. 🤖",
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorResponse]);
      setIsTyping(false);
    }
  };

  const handleVoiceInput = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const quickActions = [
    { text: "Plan a 3-day trip to Goa under ₹15,000", icon: MapPin },
    { text: "Show me budget breakdown for Kerala trip", icon: DollarSign },
    { text: "Best time to visit Rajasthan?", icon: Sparkles },
    { text: "Book cheapest flight to Mumbai", icon: Plane }
  ];

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-4 flex items-center justify-center">
            <Bot className="h-10 w-10 mr-3 text-primary" />
            🤖 AI Travel Assistant
          </h1>
          <p className="text-xl text-secondary mb-2">
            Your intelligent travel companion for exploring India
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-secondary mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => sendMessage(action.text)}
                  className="flex items-center p-3 glass-card hover:bg-white/10 transition-all duration-200 text-left"
                >
                  <Icon className="h-5 w-5 text-primary mr-3 flex-shrink-0" />
                  <span className="text-sm text-secondary">{action.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="glass-card p-6 mb-6 overflow-hidden flex flex-col h-96">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-start space-x-3 max-w-xs lg:max-w-md ${message.isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.isUser ? 'bg-white' : 'glass-card'
                  }`}>
                    {message.isUser ? (
                      <User className="h-5 w-5 text-black" />
                    ) : (
                      <Bot className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  
                  <div className={`rounded-2xl px-4 py-3 ${
                    message.isUser 
                      ? 'bg-white text-black' 
                      : 'glass-card text-primary'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    <p className={`text-xs mt-1 ${message.isUser ? 'text-black/60' : 'text-secondary'}`}>
                      {message.timestamp.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-3 max-w-xs lg:max-w-md">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full glass-card flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="glass-card rounded-2xl px-4 py-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Voice Recording Display */}
          {audioUrl && (
            <div className="mb-4 p-3 glass-card rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm text-primary">Voice message recorded</span>
                <div className="flex space-x-2">
                  <audio controls src={audioUrl} className="h-8" />
                  <button
                    onClick={clearRecording}
                    className="px-3 py-1 premium-button-secondary text-sm rounded-lg"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => sendMessage("Voice message: [Audio content transcription would appear here in production]")}
                    className="px-3 py-1 premium-button-primary text-sm rounded-lg"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Input Form */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleVoiceInput}
              className={`p-3 rounded-full transition-all duration-200 ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'glass-card text-primary hover:bg-white/10'
              }`}
            >
              {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Ask me anything about travel in India..."
                className="w-full px-4 py-3 glass-input rounded-2xl pr-12"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputText.trim()}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 premium-button-primary rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* AI Features */}
        <div className="glass-card p-6 text-center border border-white/20">
          <h3 className="text-lg font-bold text-primary mb-2">🧠 AI Capabilities</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="text-secondary">📍 Trip Planning</div>
            <div className="text-secondary">💰 Budget Analysis</div>
            <div className="text-secondary">🎫 Booking Assistance</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;