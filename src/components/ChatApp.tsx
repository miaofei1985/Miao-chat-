import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, 
  Phone, 
  Video, 
  MoreVertical, 
  Send, 
  ArrowLeft, 
  Search, 
  User as UserIcon,
  Paperclip,
  Smile,
  Mic,
  LogOut,
  Camera
} from 'lucide-react';
import { User, signOut, updateProfile } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  orderBy, 
  doc, 
  getDocs, 
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebase';
import ReactPlayer from 'react-player';

const Player = ReactPlayer as any;

interface ChatAppProps {
  currentUser: User;
}

interface ChatUser {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  isOnline: boolean;
  lastSeen: any;
}

interface ChatRoom {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageTime?: any;
  updatedAt: any;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
}

export default function ChatApp({ currentUser }: ChatAppProps) {
  const [activeChat, setActiveChat] = useState<ChatRoom | null>(null);
  const [activeContact, setActiveContact] = useState<ChatUser | null>(null);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Profile State
  const [activeTab, setActiveTab] = useState<'chats' | 'profile'>('chats');
  const [editName, setEditName] = useState(currentUser.displayName || '');
  const [editPhotoUrl, setEditPhotoUrl] = useState(currentUser.photoURL || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch all users except current user
  useEffect(() => {
    const q = query(collection(db, 'users'), where('uid', '!=', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData: ChatUser[] = [];
      snapshot.forEach((doc) => {
        usersData.push(doc.data() as ChatUser);
      });
      setUsers(usersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Fetch user's chats
  useEffect(() => {
    const q = query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', currentUser.uid),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsData: ChatRoom[] = [];
      snapshot.forEach((doc) => {
        chatsData.push({ id: doc.id, ...doc.data() } as ChatRoom);
      });
      setChats(chatsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Fetch messages for active chat
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, `chats/${activeChat.id}/messages`),
      orderBy('createdAt', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${activeChat.id}/messages`);
    });

    return () => unsubscribe();
  }, [activeChat]);

  const handleStartChat = async (user: ChatUser) => {
    // Check if chat already exists
    const existingChat = chats.find(c => c.participants.includes(user.uid));
    
    if (existingChat) {
      setActiveChat(existingChat);
      setActiveContact(user);
    } else {
      // Create new chat
      try {
        const chatRef = await addDoc(collection(db, 'chats'), {
          participants: [currentUser.uid, user.uid],
          updatedAt: serverTimestamp()
        });
        const newChat = { id: chatRef.id, participants: [currentUser.uid, user.uid], updatedAt: new Date() };
        setActiveChat(newChat);
        setActiveContact(user);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'chats');
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    const text = inputText.trim();
    setInputText('');

    try {
      // Add message
      await addDoc(collection(db, `chats/${activeChat.id}/messages`), {
        text,
        senderId: currentUser.uid,
        createdAt: serverTimestamp()
      });

      // Update chat last message
      await updateDoc(doc(db, 'chats', activeChat.id), {
        lastMessage: text,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setProfileMessage({ type: '', text: '' });

    try {
      const fileExt = file.name.split('.').pop();
      const imageRef = storageRef(storage, `profiles/${currentUser.uid}/avatar_${Date.now()}.${fileExt}`);
      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);

      setEditPhotoUrl(downloadURL);
      setProfileMessage({ type: 'success', text: 'Image uploaded! Click Save Changes to apply.' });
    } catch (error) {
      console.error('Error uploading image:', error);
      setProfileMessage({ type: 'error', text: 'Failed to upload image.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage({ type: '', text: '' });
    try {
      await updateProfile(currentUser, {
        displayName: editName,
        photoURL: editPhotoUrl
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: editName,
        photoURL: editPhotoUrl
      });
      setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
      setProfileMessage({ type: 'error', text: 'Failed to update profile.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageContent = (text: string, isMe: boolean) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        // Check if it's a direct video link or a supported platform
        const isVideo = Player.canPlay(part) || part.match(/\.(mp4|webm|ogg)$/i);
        
        if (isVideo) {
          return (
            <div key={i} className="my-2 rounded-lg overflow-hidden bg-black/5">
              <div className="relative pt-[56.25%] w-full max-w-[280px] sm:max-w-[320px]">
                <Player 
                  url={part} 
                  width="100%" 
                  height="100%" 
                  controls 
                  className="absolute top-0 left-0"
                />
              </div>
              <a 
                href={part} 
                target="_blank" 
                rel="noopener noreferrer" 
                className={`text-xs underline break-all mt-1 block ${isMe ? 'text-blue-100' : 'text-blue-500'}`}
              >
                {part}
              </a>
            </div>
          );
        }
        
        return (
          <a 
            key={i} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`underline break-all ${isMe ? 'text-blue-100' : 'text-blue-500'}`}
          >
            {part}
          </a>
        );
      }
      return <span key={i} className="whitespace-pre-wrap break-words">{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 relative overflow-hidden">
      {/* Main Content Area (Chats List OR Profile) */}
      <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${activeChat ? '-translate-x-full pointer-events-none' : 'translate-x-0'}`}>
        
        {activeTab === 'chats' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-white px-4 pt-12 pb-4 shadow-sm z-10 shrink-0">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center">
                  <img src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName}`} alt="Profile" className="w-8 h-8 rounded-full mr-3 object-cover" />
                  <h1 className="text-2xl font-bold text-gray-900">Chats</h1>
                </div>
              </div>
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  className="w-full bg-gray-100 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Contacts */}
            <div className="flex-1 overflow-y-auto">
              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No other users found. Open this app in another browser to chat!
                </div>
              ) : (
                users.map(user => {
                  const chat = chats.find(c => c.participants.includes(user.uid));
                  return (
                    <div 
                      key={user.uid}
                      onClick={() => handleStartChat(user)}
                      className="flex items-center px-4 py-3 hover:bg-white cursor-pointer transition-colors border-b border-gray-100"
                    >
                      <div className="relative">
                        <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt={user.displayName} className="w-12 h-12 rounded-full object-cover" />
                        {user.isOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="flex justify-between items-baseline">
                          <h3 className="font-semibold text-gray-900">{user.displayName}</h3>
                          <span className="text-xs text-gray-500">{formatTime(chat?.lastMessageTime)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <p className="text-sm text-gray-600 truncate max-w-[200px]">
                            {chat?.lastMessage || 'Click to start chatting'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Profile Header */}
            <div className="bg-white px-4 pt-12 pb-4 shadow-sm z-10 shrink-0 border-b border-gray-100">
              <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
            </div>
            {/* Profile Form */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center mb-8">
                <div 
                  className="relative group cursor-pointer" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <img 
                    src={editPhotoUrl || currentUser.photoURL || `https://ui-avatars.com/api/?name=${editName || currentUser.displayName}`} 
                    alt="Profile" 
                    className="w-24 h-24 rounded-full object-cover mb-4 border-4 border-gray-50 shadow-sm group-hover:opacity-75 transition-opacity" 
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity mb-4">
                    <Camera className="w-8 h-8 text-white drop-shadow-md" />
                  </div>
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-25 rounded-full mb-4">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <h2 className="text-xl font-semibold text-gray-800">{editName || currentUser.displayName}</h2>
                <p className="text-sm text-gray-500">{currentUser.email}</p>
              </div>
              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Photo URL</label>
                  <input 
                    type="url" 
                    value={editPhotoUrl} 
                    onChange={e => setEditPhotoUrl(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors" 
                    placeholder="https://..." 
                  />
                </div>
                {profileMessage.text && (
                  <div className={`p-3 rounded-lg text-sm ${profileMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {profileMessage.text}
                  </div>
                )}
                <button 
                  type="submit" 
                  disabled={isSavingProfile} 
                  className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
              <button 
                onClick={handleLogout} 
                className="w-full mt-6 bg-red-50 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Log Out
              </button>
            </div>
          </div>
        )}
        
        {/* Bottom Navigation */}
        <div className="bg-white border-t border-gray-200 flex justify-around py-3 pb-6 shrink-0 z-20">
          <button onClick={() => setActiveTab('chats')} className={`flex flex-col items-center transition-colors ${activeTab === 'chats' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}>
            <MessageCircle className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Chats</span>
          </button>
          <button className="flex flex-col items-center text-gray-400 hover:text-gray-600 transition-colors">
            <Phone className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Calls</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center transition-colors ${activeTab === 'profile' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}>
            <UserIcon className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Profile</span>
          </button>
        </div>
      </div>

      {/* Chat View */}
      <div className={`absolute inset-0 flex flex-col bg-gray-50 transition-transform duration-300 ease-in-out ${activeChat ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}>
        {/* Chat Header */}
        <div className="bg-white px-4 pt-12 pb-3 shadow-sm flex items-center justify-between z-10">
          <div className="flex items-center">
            <button 
              onClick={() => {setActiveChat(null); setActiveContact(null);}}
              className="mr-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            {activeContact && (
              <div className="flex items-center">
                <img src={activeContact.photoURL || `https://ui-avatars.com/api/?name=${activeContact.displayName}`} alt={activeContact.displayName} className="w-10 h-10 rounded-full object-cover" />
                <div className="ml-3">
                  <h2 className="font-semibold text-gray-900 leading-tight">{activeContact.displayName}</h2>
                  <p className="text-xs text-green-500">{activeContact.isOnline ? 'Online' : 'Offline'}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
              <Video className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
              <Phone className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
              <div 
                key={msg.id} 
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2 shadow-sm ${
                    isMe 
                      ? 'bg-blue-500 text-white rounded-tr-sm' 
                      : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                  }`}
                >
                  <div className="text-[15px] leading-relaxed w-full overflow-hidden">
                    {renderMessageContent(msg.text, isMe)}
                  </div>
                  <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white px-4 py-3 pb-6 border-t border-gray-200">
          <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
            <button type="button" className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <Paperclip className="w-6 h-6" />
            </button>
            <div className="flex-1 bg-gray-100 rounded-3xl flex items-center px-3 py-1 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all">
              <button type="button" className="p-1 text-gray-400 hover:text-gray-600">
                <Smile className="w-5 h-5" />
              </button>
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message..." 
                className="flex-1 bg-transparent py-2 px-2 focus:outline-none text-gray-800"
              />
              {!inputText.trim() && (
                <button type="button" className="p-1 text-gray-400 hover:text-gray-600">
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </div>
            {inputText.trim() ? (
              <button 
                type="submit" 
                className="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-sm transform active:scale-95"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
