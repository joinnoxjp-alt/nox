const INITIAL_COUNT = 3;
const STORAGE_KEY = "noxiaAuditionApplicationClickCount";
const firebaseConfig = {
  apiKey: "AIzaSyAVUp3GMTtztLmac0e1XFCPYCPsapSL8QI",
  authDomain: "noxapp-29171.firebaseapp.com",
  projectId: "noxapp-29171",
  storageBucket: "noxapp-29171.firebasestorage.app",
  messagingSenderId: "783884878920",
  appId: "1:783884878920:web:37a4c9f0c55b404a28c47d"
};

const countElement = document.querySelector("#applicationCount");
const applyButtons = document.querySelectorAll("[data-audition-apply]");
const storedCount = Number.parseInt(localStorage.getItem(STORAGE_KEY) || "", 10);
let displayedCount = Number.isFinite(storedCount) ? Math.max(INITIAL_COUNT, storedCount) : INITIAL_COUNT;
let hasInteracted = false;
let firestoreApi = null;
let db = null;
let counterRef = null;

const renderCount = (count, animate = false) => {
  displayedCount = Math.max(INITIAL_COUNT, Number(count) || INITIAL_COUNT);
  countElement.textContent = String(displayedCount);
  localStorage.setItem(STORAGE_KEY, String(displayedCount));
  if (!animate) return;
  countElement.classList.remove("is-updated");
  requestAnimationFrame(() => countElement.classList.add("is-updated"));
};

renderCount(displayedCount);

const saveGlobalIncrement = async () => {
  if (!firestoreApi || !db || !counterRef) return;
  try {
    const savedCount = await firestoreApi.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const current = snapshot.exists()
        ? Math.max(INITIAL_COUNT, Number(snapshot.data().applicationClickCount) || INITIAL_COUNT)
        : INITIAL_COUNT;
      const next = current + 1;
      transaction.set(counterRef, { applicationClickCount: next });
      return next;
    });
    renderCount(savedCount);
  } catch {
    // The optimistic/local count stays visible. Never block Instagram.
  }
};

// The Instagram links are never prevented or delayed by counter processing.
applyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    hasInteracted = true;
    renderCount(displayedCount + 1, true);
    void saveGlobalIncrement();
  });
});

// Firebase is loaded after the working local counter is installed. If the SDK,
// network, read, or write fails, counting and the application links still work.
Promise.all([
  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
]).then(async ([appApi, storeApi]) => {
  const app = appApi.getApps()[0] || appApi.initializeApp(firebaseConfig);
  firestoreApi = storeApi;
  db = storeApi.getFirestore(app);
  counterRef = storeApi.doc(db, "noxiaStats", "audition");
  const snapshot = await storeApi.getDoc(counterRef);
  if (!hasInteracted && snapshot.exists()) {
    renderCount(snapshot.data().applicationClickCount);
  }
}).catch(() => {});
