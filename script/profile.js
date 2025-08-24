import { db, auth, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, startAfter } from "./firebase.js";
import { renderTweet } from './index.js';

const myPfp = document.getElementById("my-pfp");
const myBanner = document.getElementById("my-banner");
const myDescription = document.querySelector("#my-description");
const myName = document.querySelector("#my-name");

let unsubscribeMentioned = null;
let unsubscribeYouList = null;

document.getElementById('usersvg').addEventListener("click", async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  document.getElementById("youList").classList.remove('hidden');
  document.getElementById("my-name").dataset.uid = uid;
  document.getElementById("copyMyLinkBtn").dataset.uid = uid;
  document.getElementById("profileOverlay").classList.remove("hidden");

  const docSnap = await getDoc(doc(db, "users", uid));
  const d = docSnap.data();
  if (!docSnap.exists()) return;

  const data = docSnap.data();

  const banner = data.banner;
  const myBanner = document.getElementById("my-banner");

  if (banner) {
    myBanner.style.backgroundImage = `url('${banner}')`;
    myBanner.style.backgroundRepeat = 'no-repeat';
    myBanner.style.backgroundPosition = 'center';
    myBanner.style.backgroundSize = 'cover';
    myBanner.style.backgroundColor = 'unset';

  } else {
    myBanner.style.backgroundColor = "grey";
  }

  const avatarURL = data.photoURL || auth.currentUser.photoURL;
  const myPfp = document.getElementById("my-pfp");

  if (avatarURL) {
    myPfp.style.background = `url('${avatarURL}') no-repeat center / cover`;
  } else {
    myPfp.style.backgroundColor = "grey";
  }

  const myFollowersSnap = await getDocs(collection(db, "users", uid, "followers"));
  const myFollowingSnap = await getDocs(collection(db, "users", uid, "following"));
  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.data();
  const postCount = userData?.posts || 0;

  document.getElementById("my-posts").textContent = `${postCount}`;
  document.getElementById("my-followers").textContent = `${myFollowersSnap.size}`;
  document.getElementById("my-following").textContent = `${myFollowingSnap.size}`;

  const name = data.displayName || auth.currentUser.displayName;
  document.getElementById("my-name").textContent = name;

  const description = data.description || "wsg homie?";
  document.getElementById("my-description").textContent = description;

  if (d.createdAt?.toDate) {
    const date = d.createdAt.toDate();
    const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "long" })} ${date.getFullYear()}`;
    document.getElementById("my-creation").textContent = `joined ${formatted}`;
  }
  loadTweets(uid);
});

async function loadTweets(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return;

  const userData = {
    ...userDoc.data(),
    uid
  };

  const tweetsRef = collection(db, "tweets");
  let q;

  if (!userLastVisibleDoc) {
    q = query(
      tweetsRef,
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(USER_PAGE_SIZE)
    );
  } else {
    q = query(
      tweetsRef,
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      startAfter(userLastVisibleDoc),
      limit(USER_PAGE_SIZE)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty && userLoadedCount === 0) {
    list.innerHTML = `<div style="display:flex;justify-content:center;margin-top:30px;opacity:0.7;"><img style="height:250px;width:250px;" src="/image/404.gif"></div><h4 style="text-align:center;">there’s nothing to see here — yet</h4>`;
    loadMore.style.display = "none";
    return;
  }

  for (const docSnap of snap.docs) {
    await renderTweet(docSnap.data(), docSnap.id, userData, "append", list);
  }

  userLoadedCount += snap.docs.length;

  if (snap.docs.length < USER_PAGE_SIZE) {
    loadMore.style.display = "none";
  } else {
    loadMore.style.display = "block";
    userLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}

const loadMore = document.getElementById("youLoadMore");

loadMore.addEventListener("click", () => {
  const uid = document.getElementById("my-name").dataset.uid;
  loadTweets(uid);
});

const mloadMore = document.getElementById("myouLoadMore"); 

mloadMore.addEventListener("click", () => {
  const uid = document.getElementById("my-name").dataset.uid;
  loadUserMentionedTweets(uid);
});

let userLastVisibleDoc = null;
let userLoadedCount = 0;
const USER_PAGE_SIZE = 3;
const list = document.getElementById("youList");
let mentionedLastVisibleDoc = null;
let mentionedLoadedCount = 0;
const usermentionedList = document.getElementById("mentionedList");
const MENTIONED_PAGE_SIZE = 3;

document.querySelectorAll(".tab2").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab2").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    document.getElementById("youList").style.display = "none";
    document.getElementById("mentionedList").style.display = "none";

    const targetId = tab.dataset.target;
    document.getElementById(targetId).style.display = "block";

    const uid = document.getElementById("my-name").dataset.uid;

    if (targetId === "youList") {
      loadTweets(uid);
    } 
    else if (targetId === "mentionedList") {
      loadUserMentionedTweets(uid); 
    }
  });
});

async function loadUserMentionedTweets(uid) {
  const mentionedRef = collection(db, "users", uid, "mentioned");
  let q;

  if (!mentionedLastVisibleDoc) {
    q = query(mentionedRef, orderBy("mentionedAt", "desc"), limit(MENTIONED_PAGE_SIZE));
  } else {
    q = query(mentionedRef, orderBy("mentionedAt", "desc"), startAfter(mentionedLastVisibleDoc), limit(MENTIONED_PAGE_SIZE));
  }

  const snap = await getDocs(q);

  if (snap.empty && mentionedLoadedCount === 0) {
    usermentionedList.innerHTML = `<div style="display:flex;justify-content:center;margin-top:30px;opacity:0.7;"><img style="height:250px;width:250px;" src="/image/404.gif"></div><h4 style="text-align:center;">there’s nothing to see here — yet</h4>`;
    mloadMore.style.display = "none";
    return;
  }

  for (const mentionDoc of snap.docs) {
    const tweetId = mentionDoc.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (!tweetDoc.exists()) continue;

    const tweetData = tweetDoc.data();
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = {
      ...userDoc.data(),
      uid
    };

    await renderTweet(tweetData, tweetId, userData, "append", usermentionedList);
  }

  mentionedLoadedCount += snap.docs.length;

  if (snap.docs.length < MENTIONED_PAGE_SIZE) {
    mloadMore.style.display = "none";
  } else {
    mloadMore.style.display = "block";
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }

}
