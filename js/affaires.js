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
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const { db } = window._firebase;

  const role = sessionStorage.getItem("userRole") || "defaut";
  const name = sessionStorage.getItem("userName") || "";
  const currentUserEmail = sessionStorage.getItem("userEmail") || "";

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
        statut: data.statut || "futur",
        dateCreation: data.dateCreation
      });
    });

    renderAffaires(affaires);
  }

  function renderAffaires(data) {
    if (!affairesBody) return;
    affairesBody.innerHTML = "";

    // réinitialiser sélection
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

      const tdDate = document.createElement("td");
      if (a.dateCreation && a.dateCreation.toDate) {
        tdDate.textContent = a.dateCreation.toDate().toLocaleString("fr-FR");
      } else {
        tdDate.textContent = "";
      }

      const tdActions = document.createElement("td");
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

      // sélection de ligne pour Edit / Delete
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

  // --- Boutons Ajouter / Modifier / Supprimer (admin uniquement) ---

  // on s'appuie sur la modale Affaire existante pilotée par settings.js.
  // settings.js doit exposer window.openAffaireModalFromAffaires(affaire|null)

  if (role === "admin") {
    if (btnAffAdd) {
      btnAffAdd.addEventListener("click", () => {
        if (typeof window.openAffaireModalFromAffaires === "function") {
          window.openAffaireModalFromAffaires(null); // création
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
          window.openAffaireModalFromAffaires(affaire); // modification
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

        // tu peux choisir : fermeture logique (statut) ou suppression physique
        // ici: suppression physique
        await deleteDoc(doc(db, "affaires", selectedAffaireId));

        await chargerAffaires();
        selectedAffaireId = null;
        if (btnAffEdit) btnAffEdit.disabled = true;
        if (btnAffDelete) btnAffDelete.disabled = true;
      });
    }
  } else {
    // rôle defaut : on masque les boutons
    if (btnAffAdd) btnAffAdd.style.display = "none";
    if (btnAffEdit) btnAffEdit.style.display = "none";
    if (btnAffDelete) btnAffDelete.style.display = "none";
  }

  // Expose quelques fonctions si besoin
  window.affairesModule = {
    chargerAffaires
  };

}); // fin DOMContentLoaded
