import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  // setLogLevel is part of Firestore, not Auth, so we need to import it here:
  setLogLevel, 
  doc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';

// --- НАЧАЛО ЖЕСТКОГО КОДИРОВАНИЯ КОНФИГУРАЦИИ (ВРЕМЕННОЕ РЕШЕНИЕ) ---
// Конфигурация взята из загруженного вами изображения (image_b1e1ff.jpg)
const firebaseConfig = {
    apiKey: "AIzaSyC6zS1Ew3KD663R693NR_L21x_aF7KTk",
    authDomain: "mini-app-3e9e3.firebaseapp.com",
    projectId: "mini-app-3e9e3",
    storageBucket: "mini-app-3e9e3.appspot.com",
    messagingSenderId: "91549594192",
    appId: "1:91549594192:web:d65c3555bc4f87f59c1755",
    measurementId: "G-F9FN4T5RYL"
};
// --- КОНЕЦ ЖЕСТКОГО КОДИРОВАНИЯ ---


// Mandatory Global Variables provided by the Canvas Environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// Мы игнорируем __firebase_config, так как оно, похоже, не работает.
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The main application component
export default function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    // Enable debug logging for Firebase
    setLogLevel('debug');

    try {
      // Инициализируем приложение с жестко закодированной конфигурацией
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      // Listener for authentication state changes
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setLoading(false);
          console.log("User authenticated with UID:", user.uid);
        } else {
          // If no user, sign in using the custom token or anonymously
          try {
            if (initialAuthToken) {
              const userCredential = await signInWithCustomToken(firebaseAuth, initialAuthToken);
              setUserId(userCredential.user.uid);
            } else {
              const userCredential = await signInAnonymously(firebaseAuth);
              setUserId(userCredential.user.uid);
            }
          } catch (e) {
            console.error("Authentication Error:", e);
            setError("Ошибка аутентификации: " + e.message);
            setLoading(false);
          }
        }
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.error("Firebase Init Error:", e);
      // Это сообщение об ошибке будет показано, если даже жесткое кодирование не помогло.
      setError("Ошибка инициализации Firebase: " + e.message);
      setLoading(false);
    }
  }, []);

  // 2. Real-time Data Listener (Firestore onSnapshot)
  useEffect(() => {
    if (!db || !userId) return;

    // Path for public data: /artifacts/{appId}/public/data/messages
    const collectionPath = `artifacts/${appId}/public/data/messages`;
    const messagesCollectionRef = collection(db, collectionPath);
    
    // Create a query to order by timestamp (descending)
    // NOTE: Sorting is done client-side to avoid Firestore index errors.
    const messagesQuery = query(messagesCollectionRef);

    console.log(`Listening to collection: ${collectionPath}`);

    const unsubscribeSnapshot = onSnapshot(messagesQuery, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert timestamp to a readable date if it exists
        timestamp: doc.data().timestamp?.toDate().toLocaleString('ru-RU') || 'Н/Д'
      }));

      // Sort messages by timestamp descending (most recent first) after fetching
      newMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setMessages(newMessages);
      setLoading(false);
    }, (e) => {
      console.error("Firestore Snapshot Error:", e);
      setError("Ошибка загрузки сообщений: " + e.message);
      setLoading(false);
    });

    return () => unsubscribeSnapshot();
  }, [db, userId]);

  // 3. Function to Add a New Message
  const handleSendMessage = useCallback(async (e) => {
    e.preventDefault();
    if (!db || !userId || newMessageText.trim() === '') return;

    try {
      const collectionPath = `artifacts/${appId}/public/data/messages`;
      
      await addDoc(collection(db, collectionPath), {
        text: newMessageText.trim(),
        userId: userId,
        timestamp: serverTimestamp(),
        // Store display name if we had one, for now, just use a simplified UID
        displayName: `Пользователь ${userId.substring(0, 4)}...`, 
      });

      setNewMessageText('');
    } catch (e) {
      console.error("Error adding document: ", e);
      setError("Ошибка отправки: " + e.message);
    }
  }, [db, userId, newMessageText]);

  // UI Rendering
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <p className="text-xl text-indigo-600">Загрузка данных...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-red-100 p-8">
        <div className="text-red-700 p-4 border border-red-400 bg-red-50 rounded-lg">
          <h2 className="font-bold text-lg mb-2">Критическая ошибка</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-8">
      <header className="w-full max-w-3xl mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-2">
          Приложение для публичного обмена сообщениями
        </h1>
        <p className="text-sm text-gray-500 text-center">
          <span className="font-semibold">Ваш ID (поделитесь им с друзьями): </span>
          <span className="text-indigo-600 font-mono break-all">{userId}</span>
        </p>
        <p className="text-sm text-gray-500 text-center">
          Данные сохраняются в Firestore по пути: 
          <code className="bg-gray-200 p-1 rounded text-xs text-indigo-700">/artifacts/{appId}/public/data/messages</code>
        </p>
      </header>

      <main className="w-full max-w-3xl bg-white shadow-2xl rounded-xl p-4 sm:p-6 mb-8">
        {/* Message Input Form */}
        <form onSubmit={handleSendMessage} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Введите ваше сообщение здесь..."
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
            required
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition duration-150 ease-in-out disabled:bg-indigo-400"
            disabled={newMessageText.trim() === ''}
          >
            Отправить
          </button>
        </form>

        {/* Message List */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">
          Лента сообщений ({messages.length})
        </h2>
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center p-4">
              Пока нет публичных сообщений. Будьте первым!
            </p>
          ) : (
            messages.map((msg, index) => (
              <div
                key={msg.id}
                className={`p-4 rounded-xl shadow-sm transition duration-200 
                            ${msg.userId === userId ? 'bg-indigo-50 border-l-4 border-indigo-600 ml-4' : 'bg-gray-50 border-l-4 border-gray-300 mr-4'}`}
              >
                <div className="flex justify-between items-start">
                  <p className="font-medium text-gray-900 break-words pr-4">
                    {msg.text}
                  </p>
                  <span 
                    className={`text-xs font-mono px-2 py-1 rounded-full whitespace-nowrap 
                                ${msg.userId === userId ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-600'}`}
                    title={`Полный ID: ${msg.userId}`}
                  >
                    {msg.userId === userId ? 'Вы' : msg.displayName}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {msg.timestamp}
                </p>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
