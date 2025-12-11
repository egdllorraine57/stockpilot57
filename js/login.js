// /js/login.js

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const { db, auth } = window._firebase;

const form = document.getElementById("loginForm");
const msg = document.getElementById("message");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";

  const email = document.getElementById("identifiant").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    msg.textContent = "Veuillez saisir email et mot de passe.";
    return;
  }

  try {
    // 1) Authentification Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2) Récupération du rôle dans Firestore (collection users, champ email)
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const snapshot = await getDocs(q);

    let role = "defaut";
    let name = email;

    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0].data();
      role = userDoc.role || "defaut";
      name = userDoc.name || email;
    }

    // 3) Stockage en session pour le reste de l'app
    sessionStorage.setItem("userName", name);
    sessionStorage.setItem("userRole", role);
    sessionStorage.setItem("userEmail", email);

    // 4) Redirection
    window.location.href = "home.html";
  } catch (err) {
    console.error(err);
    msg.textContent = "Email ou mot de passe incorrect.";
  }
});
