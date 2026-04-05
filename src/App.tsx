/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import ChatApp from './components/ChatApp';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    // Test connection
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          setConnectionError("Please check your Firebase configuration. The client is offline.");
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      if (currentUser) {
        // Create or update user profile in Firestore
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Anonymous',
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            isOnline: true,
            lastSeen: new Date()
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setConnectionError(null);
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Error signing in with Google", error);
      setConnectionError(error.message || "Failed to sign in. Please try opening the app in a new tab.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 flex items-center justify-center sm:p-4">
        {/* Mobile device frame simulation for desktop viewing */}
        <div className="w-full h-[100dvh] sm:h-[800px] sm:max-h-[calc(100vh-2rem)] sm:w-[400px] sm:rounded-[2.5rem] sm:shadow-2xl overflow-hidden bg-white relative border-gray-800 sm:border-[12px] flex flex-col">
          {connectionError ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <p className="text-red-500 mb-4">{connectionError}</p>
              <button 
                onClick={() => setConnectionError(null)}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg"
              >
                Try Again
              </button>
            </div>
          ) : user ? (
            <ChatApp currentUser={user} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-gray-50">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to ChatApp</h1>
              <p className="text-gray-600 mb-8">Please sign in to continue</p>
              <button 
                onClick={handleLogin}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-full transition-colors flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
