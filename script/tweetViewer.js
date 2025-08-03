import {
  auth,
  db,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  getCountFromServer,
  increment,
  updateDoc
} from "./firebase.js";

import {
  renderTweet
} from "./index.js";

export async function viewTweet(tweetId) {
  const overlay = document.getElementById("tweetViewer");
  const userBox = overlay.querySelector(".user-box1");
  userBox.innerHTML = "";
  overlay.classList.remove("hidden");
  document.body.classList.add('no-scroll');
  document.getElementById('tweetViewer').classList.add('hidden');

  await loadTweetRecursive(tweetId, userBox);
}

async function loadTweetRecursive(tweetId, container) {
  const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
  if (!tweetDoc.exists()) return null;
  const tweetData = tweetDoc.data();

  const tweetDiv = document.createElement("div");
  tweetDiv.className = "tweet-box";
  tweetDiv.dataset.id = tweetId;
  tweetDiv.innerHTML = `<p style="color:gray">Rendering tweet...</p>`;
  container.appendChild(tweetDiv);

  await renderTweet(tweetData, tweetId, auth.currentUser, "replace", tweetDiv);

  if (tweetData.originalTweetId) {
    const originalContainer = document.createElement("div");
    originalContainer.className = "tweet-box original-chain";
    tweetDiv.appendChild(originalContainer);
    await loadTweetRecursive(tweetData.originalTweetId, originalContainer);
  }

  return tweetData;
}

document.body.addEventListener("click", async (e) => {
  const link = e.target.closest(".original-tweet-link");
  if (!link) return;

  e.preventDefault();

  const tweetId = link.dataset.id;
  const tweetViewer = document.getElementById("tweetViewer");
  const box = tweetViewer.querySelector("#appendTweet");

  box.innerHTML = "";
  tweetViewer.classList.remove("hidden");
  document.body.classList.add("no-scroll");

  const tweetRef = doc(db, "tweets", tweetId);
  const tweetSnap = await getDoc(tweetRef);

  if (!tweetSnap.exists()) {
    box.innerHTML = "<p>Tweet not found.</p>";
    return;
  }

  const tweetData = tweetSnap.data();

  await renderTweet(tweetData, tweetId, auth.currentUser, "append", box);
});
