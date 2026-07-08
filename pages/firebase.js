import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAVUp3GMTtztLmac0e1XFCPYCPsapSL8QI",
  authDomain: "noxapp-29171.firebaseapp.com",
  projectId: "noxapp-29171",
  storageBucket: "noxapp-29171.firebasestorage.app",
  messagingSenderId: "783884878920",
  appId: "1:783884878920:web:37a4c9f0c55b404a28c47d",
  measurementId: "G-9DLCRXT98Y"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
