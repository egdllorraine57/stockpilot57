// /js/affaires.js

import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const { db } = window._firebase;

  const role = sessionStorage.getItem("userRole") || "defaut";

  const searchInput = document.getElementById("affairesSearchInput");
  const affairesBody = document.getElementById("affairesBody");

  const btnAffAdd = document.getElementById("btnAffAdd");
  const btnAffEdit = document.getElementById("btnAffEdit");
  const btnAffDelete = document.getElementById("btnAffDelete");

  const affairesRef = collection(db, "affaires");

  let affaires = [];
  let selectedAffaireId = null;

  // --- Chargement et affichage des affaires ---

  async function chargerAffaires() {
    affaires = [];
    if (affairesBody) affairesBody.innerHTML = "";

    const qAff = query(affairesRef, orderBy("code"));
    const snap = await getDocs(qAff);
    snap.forEach(d => {
      const data = d.data();
      affaires.push({
        id: d.id,
        code: data.code || "",
        libelle: data.libelle || "",
        statut: data.statut || "ouvert"  // info affichée uniquement
      });
    });

    renderAffaires(affaires);
  }

  function renderAffaires(data) {
    if (!affairesBody) return;
    affairesBody.innerHTML = "";

    selectedAffaireId = null;
    if (btnAffEdit) btnAffEdit.disabled = true;
    if (btnAffDelete) btnAffDelete.disabled = true;

    data.forEach(a => {
      const tr = document.createElement("tr");

      const tdCode = document.createElement("td");
      tdCode.textContent = a.code;

      const tdLib = document.createElement("td");
      tdLib.textContent = a.libelle;

      const tdStatut = document.createElement("td");
      tdStatut.textContent = a.statut;

      tr.appendChild(tdCode);
      tr.appendChild(tdLib);
      tr.appendChild(tdStatut);

      tr.addEventListener("click", () => {
        Array.from(affairesBody.querySelectorAll("tr")).forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
        selectedAffaireId = a.id;
        if (role === "admin") {
          if (btnAffEdit) btnAffEdit.disabled = false;
          if (btnAffDelete) btnAffDelete.disabled = false;
        }
      });

      affairesBody.appendChild(tr);
    });
  }

  // --- Filtre ---

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

  // --- Boutons Ajouter / Modifier / Supprimer (admin uniquement) ---

  // Les créations / modifs (code, libellé, statut) sont gérées dans la modale Affaire
  // via window.openAffaireModalFromAffaires exposée par settings.js

  if (role === "admin") {
    if (btnAffAdd) {
      btnAffAdd.addEventListener("click", () => {
        if (typeof window.openAffaireModalFromAffaires === "function") {
          // Création : statut géré dans la modale, mais à l'enregistrement
          // tu as prévu que la création passe en "ouvert"
          window.openAffaireModalFromAffaires(null);
        } else {
          alert("Ouverture modale affaire non câblée (openAffaireModalFromAffaires).");
        }
      });
    }

    if (btnAffEdit) {
      btnAffEdit.addEventListener("click", () => {
        if (!selectedAffaireId) {
          alert("Sélectionnez d'abord une affaire.");
          return;
        }
        const affaire = affaires.find(a => a.id === selectedAffaireId);
        if (!affaire) return;
        if (typeof window.openAffaireModalFromAffaires === "function") {
          window.openAffaireModalFromAffaires(affaire);
        } else {
          alert("Ouverture modale affaire non câblée (openAffaireModalFromAffaires).");
        }
      });
    }

    if (btnAffDelete) {
      btnAffDelete.addEventListener("click", async () => {
        if (!selectedAffaireId) {
          alert("Sélectionnez d'abord une affaire.");
          return;
        }
        const affaire = affaires.find(a => a.id === selectedAffaireId);
        if (!affaire) return;

        const ok = confirm(`Supprimer l'affaire ${affaire.code} ?`);
        if (!ok) return;

        await deleteDoc(doc(db, "affaires", selectedAffaireId));

        await chargerAffaires();
        selectedAffaireId = null;
        if (btnAffEdit) btnAffEdit.disabled = true;
        if (btnAffDelete) btnAffDelete.disabled = true;
      });
    }
  } else {
    if (btnAffAdd) btnAffAdd.style.display = "none";
    if (btnAffEdit) btnAffEdit.style.display = "none";
    if (btnAffDelete) btnAffDelete.style.display = "none";
  }

  // Expose pour rechargement après modale
  window.affairesModule = {
    chargerAffaires
  };

  // Premier chargement quand on arrive sur l’onglet
  // (l’onglet l’appelle déjà via home.html, mais ici au cas où)
  // chargerAffaires();
});
