import { db, collection, query, where, getDocs, orderBy, limit, auth, getDoc, doc, setDoc, deleteDoc } from "./firebase.js";
import { renderTweet } from './index.js';

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
        tweetsView.innerHTML = `<p style="color:gray;">enter at least 3 characters to search tweets</p>`;
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
    tweetsView.innerHTML = `<p style="color:gray;">no tweets found</p>`;
    tweetSearchNoMore = true;
    return;
  }

  renderMoreSearchedTweets();
  tweetSearchLoading = false;
}

async function renderMoreSearchedTweets() {
  const next = tweetSearchResults.slice(renderedTweetCount, renderedTweetCount + 30);

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

tweetsView.addEventListener("scroll", () => {
  if (tweetSearchNoMore || tweetSearchLoading) return;
  const tweets = tweetsView.querySelectorAll(".tweet");
  if (tweets.length < 25) return;

  const triggerEl = tweets[24];
  const rect = triggerEl.getBoundingClientRect();
  const inView = rect.top < window.innerHeight && rect.bottom >= 0;

  if (inView) {
    renderMoreSearchedTweets();
  }
});

usersView.addEventListener("scroll", () => {
  if (usersView.scrollTop + usersView.clientHeight >= usersView.scrollHeight - 20) {
    fetchUsers(false);
  }
});

let lastDoc = null;

let loadedCount = 0;
const PAGE_SIZE = 30;
const list = document.getElementById("userList");
const loadMore = document.getElementById("userLoadMore");

async function loadTweets(targetUid = auth.currentUser.uid) {
  const userDoc = await getDoc(doc(db, "users", targetUid));
  if (!userDoc.exists()) return;

  const user = {
    ...userDoc.data(),
    uid: targetUid
  };

  const postsRef = collection(db, "users", targetUid, "posts");
  const allPosts = await getDocs(postsRef);
  const tweetIds = allPosts.docs.map(doc => doc.id);

  if (tweetIds.length === 0) {
    list.innerHTML = `<p id="start1" style="color:grey;text-align:center">this user has no wint</p>`;
    loadMore.style.display = "none";
    return;
  } else {
    const startEl = document.getElementById('start1');
    if (startEl) startEl.style.display = 'none';
  }

  const slice = tweetIds.slice(loadedCount, loadedCount + PAGE_SIZE);
  for (const tweetId of slice) {
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    if (tweetDoc.exists()) {
      const tweetData = tweetDoc.data();
      await renderTweet(tweetData, tweetId, user, "append", list);
    }
  }

  loadedCount += slice.length;
  loadMore.style.display = loadedCount >= tweetIds.length ? "none" : "block";
}

loadMore.addEventListener("click", () => {
  const uid = document.getElementById("user-name").dataset.uid;
  loadTweets(uid);
});


document.getElementById("youLoadMore").addEventListener("click", () => loadYourTweets(false));

async function fetchUsers(reset = false) {
  if (isFetching) return;
  isFetching = true;

  const selfUID = auth.currentUser?.uid;
  const q = lastUserDoc ?
    query(collection(db, "users"), orderBy("displayName"), startAfter(lastUserDoc), limit(30)) :
    query(collection(db, "users"), orderBy("displayName"), limit(30));

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

    const item = document.createElement("div");
    item.className = "user-search-item";
    item.style.cssText = "display:flex;gap:10px;padding:15px;border-bottom:var(--border);align-items:center";

    item.innerHTML = `
    <img src="${data.photoURL}" onerror="this.src='image/default-avatar.jpg'" style="width:40px;height:40px;border-radius:50%;object-fit:cover;align-self:flex-start;">
    <div style="flex:1">
      <strong style="cursor:pointer;">${escapeHTML(data.displayName || "Unnamed")}</strong>
      <p style="margin:5px 0;color:grey">${escapeHTML(data.description || "")}</p>
    </div>
    <button class="mini-follow-btn" style="padding:4px 10px;border-radius:50px;background:white;height:30px;cursor:pointer;border:1px solid var(--border);">...</button>
  `;

    usersView.appendChild(item);
    totalLoaded++;

    const btn = item.querySelector(".mini-follow-btn");
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
          btn.textContent = "Follow";
        } else {
          await setDoc(myFollowingRef, {
            followedAt: new Date()
          });
          await setDoc(theirFollowersRef, {
            followedAt: new Date()
          });
          btn.textContent = "Unfollow";
        }
      };
    } else {

      btn.style.display = "none";
    }

    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mini-follow-btn")) {
        openUserSubProfile(targetId);
      }
    });
  }

  if (reset && filtered.length === 0) {
    usersView.innerHTML = `<p style="color:grey;">no users found</p>`;
  }

  isFetching = false;
}

