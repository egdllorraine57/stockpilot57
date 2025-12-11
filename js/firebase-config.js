// js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMjLccscdb8v8CIQmveiy4B2V-s0OtcLo",
  authDomain: "stockpilot-v2-f420c.firebaseapp.com",
  projectId: "stockpilot-v2-f420c",
  storageBucket: "stockpilot-v2-f420c.firebasestorage.app",
  messagingSenderId: "808810823202",
  appId: "1:808810823202:web:765aefb02a5c6c5f32947b",
  measurementId: "G-YLKFRF2H8F"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// On expose sous _firebase comme dans tes autres fichiers
window._firebase = { app, db, auth };
