import { db, auth, deleteDoc, collection, doc, getDoc, getDocs, orderBy, limit, startAfter, query, onSnapshot } from './firebase.js';
import { renderTweet } from './index.js';

const userOverlay = document.getElementById('bookmarkOverlay');
const bookmarkList = document.getElementById("bookmarkList");
const loadMoreBtn = document.getElementById('bookmarkLoadMore');

let lastDoc = null;
let loading = false;
let noMore = false;
let bookmarksLoadedOnce = false; 

async function loadBookmarks(initial = false) {
  if (!auth.currentUser || loading || noMore) {
    console.log("Load blocked: ", { currentUser: auth.currentUser, loading, noMore });
    return;
  }
  if (bookmarksLoadedOnce && initial) { 
    console.log("Bookmarks already loaded, skipping.");
    return;
  }

  loading = true;
  const uid = auth.currentUser.uid;
  const likesRef = collection(db, 'users', uid, 'bookmarks');

  let q = query(likesRef, orderBy('bookmarkedAt', 'desc'), limit(10)); 
  if (lastDoc && !initial) {
    q = query(likesRef, orderBy('bookmarkedAt', 'desc'), startAfter(lastDoc), limit(10));
  }

  const snap = await getDocs(q);
  if (snap.empty && initial) {
    bookmarkList.innerHTML = `<div style="display:flex;justify-content:center;margin-top:30px;opacity:0.7;"><img style="height:250px;width:250px;" src="/image/404.gif"></div><h4 style="text-align:center;">there’s nothing to see here — yet</h4>`;
    loadMoreBtn.style.display = "none";
    loading = false;
    return;
  }

  if (snap.empty) {
    noMore = true;
    loadMoreBtn.style.display = "none";
    return;
  }

  lastDoc = snap.docs[snap.docs.length - 1];

  for (const docSnap of snap.docs) {
    const tweetId = docSnap.id;
    const tweetRef = doc(db, 'tweets', tweetId);
    const tweetSnap = await getDoc(tweetRef);

    if (tweetSnap.exists()) {
      const tweetData = tweetSnap.data();
      await renderTweet(tweetData, tweetId, auth.currentUser, 'append', bookmarkList);
    } else {
      const deletedBox = document.createElement("div");
      deletedBox.className = "tweet deleted";
      deletedBox.style.marginTop = '15px';
      deletedBox.style.display = 'flex';
      deletedBox.style.justifyContent = 'space-between';
      deletedBox.style.alignItems = 'center';
      deletedBox.innerHTML = `
        <i style="color:gray;">This Wynt is unavailable</i>
        <img src="/image/trash.svg" alt="Remove" style="width: 20px; height: 20px; cursor: pointer; margin-left: 10px;">
      `;
      const trashIcon = deletedBox.querySelector('img');
      trashIcon.addEventListener('click', async () => {
        try {
          await deleteDoc(doc(db, "users", auth.currentUser.uid, "bookmarks", tweetId));
          deletedBox.remove();
        } catch (e) {
          console.error("Error removing tweet from bookmark:", e);
        }
      });
      bookmarkList.appendChild(deletedBox);
    }
  }

  loadMoreBtn.style.display = snap.docs.length === 10 ? "block" : "none";

  if (initial) bookmarksLoadedOnce = true; 
  loading = false;
}

document.getElementById('bookmarksvg').addEventListener('click', async () => {
  if (!bookmarksLoadedOnce) { 
    bookmarkList.innerHTML = '';
    lastDoc = null;
    noMore = false;
    loadMoreBtn.style.display = 'block';
    userOverlay.classList.remove('hidden');
    await loadBookmarks(true);
  } else {
    userOverlay.classList.remove('hidden'); 
    loadBookmarks();
  }
});

loadMoreBtn.addEventListener('click', () => {
  loadBookmarks();
});