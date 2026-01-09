import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Send, 
  Users,
  MapPin,
  Mic,
  MicOff,
  AlertTriangle
} from 'lucide-react';
import { auth } from '../../config/firebase';
import { getUserGroups, Group } from '../../services/groupRepository';
import { 
  sendMessage, 
  subscribeGroupChat,
  addOptimisticMessage,
  getGroupMessages,
  ChatMessage 
} from '../../services/chatRepository';

interface UnreadCounts {
  [groupId: string]: number;
}

const ChatSidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastReadTimestamps = useRef<{ [groupId: string]: string }>({});

  // Auth listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Load user's groups
  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }

    const loadGroups = async () => {
      try {
        const userGroups = await getUserGroups(user.uid);
        setGroups(userGroups);
        
        // Auto-select first group if none selected
        if (userGroups.length > 0 && !selectedGroupId) {
          setSelectedGroupId(userGroups[0].id);
        }
      } catch (error) {
        console.error('Error loading groups:', error);
      }
    };

    loadGroups();
  }, [user]);

  // Subscribe to selected group's messages with polling fallback
  useEffect(() => {
    if (!selectedGroupId) return;

    setLoading(true);
    let pollInterval: NodeJS.Timeout | null = null;
    
    // Real-time subscription
    const unsubscribe = subscribeGroupChat(selectedGroupId, (newMessages) => {
      // Filter out temp/optimistic messages if real ones exist
      const realMessages = newMessages.filter(m => !m.id.startsWith('temp-'));
      setMessages(prev => {
        // Keep optimistic messages that don't have real counterparts yet
        const optimisticOnly = prev.filter(m => 
          m.id.startsWith('temp-') && 
          !realMessages.some(r => r.text === m.text && r.senderId === m.senderId)
        );
        return [...realMessages, ...optimisticOnly];
      });
      setLoading(false);
      
      // Mark as read when viewing
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        lastReadTimestamps.current[selectedGroupId] = lastMsg.createdAt;
        
        // Clear unread for this group
        setUnreadCounts(prev => ({
          ...prev,
          [selectedGroupId]: 0
        }));
      }
    });
    
    // Polling fallback every 3 seconds (in case real-time doesn't work)
    pollInterval = setInterval(async () => {
      try {
        const freshMessages = await getGroupMessages(selectedGroupId);
        setMessages(prev => {
          // Keep optimistic messages that don't have real counterparts yet
          const optimisticOnly = prev.filter(m => 
            m.id.startsWith('temp-') && 
            !freshMessages.some(r => r.text === m.text && r.senderId === m.senderId)
          );
          return [...freshMessages, ...optimisticOnly];
        });
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);

    return () => {
      unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [selectedGroupId]);

  // Track unread messages for non-selected groups
  useEffect(() => {
    if (!user || groups.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    groups.forEach((group) => {
      if (group.id === selectedGroupId) return;

      const unsubscribe = subscribeGroupChat(group.id, (newMessages) => {
        const lastRead = lastReadTimestamps.current[group.id];
        const unreadCount = lastRead
          ? newMessages.filter(m => 
              m.createdAt > lastRead && m.senderId !== user.uid
            ).length
          : newMessages.filter(m => m.senderId !== user.uid).length;
        
        setUnreadCounts(prev => ({
          ...prev,
          [group.id]: unreadCount
        }));
      });

      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [user, groups, selectedGroupId]);

  // Calculate total unread
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    setTotalUnread(total);
  }, [unreadCounts]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedGroupId || !user) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    // Optimistic update - show message instantly
    const optimisticMessages = addOptimisticMessage(messages, {
      groupId: selectedGroupId,
      senderId: user.uid,
      senderName: user.displayName || user.email || 'Anonymous',
      messageType: 'text',
      text: messageText,
    });
    setMessages(optimisticMessages);

    try {
      await sendMessage(
        selectedGroupId,
        user.uid,
        user.displayName || user.email || 'Anonymous',
        { text: messageText }
      );
      // Real message will come through subscription and replace optimistic one
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(messages);
      setNewMessage(messageText); // Restore message on error
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group messages by date
  const groupMessagesByDate = (messages: ChatMessage[]) => {
    const grouped: { [date: string]: ChatMessage[] } = {};
    messages.forEach(msg => {
      const dateKey = formatDate(msg.createdAt);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(msg);
    });
    return grouped;
  };

  if (!user) return null;

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-20 right-4 z-50 p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-full shadow-lg chat-sidebar-btn"
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6 text-white" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-white text-red-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center badge-pulse">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div 
      className={`fixed top-16 right-4 z-50 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
        isMinimized ? 'w-80 h-14' : 'w-80 sm:w-96 h-[500px]'
      }`}
      style={{ maxHeight: 'calc(100vh - 100px)' }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 border-b border-white/10 bg-gradient-to-r from-orange-500/20 to-red-600/20 cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-orange-400" />
          <span className="font-semibold text-white text-sm">Group Chats</span>
          {totalUnread > 0 && !isMinimized && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {totalUnread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isMinimized ? (
            <ChevronUp className="w-5 h-5 text-white/60" />
          ) : (
            <ChevronDown className="w-5 h-5 text-white/60" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Group Selector */}
          <div className="p-2 border-b border-white/10">
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <span className="text-sm text-white truncate">
                    {selectedGroup?.groupName || 'Select a group'}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-black/95 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10 max-h-48 overflow-y-auto dropdown-animate">
                  {groups.length === 0 ? (
                    <div className="p-3 text-center text-white/40 text-sm">
                      No groups yet
                    </div>
                  ) : (
                    groups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 hover:bg-white/10 transition-colors ${
                          group.id === selectedGroupId ? 'bg-orange-500/20' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">
                              {group.groupName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-left truncate">
                            <div className="text-sm text-white truncate">{group.groupName}</div>
                            <div className="text-xs text-white/40 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {group.members.length}
                            </div>
                          </div>
                        </div>
                        {unreadCounts[group.id] > 0 && (
                          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                            {unreadCounts[group.id]}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 chat-scroll" style={{ height: 'calc(100% - 140px)' }}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
              </div>
            ) : !selectedGroupId ? (
              <div className="flex flex-col items-center justify-center h-full text-white/40">
                <MessageCircle className="w-12 h-12 mb-2" />
                <span className="text-sm">Select a group to start chatting</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/40">
                <MessageCircle className="w-12 h-12 mb-2" />
                <span className="text-sm">No messages yet</span>
                <span className="text-xs">Start the conversation!</span>
              </div>
            ) : (
              Object.entries(groupMessagesByDate(messages)).map(([date, dateMessages]) => (
                <div key={date}>
                  {/* Date separator */}
                  <div className="flex items-center justify-center my-2">
                    <span className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded-full">
                      {date}
                    </span>
                  </div>
                  
                  {/* Messages for this date */}
                  {dateMessages.map((msg) => {
                    const isOwn = msg.senderId === user?.uid;
                    const isSOS = msg.messageType === 'sos';
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2 chat-message-in`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                            isSOS 
                              ? 'bg-red-600/30 border border-red-500/50' 
                              : isOwn 
                                ? 'bg-gradient-to-br from-orange-500 to-red-600 text-white' 
                                : 'bg-white/10 text-white'
                          }`}
                        >
                          {!isOwn && (
                            <div className="text-xs font-semibold text-orange-300 mb-1">
                              {msg.senderName}
                            </div>
                          )}
                          {isSOS && (
                            <div className="flex items-center gap-1 text-red-400 text-xs mb-1">
                              <AlertTriangle className="w-3 h-3" />
                              SOS ALERT
                            </div>
                          )}
                          <div className="text-sm whitespace-pre-wrap break-words">
                            {msg.text}
                          </div>
                          <div className={`text-xs mt-1 ${isOwn ? 'text-white/60' : 'text-white/40'}`}>
                            {formatTime(msg.createdAt)}
                            {msg.edited && ' (edited)'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          {selectedGroupId && (
            <div className="p-2 border-t border-white/10 bg-black/50">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-orange-500/50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChatSidebar;