export async function fetchTags(term) {
  tagsView.innerHTML = "";

  const tagsRef = collection(db, "tags");

  let snap;

  if (!term || term.length < 1) {

    const allTagsSnap = await getDocs(tagsRef);

    const tagCounts = await Promise.all(
      allTagsSnap.docs.map(async (docSnap) => {
        const tweetSnap = await getDocs(collection(db, "tags", docSnap.id, "tweets"));
        return {
          id: docSnap.id,
          count: tweetSnap.size
        };
      })
    );

    const topTags = tagCounts
      .filter(tag => tag.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    if (topTags.length === 0) {
      tagsView.innerHTML = `<p style="color:gray;">no tags available</p>`;
      return;
    }

    for (const tag of topTags) {
      const item = document.createElement("div");
      item.className = "tag-search-item";
      item.innerHTML = `<div style="display:flex;align-items:center;"><strong style="color:var(--color)">#${tag.id}</strong> <p style="color:var(--color);margin-left:auto">${tag.count} wints</p></div>`;
      item.style.cssText = "border-bottom:var(--border);cursor:pointer;";
      item.onclick = () => {
        openTag(tag.id);
      };

      tagsView.appendChild(item);
    }

    return;
  }

  const q = query(
    tagsRef,
    where("name", ">=", term),
    where("name", "<=", term + "\uf8ff")
  );
  snap = await getDocs(q);

  if (snap.empty) {
    tagsView.innerHTML = `<p style="color:gray;">no tags found</p>`;
    return;
  }

  for (const tagDoc of snap.docs) {
    const tagId = tagDoc.id;

    const tweetSnap = await getDocs(collection(db, "tags", tagId, "tweets"));
    const tweetCount = tweetSnap.size;

    const item = document.createElement("div");
    item.className = "tag-search-item";
    item.innerHTML = `<div style="display:flex;align-items:center"><strong style="color:var(--color)">#${tagId}</strong> <p style="color:var(--color);margin-left:auto">${tweetCount} wints</p></div>`;
    item.style.cssText = "border-bottom:var(--border);cursor:pointer;";
    item.onclick = () => {
      openTag(tag.id);
    };

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
  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) return;

  document.getElementById("user-name").dataset.uid

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
    return;
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
      followBtn.textContent = "Follow";
    } else {

      await setDoc(myFollowingRef, {
        followedAt: new Date()
      });
      await setDoc(theirFollowersRef, {
        followedAt: new Date()
      });
      followBtn.textContent = "Unfollow";
    }
  };

  const followersSnap = await getDocs(collection(db, "users", uid, "followers"));
  const followingSnap = await getDocs(collection(db, "users", uid, "following"));
  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.data();
  const postCount = userData?.posts || 0;

  document.getElementById("posts").textContent = `${postCount}`;
  document.getElementById("followers").textContent = `${followersSnap.size}`;
  document.getElementById("following").textContent = `${followingSnap.size}`;
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

  for (const docSnap of tagTweetDocs.docs) {
    const tweetId = docSnap.id;
    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));

    if (tweetDoc.exists()) {
      const tweetData = tweetDoc.data();
      await renderTweet(tweetData, tweetId, auth.currentUser, "append", tweetList);
      renderedCount++;
    }
  }

  if (renderedCount === 0) {
    tweetList.innerHTML = `<p style="color:gray;">no tweets found for #${tagId}</p>`;
  }
};

let followList = [];
let followLastDoc = null;
const FOLLOW_PAGE_SIZE = 30;

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
    document.getElementById("followList").innerHTML = `<p style="margin-top:20px;">no data</p>`;
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
    item.style.cssText = "display:flex;gap:10px;padding:10px;border-bottom:var(--border);align-items:center";
    item.innerHTML = `
      <img src="${data.photoURL || 'image/default-avatar.png'}"
        style="width:40px;height:40px;border-radius:50%;object-fit:cover;align-self:flex-start;">
      <div style="flex:1">
        <strong class="user-link" data-uid="${theirId}" style="cursor:pointer">${escapeHTML(data.displayName || "Unnamed")}</strong>
        <p style="margin:5px 0;color:grey">${escapeHTML(data.description || "")}</p>
      </div>
    `;
    item.onclick = () => openUserSubProfile(theirId);
    document.getElementById("followList").appendChild(item);
    followList.push(item);
  }
}

const followListContainer = document.getElementById("followList");

followListContainer.addEventListener("scroll", () => {
  const items = followListContainer.querySelectorAll(".user-search-item");
  if (items.length < 25) return;

  const triggerEl = items[24];
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

let userSearchTimeout;

document.getElementById("userInput").addEventListener("input", () => {
  clearTimeout(userSearchTimeout);

  userSearchTimeout = setTimeout(async () => {
    const keyword = document.getElementById("userInput").value.trim().toLowerCase();
    const targetUid = document.getElementById("user-name").dataset.uid;

    const listContainer = document.getElementById("userList");
    listContainer.innerHTML = `<div class="flex" style="justify-content:center;"><div class="loader"></div></div>`;

    const postsSnap = await getDocs(collection(db, "users", targetUid, "posts"));
    const tweetIds = postsSnap.docs.map(doc => doc.id);

    const matched = [];

    for (const tweetId of tweetIds) {
      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      if (!tweetDoc.exists()) continue;

      const tweet = tweetDoc.data();
      const combinedText = (tweet.text || "").toLowerCase();
      if (combinedText.includes(keyword)) {
        matched.push({
          tweetId,
          tweet
        });
      }
    }

    listContainer.innerHTML = "";

    if (matched.length === 0) {
      listContainer.innerHTML = `<p style='text-align:center;color:grey;'>No results found</p>`;
    } else {
      const userDoc = await getDoc(doc(db, "users", targetUid));
      const userData = userDoc.data();
      const user = {
        ...userData,
        uid: targetUid
      };

      for (const {
          tweetId,
          tweet
        }
        of matched) {
        await renderTweet(tweet, tweetId, user, "append", listContainer);
      }
    }
  }, 1000);
});
