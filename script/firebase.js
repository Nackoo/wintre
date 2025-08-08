import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, serverTimestamp, getDocs, getCountFromServer, updateDoc, increment, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "SUPABASE_URL"; 
const SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY";    
const MAX_FILE_BYTES = 20 * 1024 * 1024; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "AUTH_DOMAIN,
  projectId: "PROJECT_ID",
  storageBucket: "STORAGE_BUCKET",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID",
  measurementId: "MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { createClient, SUPABASE_URL, SUPABASE_ANON_KEY, MAX_FILE_BYTES, supabase };
export { app, increment, auth, db, storage, initializeApp, getAuth, onAuthStateChanged, getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, startAfter, writeBatch, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, getStorage, ref, uploadBytes, getDownloadURL, updateDoc, signOut }; 
