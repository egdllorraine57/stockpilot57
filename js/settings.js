// /js/settings.js

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const { db, auth } = window._firebase;

  const role = sessionStorage.getItem("userRole") || "defaut";
  const name = sessionStorage.getItem("userName") || "";
  const currentUserEmail = sessionStorage.getItem("userEmail") || "";
  window.currentUserEmail = currentUserEmail;

  // Menu déroulant
  const userMenuToggle = document.getElementById("userMenuToggle");
  const userMenuDropdown = document.getElementById("userMenuDropdown");

  // Modales (utilisateur / affaire / mot de passe)
  const userModalBackdrop = document.getElementById("userModalBackdrop");
  const userForm = document.getElementById("userForm");
  const inputUserName = document.getElementById("u_name");
  const selectUserRole = document.getElementById("u_role");
  const btnUserCancel = document.getElementById("btnUserCancel");

  const affaireModalBackdrop = document.getElementById("affaireModalBackdrop");
  const affaireForm = document.getElementById("affaireForm");
  const inputAffCode = document.getElementById("a_code");
  const inputAffLibelle = document.getElementById("a_libelle");
  const btnAffCancel = document.getElementById("btnAffCancel");

  const pwdModalBackdrop = document.getElementById("pwdModalBackdrop");
  const pwdForm = document.getElementById("pwdForm");
  const inputPwdOld = document.getElementById("pwd_old");
  const inputPwdNew = document.getElementById("pwd_new");
  const inputPwdConfirm = document.getElementById("pwd_confirm");
  const btnPwdCancel = document.getElementById("btnPwdCancel");

  // =========================
  // MENU UTILISATEUR
  // =========================
  function buildUserMenu() {
    if (!userMenuDropdown) return;
    userMenuDropdown.innerHTML = "";

    if (role === "admin") {
      // 1. Création utilisateur
      const btnUsers = document.createElement("button");
      btnUsers.className = "user-menu-item";
      btnUsers.textContent = "Créer un utilisateur";
      btnUsers.addEventListener("click", () => {
        closeMenu();
        openUserModal();
      });
      userMenuDropdown.appendChild(btnUsers);

      // 2. Supprimer un utilisateur
      const btnDeleteUser = document.createElement("button");
      btnDeleteUser.className = "user-menu-item";
      btnDeleteUser.textContent = "Supprimer un utilisateur";
      btnDeleteUser.addEventListener("click", () => {
        closeMenu();
        deleteUserPrompt();
      });
      userMenuDropdown.appendChild(btnDeleteUser);
    } else {
      // Cas utilisateur "defaut"
      const btnPwd = document.createElement("button");
      btnPwd.className = "user-menu-item";
      btnPwd.textContent = "Modifier mon mot de passe";
      btnPwd.addEventListener("click", async () => {
        closeMenu();
        if (!currentUserEmail) {
          alert("Adresse email introuvable pour cet utilisateur.");
          return;
        }
        try {
          await sendPasswordResetEmail(auth, currentUserEmail);
          alert("Un email de réinitialisation de mot de passe vous a été envoyé.");
        } catch (e) {
          console.error(e);
          alert("Erreur lors de l'envoi de l'email de réinitialisation.");
        }
      });
      userMenuDropdown.appendChild(btnPwd);
    }

    // Déconnexion pour tous
    const btnLogout = document.createElement("button");
    btnLogout.className = "user-menu-item";
    btnLogout.textContent = "Déconnexion";
    btnLogout.addEventListener("click", async () => {
      closeMenu();
      try {
        await signOut(auth);
      } catch (e) {
        console.error("Erreur signOut", e);
      }
      sessionStorage.clear();
      window.location.href = "index.html";
    });
    userMenuDropdown.appendChild(btnLogout);
  }

  function openMenu() {
    if (userMenuDropdown) userMenuDropdown.classList.add("open");
  }
  function closeMenu() {
    if (userMenuDropdown) userMenuDropdown.classList.remove("open");
  }

  if (userMenuToggle && userMenuDropdown) {
    userMenuToggle.addEventListener("click", () => {
      if (userMenuDropdown.classList.contains("open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    document.addEventListener("click", (e) => {
      if (!userMenuToggle.contains(e.target) && !userMenuDropdown.contains(e.target)) {
        closeMenu();
      }
    });
  }

  // =========================
  // MODALE UTILISATEUR (ADMIN)
  // =========================
  function openUserModal() {
    if (role !== "admin" || !userForm || !userModalBackdrop) return;
    userForm.reset();
    if (selectUserRole) selectUserRole.value = "defaut";
    userModalBackdrop.classList.add("open");
    if (inputUserName) inputUserName.focus();
  }

  function closeUserModal() {
    if (userModalBackdrop) userModalBackdrop.classList.remove("open");
  }

  if (userForm) {
    userForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (role !== "admin") return;

      const nameNew = (inputUserName?.value || "").trim();
      const roleNew = selectUserRole?.value || "defaut";
      if (!nameNew) return;

      const emailNew = prompt("Email de l'utilisateur (il faudra créer ce compte dans Authentication) :");
      if (!emailNew) return;

      await addDoc(collection(db, "users"), {
        name: nameNew,
        email: emailNew,
        role: roleNew
      });

      closeUserModal();
      alert("Utilisateur créé côté Firestore. Pensez à créer/modifier le compte dans Authentication et éventuellement lui envoyer un email de réinitialisation.");
    });
  }

  if (btnUserCancel) {
    btnUserCancel.addEventListener("click", (e) => {
      e.preventDefault();
      closeUserModal();
    });
  }

  const userModalClose = document.getElementById("userModalClose");
  if (userModalClose) {
    userModalClose.addEventListener("click", () => {
      closeUserModal();
    });
  }

  if (userModalBackdrop) {
    userModalBackdrop.addEventListener("click", (e) => {
      if (e.target === userModalBackdrop) closeUserModal();
    });
  }

  // Suppression utilisateur (Firestore)
  async function deleteUserPrompt() {
    if (role !== "admin") return;
    const target = prompt("Nom (name) de l'utilisateur à supprimer :");
    if (!target) return;

    const q = query(collection(db, "users"), where("name", "==", target));
    const snap = await getDocs(q);

    if (snap.empty) {
      alert("Utilisateur non trouvé.");
      return;
    }

    const ok = confirm(`Supprimer l'utilisateur ${target} côté Firestore ?`);
    if (!ok) return;

    await deleteDoc(snap.docs[0].ref);
    alert("Utilisateur supprimé de Firestore. Pensez à le supprimer aussi dans Authentication si nécessaire.");
  }

  // =========================
  // MODALE AFFAIRE (ADMIN)
  // =========================
  let currentAffaireId = null; // null = création, sinon update

  function openAffaireModal() {
    if (role !== "admin" || !affaireForm || !affaireModalBackdrop) return;
    affaireForm.reset();
    currentAffaireId = null;
    affaireModalBackdrop.classList.add("open");
    if (inputAffCode) inputAffCode.focus();
  }

  function closeAffaireModal() {
    if (affaireModalBackdrop) affaireModalBackdrop.classList.remove("open");
  }

  if (affaireForm) {
    affaireForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (role !== "admin") return;

      const code = (inputAffCode?.value || "").trim();
      const libelle = (inputAffLibelle?.value || "").trim();
      if (!code) return;

      // Vérif code unique pour création OU changement de code
      const qCode = query(collection(db, "affaires"), where("code", "==", code));
      const snap = await getDocs(qCode);

      if (!snap.empty) {
        const conflit = snap.docs[0];
        if (!currentAffaireId || conflit.id !== currentAffaireId) {
          alert("Ce code affaire existe déjà.");
          return;
        }
      }

      if (!currentAffaireId) {
        // Création
        await addDoc(collection(db, "affaires"), {
          code,
          libelle,
          statut: "futur",
          dateCreation: new Date()
        });
        alert("Affaire créée avec statut 'futur'.");
      } else {
        // Mise à jour
        await updateDoc(doc(db, "affaires", currentAffaireId), {
          code,
          libelle
        });
        alert("Affaire mise à jour.");
      }

      closeAffaireModal();

      // Rechargement éventuel de l'onglet Affaires
      if (window.affairesModule && typeof window.affairesModule.chargerAffaires === "function") {
        window.affairesModule.chargerAffaires();
      }
    });
  }

  if (btnAffCancel) {
    btnAffCancel.addEventListener("click", (e) => {
      e.preventDefault();
      closeAffaireModal();
    });
  }

  const affaireModalClose = document.getElementById("affaireModalClose");
  if (affaireModalClose) {
    affaireModalClose.addEventListener("click", () => {
      closeAffaireModal();
    });
  }

  if (affaireModalBackdrop) {
    affaireModalBackdrop.addEventListener("click", (e) => {
      if (e.target === affaireModalBackdrop) closeAffaireModal();
    });
  }

  // Exposé pour l'onglet Affaires
  window.openAffaireModalFromAffaires = function (affaire) {
    if (role !== "admin") return;
    if (!affaireForm || !affaireModalBackdrop) return;

    affaireForm.reset();
    if (affaire && affaire.id) {
      currentAffaireId = affaire.id;
      if (inputAffCode) inputAffCode.value = affaire.code || "";
      if (inputAffLibelle) inputAffLibelle.value = affaire.libelle || "";
    } else {
      currentAffaireId = null;
      if (inputAffCode) inputAffCode.value = "";
      if (inputAffLibelle) inputAffLibelle.value = "";
    }
    affaireModalBackdrop.classList.add("open");
    if (inputAffCode) inputAffCode.focus();
  };

  // =========================
  // MODALE MOT DE PASSE (non utilisée pour le moment)
  // =========================
  if (pwdForm) {
    pwdForm.addEventListener("submit", (e) => {
      e.preventDefault();
      alert("La modification du mot de passe est gérée par l'email de réinitialisation dans le menu.");
    });
  }

  if (btnPwdCancel) {
    btnPwdCancel.addEventListener("click", (e) => {
      e.preventDefault();
      if (pwdModalBackdrop) pwdModalBackdrop.classList.remove("open");
    });
  }

  const pwdModalClose = document.getElementById("pwdModalClose");
  if (pwdModalClose) {
    pwdModalClose.addEventListener("click", () => {
      if (pwdModalBackdrop) pwdModalBackdrop.classList.remove("open");
    });
  }

  if (pwdModalBackdrop) {
    pwdModalBackdrop.addEventListener("click", (e) => {
      if (e.target === pwdModalBackdrop) pwdModalBackdrop.classList.remove("open");
    });
  }

  // =========================
  // INIT
  // =========================
  buildUserMenu();

  // Tri générique des tableaux
  function makeTableSortable(table, columnTypes) {
    if (!table) return;
    const thead = table.querySelector("thead");
    if (!thead) return;

    const ths = Array.from(thead.querySelectorAll("th"));
    ths.forEach((th, colIndex) => {
      th.style.cursor = "pointer";
      th.dataset.sortDir = "none"; // none | asc | desc

      let iconSpan = th.querySelector(".sort-icon");
      if (!iconSpan) {
        iconSpan = document.createElement("span");
        iconSpan.className = "sort-icon";
        iconSpan.style.marginLeft = "4px";
        th.appendChild(iconSpan);
      }

      const updateIcon = () => {
        const dir = th.dataset.sortDir;
        if (dir === "asc") iconSpan.textContent = "▲";
        else if (dir === "desc") iconSpan.textContent = "▼";
        else iconSpan.textContent = "";
      };

      updateIcon();

      th.addEventListener("click", () => {
        const current = th.dataset.sortDir;
        const newDir = current === "asc" ? "desc" : "asc";

        ths.forEach((h) => {
          if (h !== th) {
            h.dataset.sortDir = "none";
            const icon = h.querySelector(".sort-icon");
            if (icon) icon.textContent = "";
          }
        });

        th.dataset.sortDir = newDir;
        updateIcon();

        const tbody = table.querySelector("tbody");
        const rows = Array.from(tbody.querySelectorAll("tr"));
        const type = columnTypes[colIndex] || "string";

        rows.sort((a, b) => {
          const aText = a.cells[colIndex]?.textContent.trim() || "";
          const bText = b.cells[colIndex]?.textContent.trim() || "";
          let cmp = 0;

          if (type === "number") {
            const aNum = parseFloat(aText.replace(/\s/g, "").replace(",", "."));
            const bNum = parseFloat(bText.replace(/\s/g, "").replace(",", "."));
            cmp = (aNum || 0) - (bNum || 0);
          } else if (type === "date") {
            const aTime = Date.parse(aText.split("/").reverse().join("-")) || 0;
            const bTime = Date.parse(bText.split("/").reverse().join("-")) || 0;
            cmp = aTime - bTime;
          } else {
            cmp = aText.localeCompare(bText, "fr", { sensitivity: "base" });
          }

          return newDir === "asc" ? cmp : -cmp;
        });

        rows.forEach((r) => tbody.appendChild(r));
      });
    });
  }

  window.makeTableSortable = makeTableSortable;
});
