// /js/articles-add.js
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const { db } = window._firebase;

export async function ajouterArticle(data) {
  const docRef = await addDoc(collection(db, "articles"), data);
  return { id: docRef.id, ...data };
}

export async function modifierArticle(articleId, data) {
  const ref = doc(db, "articles", articleId);
  await updateDoc(ref, data);
  return { id: articleId, ...data };
}

export async function supprimerArticle(articleId) {
  const ref = doc(db, "articles", articleId);
  await deleteDoc(ref);
}
