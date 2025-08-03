import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA9aK-CsTxEuchCnG1EdK7up6euuywlfDE",
  authDomain: "wintre-f5b48.firebaseapp.com",
  projectId: "wintre-f5b48",
  storageBucket: "wintre-f5b48.appspot.com",
  messagingSenderId: "1065805239288",
  appId: "1:1065805239288:web:16ab89d1074ba2b57dfc0d",
  measurementId: "G-5PN0K7V2CP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, increment, auth, db, storage, initializeApp, getAuth, onAuthStateChanged, getFirestore, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, getStorage, ref, uploadBytes, getDownloadURL, updateDoc, signOut }; 
