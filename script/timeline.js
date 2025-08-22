import { auth, db, collection, getDocs, getDoc, doc, query, orderBy, limit } from "./firebase.js";
import { renderTweet, scoreTweet } from "./index.js"; 

const followingContainer = document.getElementById("following1");

let followingTweetDocs = [];
let followingRenderedCount = 0;
let followingNoMore = false;
let followingLoading = false;
let followingLoadedOnce = false;
let currentStart = 0; 
let currentEnd = 30;  

export async function loadFollowingTweets(reset = false) {
  if (!auth.currentUser || followingLoading) return;
  followingLoading = true;

  if (reset) {
    followingContainer.innerHTML = "";
    followingTweetDocs = [];
    followingRenderedCount = 0;
    followingNoMore = false;
  }

  const currentUserId = auth.currentUser.uid;

  const followingSnap = await getDocs(collection(db, "users", currentUserId, "following"));
  const followedUserIds = followingSnap.docs.map(doc => doc.id);
  const followingSet = new Set(followedUserIds);

  if (followedUserIds.length === 0) {
    followingContainer.innerHTML = `<div style="display:flex;justify-content:center;margin-top:30px;opacity:0.7;"><img style="height:250px;width:250px;" src="/image/404.gif"></div><h4 style="text-align:center;">there’s nothing to see here — yet</h4>`;
    followingLoading = false;
    return;
  }

  const tweetsSnap = await getDocs(
    query(collection(db, "tweets"), orderBy("createdAt", "desc"), limit(200))
  );

  const filtered = tweetsSnap.docs.filter(doc => followingSet.has(doc.data().uid));

  followingTweetDocs = filtered
    .map(docSnap => {
      const data = docSnap.data();
      const score = scoreTweet(data, followingSet);
      return { docSnap, score, uid: data.uid, text: data.text };
    })
    .sort((a, b) => b.score - a.score);

  console.table(followingTweetDocs.map(t => ({
    id: t.docSnap.id,
    uid: t.uid,
    text: t.text?.slice(0, 30), 
    score: t.score
  })));

  followingTweetDocs = followingTweetDocs.map(item => item.docSnap);

  await renderMoreFollowingTweets();
  followingLoading = false;
}

export async function renderMoreFollowingTweets() {
  const next = followingTweetDocs.slice(followingRenderedCount, followingRenderedCount + 30);

  for (const docSnap of next) {
    const tweet = docSnap.data();

    const userDoc = await getDoc(doc(db, "users", tweet.uid));
    const user = userDoc.exists() ? {
      ...userDoc.data(),
      uid: tweet.uid
    } : {
      uid: tweet.uid
    };
    try {
      await renderTweet(tweet, docSnap.id, user, "append", followingContainer);
    } catch (err) {
      console.error("[FOLLOWING] renderTweet error:", err);
    }
  }

  followingRenderedCount += next.length;

  if (followingRenderedCount >= followingTweetDocs.length) {
    followingNoMore = true;
  }
}

followingContainer.addEventListener("scroll", () => {
  if (followingNoMore || followingLoading) return;
  const tweets = followingContainer.querySelectorAll(".tweet");
  if (!tweets.length) return;

  const trigger = tweets[25];
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom >= 0) {
      renderTweetWindow(currentStart + 30);
    }
  }

  const first = tweets[0];
  if (first) {
    const rect = first.getBoundingClientRect();
    if (rect.top >= 0 && currentStart >= 30) {
      renderTweetWindow(currentStart - 30);
    }
  }
});

async function renderTweetWindow(startIndex) {
  if (startIndex < 0) startIndex = 0;
  if (startIndex >= followingTweetDocs.length) return;

  const endIndex = Math.min(startIndex + 30, followingTweetDocs.length);

  followingContainer.innerHTML = "";

  const windowDocs = followingTweetDocs.slice(startIndex, endIndex);

  for (const docSnap of windowDocs) {
    const tweet = docSnap.data();
    const userDoc = await getDoc(doc(db, "users", tweet.uid));
    const user = userDoc.exists() ? { ...userDoc.data(), uid: tweet.uid } : { uid: tweet.uid };
    try {
      await renderTweet(tweet, docSnap.id, user, "append", followingContainer);
    } catch (err) {
      console.error("[FOLLOWING] renderTweet error:", err);
    }
  }

  currentStart = startIndex;
  currentEnd = endIndex;
}
