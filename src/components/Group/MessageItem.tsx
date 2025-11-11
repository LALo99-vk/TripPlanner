import React, { useState } from 'react';
import { Trash2, Edit, Mic, Play, Pause } from 'lucide-react';
import { ChatMessage } from '../../services/chatRepository';

interface MessageItemProps {
  message: ChatMessage;
  currentUserId: string;
  isLeader: boolean;
  onDelete: () => void;
  onEdit?: (newText: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  currentUserId,
  isLeader,
  onDelete,
  onEdit,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text || '');
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const isOwnMessage = message.senderId === currentUserId;
  const canEdit = isOwnMessage && message.messageType === 'text' && onEdit;
  const canDelete = isLeader || isOwnMessage;

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const handleEdit = () => {
    if (editText.trim() && editText !== message.text) {
      onEdit?.(editText);
    }
    setIsEditing(false);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`flex gap-3 mb-4 ${
        isOwnMessage ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
        {message.senderName.charAt(0).toUpperCase()}
      </div>

      {/* Message Content */}
      <div className={`flex-1 ${isOwnMessage ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Sender Name and Time */}
        <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs font-medium text-primary">{message.senderName}</span>
          <span className="text-xs text-muted">{formatTime(message.createdAt)}</span>
          {message.edited && (
            <span className="text-xs text-muted italic">(edited)</span>
          )}
        </div>

        {/* Message Body */}
        <div
          className={`glass-card p-3 max-w-[70%] ${
            isOwnMessage ? 'bg-orange-500/20' : ''
          }`}
        >
          {message.messageType === 'text' ? (
            isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="glass-input w-full px-2 py-1 rounded text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEdit();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleEdit}
                    className="text-xs premium-button-primary px-2 py-1"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs premium-button-secondary px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-primary whitespace-pre-wrap">{message.text}</p>
            )
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPause}
                className="w-10 h-10 rounded-full bg-orange-500/20 hover:bg-orange-500/30 flex items-center justify-center transition-colors"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 text-orange-500" />
                ) : (
                  <Play className="h-5 w-5 text-orange-500" />
                )}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Mic className="h-4 w-4 text-muted" />
                  <span className="text-xs text-muted">
                    {formatDuration(message.voiceDuration)}
                  </span>
                </div>
                {message.voiceUrl && (
                  <audio
                    ref={audioRef}
                    src={message.voiceUrl}
                    onEnded={handleAudioEnded}
                    className="hidden"
                  />
                )}
              </div>
            </div>
          )}

          {/* Mentions */}
          {message.mentions && message.mentions.length > 0 && (
            <div className="mt-2 text-xs text-blue-300">
              Mentions: {message.mentions.join(', ')}
            </div>
          )}
        </div>

        {/* Actions */}
        {(canEdit || canDelete) && !isEditing && (
          <div className={`flex items-center gap-2 mt-1 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
            {canEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-muted hover:text-primary transition-colors"
                title="Edit message"
              >
                <Edit className="h-3 w-3" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-muted hover:text-red-400 transition-colors"
                title="Delete message"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageItem;

