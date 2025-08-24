import { db, collection, query, orderBy, limit, startAfter, onSnapshot, doc, getDoc, auth, getDocs } from "./firebase.js";
import { renderTweet } from "./index.js";

export async function extractMentions(text) {
  const results = [];
  const mentionMatches = text.match(/@\w+/g);
  if (!mentionMatches) return results;

  const uniqueHandles = [...new Set(mentionMatches.map(m => m.slice(1)))];
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const uid = docSnap.id;
    const cleanDisplayName = (data.displayName || "").replace(/\s+/g, ".");
    if (uniqueHandles.includes(cleanDisplayName)) {
      results.push({
        uid,
        displayName: cleanDisplayName
      });
    }
  }

  return results;
}

let mentionedLoadedOnce = false;
let mentionedLastDoc = null;
let mentionedTweetIds = new Set();
let mentionedObserver = null;

const MENTION_BATCH_SIZE = 30;

async function loadMentionedTweets(container) {
  const user = auth.currentUser;
  if (!user) return;

  const mentionedRef = collection(db, "users", user.uid, "mentioned");
  const q = mentionedLastDoc ?
    query(mentionedRef, orderBy("mentionedAt", "desc"), startAfter(mentionedLastDoc), limit(MENTION_BATCH_SIZE)) :
    query(mentionedRef, orderBy("mentionedAt", "desc"), limit(MENTION_BATCH_SIZE));

  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  mentionedLastDoc = snapshot.docs[snapshot.docs.length - 1];

  for (const docSnap of snapshot.docs) {
    const tweetId = docSnap.id;
    mentionedTweetIds.add(tweetId);

    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (tweetDoc.exists()) {
      const tweetData = tweetDoc.data();
      await renderTweet(tweetData, tweetId, user, "append", container);
    }
  }
}

function setupMentionScrollPagination(container) {
  const observerOptions = {
    root: container,
    rootMargin: "0px",
    threshold: 1.0
  };

  if (mentionedObserver) mentionedObserver.disconnect();

  mentionedObserver = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        await loadMentionedTweets(container);
      }
    }
  }, observerOptions);

  const tweets = container.querySelectorAll(".tweet");
  const lastTweet = tweets[tweets.length - 6];
  if (lastTweet) mentionedObserver.observe(lastTweet);
}

document.querySelectorAll(".tab2").forEach(tab => {
  tab.addEventListener("click", async () => {
    document.querySelectorAll(".tab2").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const targetId = tab.dataset.target;
    const otherId = targetId === "youList" ? "mentionedList" : "youList";
    document.getElementById(targetId).classList.remove("hidden");
    document.getElementById(otherId).classList.add("hidden");

    const youLoadMore = document.getElementById("youLoadMore");
    if (targetId === "youList") {
      youLoadMore.classList.remove("hidden");
    } else {
      youLoadMore.classList.add("hidden");
    }

    if (targetId === "mentionedList" && !mentionedLoadedOnce) {
      mentionedLoadedOnce = true;
      const container = document.getElementById("mentionedList");

      await loadMentionedTweets(container);

      if (!container.querySelector(".tweet")) {
        container.innerHTML = `<p style="text-align:center; color:grey;">No data</p>`;
      }

      setupMentionScrollPagination(container);

      const user = auth.currentUser;
      const mentionedRef = collection(db, "users", user.uid, "mentioned");

      onSnapshot(mentionedRef, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
          const tweetId = change.doc.id;

          if (change.type === "added" && !mentionedTweetIds.has(tweetId)) {
            const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
            if (tweetDoc.exists()) {
              const tweetData = tweetDoc.data();
              mentionedTweetIds.add(tweetId);
              await renderTweet(tweetData, tweetId, user, "prepend", container);
            }
          }

          if (change.type === "removed") {
            const el = container.querySelector(`#tweet-${tweetId}`);
            if (el) el.remove();
            mentionedTweetIds.delete(tweetId);
          }
        }
      });
    }
  });
});