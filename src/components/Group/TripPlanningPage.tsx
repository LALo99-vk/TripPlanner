import React, { useState, useEffect } from 'react';
import { 
  Users, 
  MessageSquare, 
  DollarSign, 
  Calendar, 
  Copy, 
  Send, 
  Plus,
  ArrowLeft,
  Mail,
  Video,
  Phone,
  PhoneCall,
  Circle,
  Paperclip,
  PieChart
} from 'lucide-react';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  updateDoc,
  arrayUnion,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

interface TripPlanningPageProps {
  tripId: string;
  onBack: () => void;
}

interface Trip {
  id: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: string[];
  createdBy: string;
}

interface ChatMessage {
  id: string;
  text: string;
  senderEmail: string;
  timestamp: any;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  paidByEmail: string;
  timestamp: any;
}

interface ItineraryItem {
  id: string;
  date: string;
  activityName: string;
  notes: string;
  addedBy: string;
  timestamp: any;
}

const TripPlanningPage: React.FC<TripPlanningPageProps> = ({ tripId, onBack }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'chat' | 'budget' | 'itinerary'>('overview');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Budget state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    paidBy: ''
  });
  
  // Itinerary state
  const [itineraryItems, setItineraryItems] = useState<ItineraryItem[]>([]);
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [newItineraryItem, setNewItineraryItem] = useState({
    date: '',
    activityName: '',
    notes: '',
    category: 'activity'
  });
  
  // Invitation state
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);

  const { user } = useAuth();

  // Load trip data
  useEffect(() => {
    const loadTrip = async () => {
      try {
        const tripDoc = await getDoc(doc(db, 'trips', tripId));
        if (tripDoc.exists()) {
          setTrip({ id: tripDoc.id, ...tripDoc.data() } as Trip);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading trip:', error);
        setLoading(false);
      }
    };

    loadTrip();
  }, [tripId]);

  // Listen to chat messages
  useEffect(() => {
    const messagesQuery = query(
      collection(db, 'trips', tripId, 'chat'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [tripId]);

  // Listen to expenses
  useEffect(() => {
    const expensesQuery = query(
      collection(db, 'trips', tripId, 'expenses'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];
      setExpenses(expensesData);
    });

    return () => unsubscribe();
  }, [tripId]);

  // Listen to itinerary items
  useEffect(() => {
    const itineraryQuery = query(
      collection(db, 'trips', tripId, 'itinerary'),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(itineraryQuery, (snapshot) => {
      const itineraryData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ItineraryItem[];
      setItineraryItems(itineraryData);
    });

    return () => unsubscribe();
  }, [tripId]);

  // Listen to pending invitations
  useEffect(() => {
    const invitationsQuery = query(
      collection(db, 'invitations'),
      where('tripId', '==', tripId)
    );

    const unsubscribe = onSnapshot(invitationsQuery, (snapshot) => {
      const invitationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingInvitations(invitationsData);
    });

    return () => unsubscribe();
  }, [tripId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    try {
      await addDoc(collection(db, 'trips', tripId, 'chat'), {
        text: newMessage,
        senderEmail: user.email,
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'trips', tripId, 'expenses'), {
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        paidBy: newExpense.paidBy,
        paidByEmail: newExpense.paidBy, // In real app, you'd look up the email
        timestamp: serverTimestamp()
      });

      setNewExpense({ description: '', amount: '', paidBy: '' });
      setShowExpenseModal(false);
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  const addItineraryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'trips', tripId, 'itinerary'), {
        date: newItineraryItem.date,
        activityName: newItineraryItem.activityName,
        notes: newItineraryItem.notes,
        addedBy: user.email,
        timestamp: serverTimestamp()
      });

      setNewItineraryItem({ date: '', activityName: '', notes: '' });
      setShowItineraryModal(false);
    } catch (error) {
      console.error('Error adding itinerary item:', error);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !user) return;

    try {
      await addDoc(collection(db, 'invitations'), {
        tripId: tripId,
        inviteeEmail: inviteEmail,
        invitedBy: user.email,
        timestamp: serverTimestamp()
      });

      alert(`Invitation sent to ${inviteEmail}!`);
      setInviteEmail('');
    } catch (error) {
      console.error('Error sending invitation:', error);
    }
  };

  const startVideoCall = () => {
    // Placeholder for WebRTC video call implementation
    alert('Video call feature coming soon! This would initiate a group video call.');
  };

  const startVoiceCall = () => {
    // Placeholder for WebRTC voice call implementation
    alert('Voice call feature coming soon! This would initiate a group voice call.');
  };

  const startGroupCall = () => {
    // Placeholder for WebRTC group call implementation
    alert('Group call feature coming soon! This would notify all members to join the call.');
  };

  const copyUserId = () => {
    if (user) {
      navigator.clipboard.writeText(user.uid);
      alert('User ID copied to clipboard!');
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Users },
    { id: 'chat' as const, label: 'Group Chat', icon: MessageSquare },
    { id: 'budget' as const, label: 'Shared Budget', icon: DollarSign },
    { id: 'itinerary' as const, label: 'Itinerary', icon: Calendar }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Trip not found</h2>
          <button onClick={onBack} className="text-orange-500 hover:text-orange-600">
            Go back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{trip.tripName}</h1>
              <p className="text-gray-600 mt-1">{trip.destination}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-600">Your User ID:</p>
              <div className="flex items-center space-x-2">
                <code className="text-xs bg-gray-100 px-2 py-1 rounded">{user?.uid}</code>
                <button
                  onClick={copyUserId}
                  className="p-1 text-gray-500 hover:text-gray-700"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg p-1 shadow-md">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Trip Info */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Trip Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Destination</p>
                    <p className="font-semibold">{trip.destination}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Duration</p>
                    <p className="font-semibold">
                      {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Members */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Group Members ({trip.members.length})</h3>
                
                <div className="space-y-3 mb-6">
                  {trip.members.map((memberId, index) => (
                    <div key={memberId} className="flex items-center p-3 bg-gray-50 rounded-lg">
                      <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold">Member {index + 1}</p>
                        <p className="text-sm text-gray-600">{memberId}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Invite Section */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Invite Friends</h4>
                  <div className="flex space-x-3">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <button
                      onClick={inviteMember}
                      className="bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Invite
                    </button>
                  </div>
                </div>

                {/* Pending Invitations */}
                {pendingInvitations.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Pending Invitations</h4>
                    <div className="space-y-2">
                      {pendingInvitations.map((invitation) => (
                        <div key={invitation.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg">
                          <span className="text-sm">{invitation.inviteeEmail}</span>
                          <span className="text-xs text-yellow-600">Pending</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="bg-white rounded-lg shadow-md h-[500px] flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Group Chat</h3>
                  <p className="text-sm text-gray-600">{trip.members.length} members</p>
                </div>
                
                {/* Call Buttons */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={startVideoCall}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Start Video Call"
                  >
                    <Video className="h-5 w-5" />
                  </button>
                  <button
                    onClick={startVoiceCall}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Start Voice Call"
                  >
                    <Phone className="h-5 w-5" />
                  </button>
                  <button
                    onClick={startGroupCall}
                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    title="Start Group Call"
                  >
                    <PhoneCall className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.senderEmail === user?.email ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md ${message.senderEmail === user?.email ? 'order-2' : 'order-1'}`}>
                      {message.senderEmail !== user?.email && (
                        <div className="flex items-center space-x-2 mb-1">
                          <Circle className="h-2 w-2 text-green-500 fill-current" />
                          <span className="text-xs font-medium text-gray-700">{message.senderEmail}</span>
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-2 ${
                        message.senderEmail === user?.email
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        <p className="text-sm">{message.text}</p>
                        <p className={`text-xs mt-1 ${
                          message.senderEmail === user?.email ? 'text-orange-100' : 'text-gray-500'
                        }`}>
                          {message.timestamp?.toDate?.()?.toLocaleTimeString() || 'Just now'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t">
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    onClick={sendMessage}
                    className="bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Budget Tab */}
          {activeTab === 'budget' && (
            <div className="space-y-6">
              {/* Budget Dashboard */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Budget Overview</h3>
                
                {/* Total Spent vs Budget */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Total Spent</span>
                    <span className="text-sm font-medium text-gray-900">
                      ₹{expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-orange-500 to-red-500 h-3 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min((expenses.reduce((sum, exp) => sum + exp.amount, 0) / 50000) * 100, 100)}%` 
                      }}
                    ></div>
                  </div>
                </div>

                {/* Expense Categories */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {['Food', 'Transport', 'Lodging', 'Activities'].map((category) => {
                    const categoryExpenses = expenses.filter(exp => exp.category === category);
                    const categoryTotal = categoryExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                    return (
                      <div key={category} className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-lg font-bold text-gray-900">
                          ₹{categoryTotal.toLocaleString('en-IN')}
                        </div>
                        <div className="text-sm text-gray-600">{category}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Budget Summary */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Shared Budget</h3>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Expense
                  </button>
                </div>

                {/* Expenses List */}
                <div className="space-y-3">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div>
                        <p className="font-semibold text-gray-900">{expense.description}</p>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <span>Paid by {expense.paidByEmail}</span>
                          {expense.category && (
                            <>
                              <span>•</span>
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                {expense.category}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">₹{expense.amount.toLocaleString('en-IN')}</p>
                        <p className="text-sm text-gray-600">₹{(expense.amount / trip.members.length).toLocaleString('en-IN')} per person</p>
                      </div>
                    </div>
                  ))}
                </div>

                {expenses.length === 0 && (
                  <div className="text-center py-8">
                    <PieChart className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No expenses added yet</p>
                  </div>
                )}
              </div>

              {/* Expense Modal */}
              {showExpenseModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Expense</h2>
                    
                    <form onSubmit={addExpense} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                        <input
                          type="text"
                          value={newExpense.description}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          placeholder="e.g., Taxi from Airport"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Amount (₹)</label>
                        <input
                          type="number"
                          value={newExpense.amount}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          placeholder="Enter amount"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                        <select
                          value={newExpense.category}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        >
                          <option value="">Select category</option>
                          <option value="Food">Food</option>
                          <option value="Transport">Transport</option>
                          <option value="Lodging">Lodging</option>
                          <option value="Activities">Activities</option>
                          <option value="Shopping">Shopping</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Who Paid</label>
                        <input
                          type="email"
                          value={newExpense.paidBy}
                          onChange={(e) => setNewExpense(prev => ({ ...prev, paidBy: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          placeholder="Enter email of person who paid"
                          required
                        />
                      </div>

                      <div className="flex space-x-4 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowExpenseModal(false)}
                          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-orange-500 text-white px-4 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
                        >
                          Add Expense
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Itinerary Tab */}
          {activeTab === 'itinerary' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Visual Timeline</h3>
                  <button
                    onClick={() => setShowItineraryModal(true)}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Activity
                  </button>
                </div>

                {/* Timeline */}
                <div className="relative">
                  {/* Timeline Line */}
                  <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                  
                  <div className="space-y-6">
                  {itineraryItems.map((item) => (
                    <div key={item.id} className="relative flex items-start space-x-4">
                      {/* Timeline Icon */}
                      <div className="flex-shrink-0 w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center text-white relative z-10">
                        {item.category === 'flight' && <span>✈️</span>}
                        {item.category === 'hotel' && <span>🏨</span>}
                        {item.category === 'food' && <span>🍽️</span>}
                        {item.category === 'activity' && <span>🎯</span>}
                        {!['flight', 'hotel', 'food', 'activity'].includes(item.category) && <span>📍</span>}
                      </div>
                      
                      {/* Timeline Content */}
                      <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold text-gray-900">{item.activityName}</h4>
                            <p className="text-sm text-orange-600 font-medium">
                              {new Date(item.date).toLocaleDateString()}
                            </p>
                          </div>
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            <Paperclip className="h-4 w-4" />
                          </button>
                        </div>
                        {item.notes && (
                          <p className="text-sm text-gray-600 mb-2">{item.notes}</p>
                        )}
                        <p className="text-xs text-gray-500">
                          Added by {item.addedBy}
                        </p>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>

                {itineraryItems.length === 0 && (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No activities planned yet</p>
                  </div>
                )}
              </div>

              {/* Itinerary Modal */}
              {showItineraryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Activity</h2>
                    
                    <form onSubmit={addItineraryItem} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                        <input
                          type="date"
                          value={newItineraryItem.date}
                          onChange={(e) => setNewItineraryItem(prev => ({ ...prev, date: e.target.value }))}
                          min={trip.startDate}
                          max={trip.endDate}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Activity Name</label>
                        <input
                          type="text"
                          value={newItineraryItem.activityName}
                          onChange={(e) => setNewItineraryItem(prev => ({ ...prev, activityName: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          placeholder="e.g., Visit Red Fort"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                        <select
                          value={newItineraryItem.category}
                          onChange={(e) => setNewItineraryItem(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        >
                          <option value="activity">Activity</option>
                          <option value="flight">Flight</option>
                          <option value="hotel">Hotel</option>
                          <option value="food">Food</option>
                          <option value="transport">Transport</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                        <textarea
                          value={newItineraryItem.notes}
                          onChange={(e) => setNewItineraryItem(prev => ({ ...prev, notes: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          placeholder="Additional details about the activity"
                          rows={3}
                        />
                      </div>

                      <div className="flex space-x-4 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowItineraryModal(false)}
                          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-orange-500 text-white px-4 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
                        >
                          Add Activity
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripPlanningPage;