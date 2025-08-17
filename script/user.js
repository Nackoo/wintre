import { db, collection, query, where, getDocs, orderBy, limit, auth, getDoc, doc, setDoc, deleteDoc, startAfter, updateDoc, increment } from "./firebase.js";
import { renderTweet } from './index.js';
import { sendFollowNotification } from "./notification.js";

const searchBtn = document.querySelector('.smallbar img[src="image/search.svg"]');
const userOverlay = document.getElementById("userOverlay");
const userSubOverlay = document.getElementById("userSubOverlay");
const searchInput = userOverlay.querySelector("input[type='text']");
const usersView = document.getElementById("usersView");
const tweetsView = document.getElementById("tweetsView");
const tagsView = document.getElementById("tagsView");
const tagName = document.getElementById("tagId");
const youList = document.getElementById("youList");
const youLoadMore = document.getElementById("youLoadMore");

let lastSearchedTweetDoc = null;
let tweetSearchLoading = false;
let tweetSearchNoMore = false;
let tweetSearchResults = [];
let renderedTweetCount = 0;

let lastUserDoc = null;
let currentSearchTerm = "";
let isFetching = false;
let totalLoaded = 0;

searchBtn.addEventListener("click", () => {
  userOverlay.classList.remove("hidden");
  searchInput.value = "";
  usersView.innerHTML = "";
  currentSearchTerm = "";
  lastUserDoc = null;
  totalLoaded = 0;
  fetchUsers(true);
});

document.querySelectorAll(".tab1").forEach(tab1 => {
  tab1.addEventListener("click", () => {
    document.querySelectorAll(".tab1").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    tab1.classList.add("active");
    document.getElementById(tab1.dataset.target).classList.remove("hidden");

    const tabTarget = tab1.dataset.target;
    if (tabTarget === "tagsView") {
      tagsView.innerHTML = "";
      fetchTags("");
    } else if (tabTarget === "usersView") {
      usersView.innerHTML = "";
      lastUserDoc = null;
      fetchUsers(true);
    }
  });
});

let searchTimeout;

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);

  searchTimeout = setTimeout(() => {
    currentSearchTerm = searchInput.value.trim().toLowerCase();
    const activeTab = document.querySelector(".tab1.active")?.dataset.target;
    const term = searchInput.value.trim().toLowerCase();

    if (activeTab === "tweetsView") {
      resetTweetSearch();
      if (currentSearchTerm.length >= 3) {
        searchTweets(currentSearchTerm);
      } else {
        tweetsView.innerHTML = `<p style="color:gray;font-size:15px;">enter at least 3 characters to search tweets</p>`;
      }
    } else if (activeTab === "usersView") {
      usersView.innerHTML = "";
      lastUserDoc = null;
      fetchUsers(true);
    } else if (activeTab === "tagsView") {
      tagsView.innerHTML = "";
      fetchTags(term);
    }
  }, 1000);
});

function resetTweetSearch() {
  tweetSearchResults = [];
  renderedTweetCount = 0;
  lastSearchedTweetDoc = null;
  tweetSearchLoading = false;
  tweetSearchNoMore = false;
  tweetsView.innerHTML = "";
}

async function searchTweets(term) {
  if (tweetSearchLoading || tweetSearchNoMore) return;
  tweetSearchLoading = true;
  const q = query(
    collection(db, "tweets"),
    orderBy("createdAt", "desc"),
    limit(100)
  );

  const snap = await getDocs(q);
  tweetSearchResults = snap.docs.filter(doc => {
    const d = doc.data();
    return d.text?.toLowerCase().includes(term);
  });

  if (tweetSearchResults.length === 0) {
    tweetsView.innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
    tweetSearchNoMore = true;
    return;
  }

  renderMoreSearchedTweets();
  tweetSearchLoading = false;
}

async function renderMoreSearchedTweets() {
  const next = tweetSearchResults.slice(renderedTweetCount, renderedTweetCount + 10);

  for (const docSnap of next) {
    const t = docSnap.data();
    const id = docSnap.id;
    await renderTweet(t, id, auth.currentUser, "append", tweetsView);
  }

  renderedTweetCount += next.length;

  if (renderedTweetCount >= tweetSearchResults.length) {
    tweetSearchNoMore = true;
  }
}

let lastDoc = null;

let loadedCount = 0;
const PAGE_SIZE = 3;
const list = document.getElementById("userList");
const loadMore = document.getElementById("userLoadMore");

let userLastVisibleDoc = null;
let userLoadedCount = 0;
const USER_PAGE_SIZE = 3;

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
    list.innerHTML = `<div id="start" style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
    loadMore.style.display = "none";
    return;
  } else {
    const startEl = document.getElementById("start");
    if (startEl) startEl.style.display = "none";
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

loadMore.addEventListener("click", () => {
  const uid = document.getElementById("user-name").dataset.uid;
  loadTweets(uid);
});

const mloadMore = document.getElementById("mLoadMore");

mloadMore.addEventListener("click", () => {
  const uid = document.getElementById("user-name").dataset.uid;
  loadUserMentionedTweets(uid);
});

async function fetchUsers(reset = false) {
  if (isFetching) return;
  isFetching = true;

  const selfUID = auth.currentUser?.uid;
  const q = lastUserDoc ?
    query(collection(db, "users"), orderBy("displayName"), startAfter(lastUserDoc), limit(10)) :
    query(collection(db, "users"), orderBy("displayName"), limit(10));

  const snap = await getDocs(q);
  lastUserDoc = snap.docs[snap.docs.length - 1];

  const filtered = snap.docs.filter(doc => {
    const data = doc.data();
    return doc.id !== selfUID &&
      data.displayName?.toLowerCase().includes(currentSearchTerm);
  });

  for (const docSnap of filtered) {
    const data = docSnap.data();
    const targetId = docSnap.id;

    const desc = data.description || "wsg homie?";
    const shortDesc = desc.length > 60 ? desc.slice(0, 60) + "..." : desc;

    const item = document.createElement("div");
    item.className = "user-search-item";
    item.style.cssText = "display:flex;gap:10px;padding:15px 0 10px 0;border-bottom:var(--border);align-items:center";

    item.innerHTML = `
<img src="${data.photoURL}" onerror="this.src='image/default-avatar.jpg'"
     style="width:40px;height:40px;border-radius:50%;object-fit:cover;align-self:flex-start;">
<div style="flex:1">
  <div style="display:flex;align-items:center;">
    <strong style="cursor:pointer;">${escapeHTML(data.displayName || "Unnamed")}</strong>
    <button class="mini-follow-btn"
            style="padding:0 10px;border-radius:50px;background:white;height:26px;cursor:pointer;border:1px solid var(--border);margin-left:auto;">
      ...
    </button>
  </div>
  <p style="margin:5px 0;color:grey;font-size:15px;">${escapeHTML(shortDesc)}</p>
</div>`;

    const btn = item.querySelector(".mini-follow-btn");
    await setupMiniFollowBtn(btn, targetId);

    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mini-follow-btn")) {
        openUserSubProfile(targetId);
      }
    });

    usersView.appendChild(item);
    totalLoaded++;
  }
  isFetching = false;
}

export async function fetchTags(term) {
  tagsView.innerHTML = "";

  const tagsRef = collection(db, "tags");

  if (!term || term.length < 1) {
    const allTagsSnap = await getDocs(tagsRef);

    const tagCounts = allTagsSnap.docs.map(docSnap => ({
      id: docSnap.id,
      count: docSnap.data().tweetCount || 0
    }));

    const topTags = tagCounts
      .filter(tag => tag.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (topTags.length === 0) {
      tagsView.innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
      return;
    }

    for (const tag of topTags) {
      const item = document.createElement("div");
      item.className = "tag-search-item";
      item.innerHTML = `<div style="display:flex;align-items:center;"><strong style="color:#00ba7c;">#${tag.id}</strong> <p style="color:var(--color);margin-left:auto">${tag.count} wints</p></div>`;
      item.style.cssText = "border-bottom:var(--border);cursor:pointer;";
      item.onclick = () => openTag(tag.id);
      tagsView.appendChild(item);
    }

    return;
  }

  const q = query(
    tagsRef,
    where("name", ">=", term),
    where("name", "<=", term + "\uf8ff")
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    tagsView.innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
    return;
  }

  for (const tagDoc of snap.docs.slice(0, 10)) {
    const tagId = tagDoc.id;
    const tweetCount = tagDoc.data().tweetCount || 0;

    const item = document.createElement("div");
    item.className = "tag-search-item";
    item.innerHTML = `<div style="display:flex;align-items:center"><strong style="color:#00ba7c;">#${tagId}</strong> <p style="color:var(--color);margin-left:auto">${tweetCount} wints</p></div>`;
    item.style.cssText = "border-bottom:var(--border);cursor:pointer;";
    item.onclick = () => openTag(tagId);
    tagsView.appendChild(item);
  }
}

