// /js/affaires.js

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const { db } = window._firebase;

const role = sessionStorage.getItem("userRole") || "defaut";
const name = sessionStorage.getItem("userName") || "";
const currentUserEmail = sessionStorage.getItem("userEmail") || "";

const tabAffaires = document.getElementById("tab-affaires");
const affairesSection = document.getElementById("affairesSection");
const searchInput = document.getElementById("affairesSearchInput");
const affairesBody = document.getElementById("affairesBody");

// Référence collection
const affairesRef = collection(db, "affaires");

// État local
let affaires = [];

// --- Gestion affichage onglets ---

function activateTab(tabId, sectionId) {
  const tabs = [
    "tab-articles",
    "tab-mouvements",
    "tab-reservations",
    "tab-preparations",
    "tab-affaires"
  ];
  const sections = [
    "articlesSection",
    "mouvementsSection",
    "reservationsSection",
    "preparationsSection",
    "affairesSection"
  ];

  tabs.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle("active", id === tabId);
  });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === sectionId ? "block" : "none";
  });
}

if (tabAffaires) {
  tabAffaires.addEventListener("click", () => {
    activateTab("tab-affaires", "affairesSection");
    chargerAffaires();
  });
}

// --- Chargement et affichage des affaires ---

async function chargerAffaires() {
  affaires = [];
  affairesBody.innerHTML = "";

  const qAff = query(affairesRef, orderBy("code"));
  const snap = await getDocs(qAff);
  snap.forEach(d => {
    const data = d.data();
    affaires.push({
      id: d.id,
      code: data.code || "",
      libelle: data.libelle || "",
      statut: data.statut || "futur",
      dateCreation: data.dateCreation
    });
  });

  renderAffaires(affaires);
}

function renderAffaires(data) {
  affairesBody.innerHTML = "";
  data.forEach(a => {
    const tr = document.createElement("tr");

    const tdCode = document.createElement("td");
    tdCode.textContent = a.code;

    const tdLib = document.createElement("td");
    tdLib.textContent = a.libelle;

    const tdStatut = document.createElement("td");
    tdStatut.textContent = a.statut;

    const tdDate = document.createElement("td");
    if (a.dateCreation && a.dateCreation.toDate) {
      tdDate.textContent = a.dateCreation.toDate().toLocaleString("fr-FR");
    } else {
      tdDate.textContent = "";
    }

    const tdActions = document.createElement("td");

    // Admin : peut changer le statut
    if (role === "admin") {
      const select = document.createElement("select");
      ["futur", "ouvert", "clos"].forEach(st => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        if (st === a.statut) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener("change", async () => {
        const newStatut = select.value;
        await updateDoc(doc(db, "affaires", a.id), { statut: newStatut });
        a.statut = newStatut;
      });
      tdActions.appendChild(select);
    } else {
      tdActions.textContent = "-";
    }

    tr.appendChild(tdCode);
    tr.appendChild(tdLib);
    tr.appendChild(tdStatut);
    tr.appendChild(tdDate);
    tr.appendChild(tdActions);

    affairesBody.appendChild(tr);
  });
}

// Filtre
if (searchInput) {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      renderAffaires(affaires);
      return;
    }
    const filtered = affaires.filter(a => {
      return (
        a.code.toLowerCase().includes(q) ||
        a.libelle.toLowerCase().includes(q) ||
        a.statut.toLowerCase().includes(q)
      );
    });
    renderAffaires(filtered);
  });
}

// --- Demande d'ouverture d'affaire (utilisateur defaut) ---

async function ouvrirModalDemandeAffaire() {
  const code = prompt("Code affaire souhaité (doit être unique) :");
  if (!code) return;
  const libelle = prompt("Libellé de l'affaire :");
  if (!libelle) return;

  // Vérifier unicité du code dans 'affaires'
  const qCode = query(affairesRef, where("code", "==", code));
  const snapCode = await getDocs(qCode);
  if (!snapCode.empty) {
    alert("Ce code affaire existe déjà. Merci de choisir un autre code.");
    return;
  }

  // Enregistrer la demande
  await addDoc(collection(db, "demandesAffaires"), {
    code,
    libelle,
    demandeurName: name,
    demandeurEmail: currentUserEmail,
    date: serverTimestamp(),
    statut: "en_attente"
  });

  alert("Demande d'ouverture d'affaire envoyée aux administrateurs.");
}

// Expose pour settings.js (cas defaut)
window.affairesModule = {
  ouvrirModalDemandeAffaire,
  chargerAffaires
};
