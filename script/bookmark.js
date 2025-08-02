import { db, auth, deleteDoc, collection, doc, getDoc, getDocs, orderBy, limit, startAfter, query } from './firebase.js';
import { renderTweet } from './index.js';

const userOverlay = document.getElementById('bookmarkOverlay');
const bookmarkList = document.getElementById("bookmarkList");
const loadMoreBtn = document.getElementById('bookmarkLoadMore');

let lastDoc = null;
let loading = false;
let noMore = false;

async function loadBookmarks(initial = false) {
  if (!auth.currentUser || loading || noMore) {
    console.log("Load blocked: ", {
      currentUser: auth.currentUser,
      loading,
      noMore
    });
    return;
  }

  loading = true;
  const uid = auth.currentUser.uid;
  const likesRef = collection(db, 'likes', uid, 'tweets');

  console.log("Fetching liked tweets for user:", uid);

  let q = query(likesRef, orderBy('likedAt', 'desc'), limit(30));
  if (lastDoc && !initial) {
    q = query(likesRef, orderBy('likedAt', 'desc'), startAfter(lastDoc), limit(30));
  }

  const snap = await getDocs(q);
  if (snap.empty && initial) {
    bookmarkList.innerHTML = `<p style="color:gray;">Like a tweet to get started</p>`;
    loadMoreBtn.style.display = "none";
    loading = false;
    return;
  }

  console.log("Fetched liked tweet docs:", snap.docs.map(d => d.id));

  if (initial && snap.docs.length < 30) {
    loadMoreBtn.style.display = "none";
  }

  if (snap.empty) {
    console.log("No more liked tweets.");
    noMore = true;
    loadMoreBtn.style.display = "none";
    return;
  }

  lastDoc = snap.docs[snap.docs.length - 1];

  for (const docSnap of snap.docs) {
    const tweetId = docSnap.id;
    console.log("Fetching tweet data for:", tweetId);

    const tweetRef = doc(db, 'tweets', tweetId);
    const tweetSnap = await getDoc(tweetRef);

    if (tweetSnap.exists()) {
      const tweetData = tweetSnap.data();
      console.log("Rendering tweet:", tweetId);
      await renderTweet(tweetData, tweetId, auth.currentUser, 'append', bookmarkList);
    } else {
      console.warn("Wint not found:", tweetId);

      const deletedBox = document.createElement("div");
      deletedBox.className = "tweet deleted";
      deletedBox.style.marginTop = '15px';
      deletedBox.style.display = 'flex';
      deletedBox.style.justifyContent = 'space-between';
      deletedBox.style.alignItems = 'center';

      deletedBox.innerHTML = `
    <i style="color:gray;">This wint is unavailable</i>
    <img src="image/trash.svg" alt="Remove" style="width: 20px; height: 20px; cursor: pointer; margin-left: 10px;">
  `;

      const trashIcon = deletedBox.querySelector('img');
      trashIcon.addEventListener('click', async () => {
        try {
          const uid = auth.currentUser.uid;
          await deleteDoc(doc(db, 'likes', uid, 'tweets', tweetId));
          deletedBox.remove();
          console.log(`Deleted tweet ${tweetId} from likes.`);
        } catch (e) {
          console.error("Error removing tweet from likes:", e);
        }
      });

      bookmarkList.appendChild(deletedBox);
    }
  }

  loading = false;
}

document.querySelector('.smallbar img[src="image/bookmark.svg"]').addEventListener('click', async () => {
  bookmarkList.innerHTML = '';
  lastDoc = null;
  noMore = false;
  userOverlay.classList.remove('hidden');
  loadMoreBtn.style.display = 'block';
  await loadBookmarks(true);
});

loadMoreBtn.addEventListener('click', () => {
  loadBookmarks();
});