function escapeHTML(str) {
  return str?.replace(/[&<>]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  } [c])) || "";
}

async function openUserSubProfile(uid) {

  list.innerHTML = "";
  usermentionedList.innerHTML = "";

  userLoadedCount = 0;
  userLastVisibleDoc = null;
  mentionedLoadedCount = 0;
  mentionedLastVisibleDoc = null;

  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) return;

  document.getElementById("user-name").dataset.uid = uid;

  const d = docSnap.data();
  document.getElementById("who").textContent = d.displayName || "Unnamed";
  document.getElementById("user-name").textContent = d.displayName || "Unnamed";
  document.getElementById("user-description").textContent = d.description || "wsg homie?";
  document.getElementById("user-pfp").style.background = `url(${d.photoURL || "image/default-avatar.png"}) no-repeat center /cover`;
  document.getElementById("user-banner").style.background = d.banner ?
    `url(${d.banner}) center/cover` :
    "grey";

  userOverlay.classList.add("hidden");
  userSubOverlay.classList.remove("hidden");

  if (d.createdAt?.toDate) {
    const date = d.createdAt.toDate();
    const formatted = `${date.getDate()} ${date.toLocaleString("default", { month: "long" })} ${date.getFullYear()}`;
    document.getElementById("user-creation").textContent = `joined ${formatted}`;
  }
  list.innerHTML = "";
  loadedCount = 0;

  loadTweets(uid);
  const followBtn = document.getElementById("followBtn");
  const currentUserId = auth.currentUser.uid;

  if (uid === currentUserId) {
    followBtn.style.display = "none";
  }

  followBtn.style.display = "inline-block";

  const myFollowingRef = doc(db, "users", currentUserId, "following", uid);
  const theirFollowersRef = doc(db, "users", uid, "followers", currentUserId);

  const snap = await getDoc(myFollowingRef);
  followBtn.textContent = snap.exists() ? "Unfollow" : "Follow";

  followBtn.onclick = async () => {
    const currentlyFollowing = (await getDoc(myFollowingRef)).exists();

    if (currentlyFollowing) {

      await deleteDoc(myFollowingRef);
      await deleteDoc(theirFollowersRef);
      await updateDoc(doc(db, "users", currentUserId), {
        following: increment(-1)
      });
      await updateDoc(doc(db, "users", uid), {
        followers: increment(-1)
      });

      followBtn.textContent = "Follow";
    } else {

      await setDoc(myFollowingRef, {
        followedAt: new Date()
      });
      await setDoc(theirFollowersRef, {
        followedAt: new Date()
      });
      await updateDoc(doc(db, "users", currentUserId), {
        following: increment(1)
      });
      await updateDoc(doc(db, "users", uid), {
        followers: increment(1)
      });

      followBtn.textContent = "Unfollow";
      sendFollowNotification(uid);
    }

  };

  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.data();
  const postCount = userData?.posts || 0;
  const followerCount = userData?.followers || 0;
  const followingCount = userData?.following || 0;

  document.getElementById("posts").textContent = `${postCount}`;
  document.getElementById("followers").textContent = `${followerCount}`;
  document.getElementById("following").textContent = `${followingCount}`;
}

window.openUserSubProfile = openUserSubProfile;

