import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, Loader } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';
import {
  ChatMessage,
  sendMessage,
  subscribeGroupChat,
  getGroupMessages,
  editMessage,
  deleteMessage,
  uploadVoiceMessage,
} from '../../services/chatRepository';
import MessageItem from './MessageItem';

interface ChatSectionProps {
  groupId: string;
  leaderId: string;
}

const ChatSection: React.FC<ChatSectionProps> = ({ groupId, leaderId }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    isRecording,
    audioUrl,
    duration,
    startRecording,
    stopRecording,
    clearRecording,
  } = useVoiceRecording();

  const isLeader = user?.uid === leaderId;

  // Subscribe to real-time messages
  useEffect(() => {
    if (!groupId) return;

    // Immediate load for fast first paint
    getGroupMessages(groupId).then((initial) => {
      setMessages(initial);
      setLoading(false);
      scrollToBottom();
    });

    // Realtime updates
    const unsubscribe = subscribeGroupChat(groupId, (updatedMessages) => {
      setMessages(updatedMessages);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [groupId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendText = async () => {
    if (!user || !inputText.trim() || sending) return;

    setSending(true);
    try {
      // Optimistic UI
      const tempId = `temp-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        groupId,
        senderId: user.uid,
        senderName: user.displayName || 'User',
        messageType: 'text',
        text: inputText.trim(),
        voiceUrl: null,
        voiceDuration: null,
        mentions: [],
        edited: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      scrollToBottom();

      await sendMessage(groupId, user.uid, user.displayName || 'User', {
        text: inputText.trim(),
      });
      setInputText('');
    } catch (error) {
      console.error('Error sending message:', error);
      // rollback optimistic state if needed (optional)
    } finally {
      setSending(false);
    }
  };

  const handleSendVoice = async () => {
    if (!user || !audioUrl || sending) return;

    setSending(true);
    try {
      // Convert audio URL to blob
      const response = await fetch(audioUrl);
      const blob = await response.blob();

      // Upload voice message
      const voiceUrl = await uploadVoiceMessage(groupId, user.uid, blob);

      // Send message with voice
      await sendMessage(groupId, user.uid, user.displayName || 'User', {
        voiceUrl,
        voiceDuration: duration,
      });

      clearRecording();
    } catch (error) {
      console.error('Error sending voice message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!user) return;

    try {
      await editMessage(messageId, newText, user.uid);
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!user || !confirm('Are you sure you want to delete this message?')) return;

    try {
      await deleteMessage(messageId, user.uid, isLeader);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className="flex flex-col" style={{ height: '600px', maxHeight: '70vh' }}>
      {/* Messages Container */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-muted mb-2">No messages yet</p>
              <p className="text-muted text-sm">Start the conversation!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                currentUserId={user?.uid || ''}
                isLeader={isLeader}
                onDelete={() => handleDeleteMessage(message.id)}
                onEdit={(newText) => handleEditMessage(message.id, newText)}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Voice Message Preview */}
      {audioUrl && (
        <div className="px-4 py-2 border-t border-white/10">
          <div className="glass-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mic className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-primary">Voice message ready</p>
                <p className="text-xs text-muted">{formatDuration(duration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <audio controls src={audioUrl} className="h-8" />
              <button
                onClick={handleSendVoice}
                disabled={sending}
                className="premium-button-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
              <button
                onClick={clearRecording}
                className="premium-button-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Bar */}
      {!audioUrl && (
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`p-3 rounded-lg transition-colors ${
                isRecording
                  ? 'bg-red-500/20 text-red-400'
                  : 'premium-button-secondary'
              }`}
              title="Hold to record voice message"
            >
              {isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 glass-input px-4 py-3 rounded-lg"
              disabled={sending}
            />

            <button
              onClick={handleSendText}
              disabled={!inputText.trim() || sending}
              className="premium-button-primary p-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>

          {isRecording && (
            <div className="mt-2 text-center">
              <p className="text-sm text-red-400 animate-pulse">
                Recording... Release to send
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatSection;

