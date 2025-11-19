// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCS6oZ51Ew3KD663R693NR_l21x_aF7kTk",
  authDomain: "mini-app-3e9e3.firebaseapp.com",
  projectId: "mini-app-3e9e3",
  storageBucket: "mini-app-3e9e3.appspot.com",
  messagingSenderId: "91549594192",
  appId: "1:91549594192:web:d65c3555bc4f87f50c1755",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