window.openTag = async function(tagId) {
  const tagOverlay = document.getElementById("tagSubOverlay");
  const tweetList = document.getElementById("tagstweet");

  tagOverlay.classList.remove("hidden");
  tweetList.innerHTML = `<p style="color:gray;">loading...</p>`;
  tagName.textContent = `#${tagId}`;

  const tagTweetsRef = collection(db, "tags", tagId, "tweets");
  const tagTweetDocs = await getDocs(tagTweetsRef);

  if (tagTweetDocs.empty) {
    tweetList.innerHTML = `<p>no wint found</p>`;
    return;
  }

  tweetList.innerHTML = "";
  let renderedCount = 0;
  const allTweetIds = tagTweetDocs.docs.map(doc => doc.id);

  async function renderBatch() {
    const nextBatch = allTweetIds.slice(renderedCount, renderedCount + 10);
    for (const tweetId of nextBatch) {
      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      if (tweetDoc.exists()) {
        const tweetData = tweetDoc.data();
        await renderTweet(tweetData, tweetId, auth.currentUser, "append", tweetList);
      }
    }
    renderedCount += nextBatch.length;

    loadMoreLink.style.display = renderedCount < allTweetIds.length ? "block" : "none";
  }

  const loadMoreLink = document.createElement("a");
  loadMoreLink.textContent = "Load More";
  loadMoreLink.className = "read-more link";
  loadMoreLink.href = "javascript:void(0)";
  loadMoreLink.style.display = "none";
  loadMoreLink.addEventListener("click", renderBatch);

  tweetList.after(loadMoreLink);

  await renderBatch();

  if (renderedCount === 0) {
    tweetList.innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
  }
};

let followList = [];
let followLastDoc = null;
const FOLLOW_PAGE_SIZE = 10;

const followOverlay = document.createElement("div");
followOverlay.id = "followOverlay";
followOverlay.className = "useroverlay hidden";
followOverlay.innerHTML = `
  <div class="user-box">
    <header>
      <button onclick="document.getElementById('followOverlay').classList.add('hidden')" class="close-btn" style="position:absolute;top:20px;left:0;">
        <img src="image/leftArrow.svg">
      </button>
      <h2 id="followOverlayTitle" style="text-align:right;"></h2>
    </header>
    <input id="followSearch" placeholder="Search users" style="width:100%;margin-bottom:10px">
    <div id="followList"></div>
  </div>`;
document.body.appendChild(followOverlay);
window.followOverlay = followOverlay;

async function openFollowOverlay(type, userId, isMe) {
  document.getElementById("followOverlay").classList.remove("hidden");
  document.getElementById("followList").innerHTML = "";
  document.getElementById("followSearch").value = "";
  document.getElementById("followOverlayTitle").textContent = type === "followers" ?
    (isMe ? "Your Followers" : "Their Followers") :
    (isMe ? "Your Following" : "Their Following");
  followList = [];
  followLastDoc = null;
  await loadFollowUsers(type, userId);
}

async function loadFollowUsers(type, userId, searchTerm = "") {
  const ref = collection(db, "users", userId, type);
  const q = followLastDoc ?
    query(ref, orderBy("followedAt", "desc"), startAfter(followLastDoc), limit(FOLLOW_PAGE_SIZE)) :
    query(ref, orderBy("followedAt", "desc"), limit(FOLLOW_PAGE_SIZE));

  const snap = await getDocs(q);
  if (snap.empty && followList.length === 0) {
    document.getElementById("followList").innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
    return;
  }
  followLastDoc = snap.docs[snap.docs.length - 1];

  for (const docSnap of snap.docs) {
    const theirId = docSnap.id;
    const userDoc = await getDoc(doc(db, "users", theirId));
    if (!userDoc.exists()) continue;
    const data = userDoc.data();

    if (!data.displayName?.toLowerCase().includes(searchTerm.toLowerCase())) continue;

    const item = document.createElement("div");
    item.className = "user-search-item";
    item.style.cssText = "display:flex;gap:10px;padding:10px 0;border-bottom:var(--border);align-items:center";
    item.innerHTML = `
    <div style="display:flex;gap:15px;align-items:center;flex:1;">
    <img src="${data.photoURL}" onerror="this.src='image/default-avatar.jpg'"
      style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
    <strong class="user-link" data-uid="${theirId}" style="cursor:pointer">${escapeHTML(data.displayName || "Unnamed")}</strong>
    <button class="mini-follow-btn"
          style="padding:0 10px;border-radius:50px;background:white;height:26px;cursor:pointer;border:1px solid var(--border);margin-left:auto;">
    ...
    </button>
    </div>
  `;

    const btn = item.querySelector(".mini-follow-btn");
    await setupMiniFollowBtn(btn, theirId);

    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mini-follow-btn")) {
        openUserSubProfile(theirId);
      }
    });

    document.getElementById("followList").appendChild(item);
    followList.push(item);
  }
}

