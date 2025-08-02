import { auth, db, collection, getDocs, getDoc, doc, query, orderBy, limit, getFirestore } from "./firebase.js";
import { renderTweet } from "./index.js";

const followingContainer = document.getElementById("following1");

let followingTweetDocs = [];
let followingRenderedCount = 0;
let followingNoMore = false;
let followingLoading = false;
let followingLoadedOnce = false;

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

  if (followedUserIds.length === 0) {
    followingContainer.innerHTML = `<p style="color:gray;text-align:center;">you're not following anyone</p>`;
    followingLoading = false;
    return;
  }

  const tweetsSnap = await getDocs(query(collection(db, "tweets"), orderBy("createdAt", "desc"), limit(100)));

  followingTweetDocs = tweetsSnap.docs.filter(doc => followedUserIds.includes(doc.data().uid));

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
  if (tweets.length < 25) return;

  const trigger = tweets[24];
  const rect = trigger.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom >= 0) {
    renderMoreFollowingTweets();
  }
});