const followListContainer = document.getElementById("followList");

followListContainer.addEventListener("scroll", () => {
  const items = followListContainer.querySelectorAll(".user-search-item");
  if (items.length < 10) return;

  const triggerEl = items[10];
  const rect = triggerEl.getBoundingClientRect();
  const inView = rect.top < window.innerHeight && rect.bottom >= 0;

  if (inView) {
    const title = document.getElementById("followOverlayTitle").textContent.toLowerCase();
    const type = title.includes("follower") ? "followers" : "following";
    const isMe = title.includes("your");
    const uid = auth.currentUser.uid;
    const userId = isMe ? uid : window.lastViewedUserId;
    const searchTerm = document.getElementById("followSearch").value;

    loadFollowUsers(type, userId, searchTerm);
  }
});

async function setupMiniFollowBtn(btn, targetId) {
  if (auth.currentUser?.uid !== targetId) {
    const currentUid = auth.currentUser.uid;
    const myFollowingRef = doc(db, "users", currentUid, "following", targetId);
    const theirFollowersRef = doc(db, "users", targetId, "followers", currentUid);

    const isFollowingSnap = await getDoc(myFollowingRef);
    btn.textContent = isFollowingSnap.exists() ? "Unfollow" : "Follow";

    btn.onclick = async (e) => {
      e.stopPropagation();
      const latestSnap = await getDoc(myFollowingRef);
      const isNowFollowing = latestSnap.exists();

      if (isNowFollowing) {
        await deleteDoc(myFollowingRef);
        await deleteDoc(theirFollowersRef);

        await updateDoc(doc(db, "users", currentUid), {
          following: increment(-1)
        });
        await updateDoc(doc(db, "users", targetId), {
          followers: increment(-1)
        });

        btn.textContent = "Follow";
      } else {

        await setDoc(myFollowingRef, {
          followedAt: new Date()
        });
        await setDoc(theirFollowersRef, {
          followedAt: new Date()
        });

        await updateDoc(doc(db, "users", currentUid), {
          following: increment(1)
        });
        await updateDoc(doc(db, "users", targetId), {
          followers: increment(1)
        });

        btn.textContent = "Unfollow";
        sendFollowNotification(targetId);
      }

    };
  } else {
    btn.style.display = "none";
  }
}

document.getElementById("followSearch").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  for (const el of followList) {
    const name = el.querySelector("strong").textContent.toLowerCase();
    el.style.display = name.includes(term) ? "flex" : "none";
  }
});

document.getElementById("my-ers").onclick = () => openFollowOverlay("followers", auth.currentUser.uid, true);
document.getElementById("my-ing").onclick = () => openFollowOverlay("following", auth.currentUser.uid, true);
document.getElementById("ers").onclick = () => {
  window.lastViewedUserId = document.getElementById("user-name").dataset.uid;
  openFollowOverlay("followers", window.lastViewedUserId, false);
};
document.getElementById("ing").onclick = () => {
  window.lastViewedUserId = document.getElementById("user-name").dataset.uid;
  openFollowOverlay("following", window.lastViewedUserId, false);
};

let mentionedLastVisibleDoc = null;
let mentionedLoadedCount = 0;
const usermentionedList = document.getElementById("usermentionedList");
const MENTIONED_PAGE_SIZE = 3;

document.querySelectorAll(".tab3").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab3").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    document.getElementById("userList").style.display = "none";
    document.getElementById("usermentionedList").style.display = "none";

    const targetId = tab.dataset.target;
    document.getElementById(targetId).style.display = "block";

    const uid = document.getElementById("user-name").dataset.uid;

    if (targetId === "userList") {
      loadTweets(uid);
    } else if (targetId === "usermentionedList") {
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
  mloadMore.style.display = "none";

  if (snap.empty && mentionedLoadedCount === 0) {
    usermentionedList.innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
    return;
  }

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mloadMore.style.display = "block";
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
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

  if (snap.docs.length >= MENTIONED_PAGE_SIZE) {
    mentionedLastVisibleDoc = snap.docs[snap.docs.length - 1];
  }
}
