import { app, auth, db, storage, initializeApp, getAuth, increment, onAuthStateChanged, getFirestore, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, getStorage, ref, uploadBytes, getDownloadURL, updateDoc } from "./firebase.js";
import { extractMentions } from './mention.js';
import { handleTags } from './tags.js';

let lastTweet = null;
let loadingMore = false;
let noMoreTweets = false;

let isOnline = navigator.onLine;

window.addEventListener("offline", () => {
  isOnline = false;
  showConnectionLost();
});

window.addEventListener("online", async () => {
  isOnline = true;
  await retryWhenBackOnline();
});

function showConnectionLost() {
  const loadingScreen = document.getElementById("loadingScreen");
  const logEl = document.getElementById("log");

  if (loadingScreen) {
    loadingScreen.style.display = "flex";
    loadingScreen.style.opacity = "1";
    document.body.classList.add("no-scroll");
    if (logEl) logEl.textContent = "connection lost...";
  }
}

async function retryWhenBackOnline() {
  const loadingScreen = document.getElementById("loadingScreen");
  const logEl = document.getElementById("log");

  if (logEl) logEl.textContent = "connection restored, fetching...";

  try {

    await loadTweets(true);
  } catch (err) {
    if (logEl) logEl.textContent = "failed to reload wints";
    console.error("Failed to reload wints after reconnect", err);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loadTweets(true);
    renderTweets(user);

    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {

      await setDoc(ref, {
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date()
      });
    } else {

      const data = snap.data();
      if (!("createdAt" in data)) {
        await setDoc(ref, {
          createdAt: new Date()
        }, {
          merge: true
        });
      }
    }
  } else {
    window.location.href = "/user/login";
  }
});

window.addEventListener("scroll", () => {
  const tweets = document.querySelectorAll(".tweet");
  if (tweets.length < 25 || loadingMore || noMoreTweets) return;

  const lastVisible = tweets[24];
  const rect = lastVisible.getBoundingClientRect();
  const visible = rect.top < window.innerHeight && rect.bottom >= 0;

  if (visible) {
    loadTweets();
  }
});

function linkify(text) {
  const escaped = escapeHTML(text);
  return escaped.replace(/(https:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function formatDate(timestamp) {
  const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
  const options = {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  };
  const datePart = date.toLocaleDateString("en-GB", options);
  const timePart = date.toLocaleTimeString("en-GB", {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${datePart} • ${timePart}`;
}

function resizeImage(file, maxWidth = 800, maxHeight = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };

    img.onerror = reject;
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

document.getElementById("postBtn").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const text = document.getElementById("tweetInput").value.trim();
  const file = document.getElementById("mediaInput").files[0];

  let base64Media = "";
  let mediaType = "";

  try {
    if (file) {
      mediaType = file.type.startsWith("video/") ? "video" : "image";
      base64Media = mediaType === "image" ?
        await resizeImage(file) :
        await readFileAsBase64(file);
    }

    if (!text && !base64Media) return;

    const permission = document.getElementById("replyPermission").value;
    const tagMatches = text.match(/#(\w+)/g) || [];
    const tags = [...new Set(tagMatches.map(tag => tag.slice(1).toLowerCase().slice(0, 30)))];

    const tweetRef = await addDoc(collection(db, "tweets"), {
      text,
      media: base64Media,
      mediaType,
      createdAt: new Date(),
      uid: user.uid,
      tags,
      replyPermission: permission
    });

    const mentionsRaw = await extractMentions(text);
    const mentions = mentionsRaw.map(m => m.uid);

    try {
      await updateDoc(tweetRef, {
        ...(mentions.length > 0 && {
          mentions
        })
      });

      await Promise.all([
        ...mentions.map(uid =>
          setDoc(doc(db, "users", uid, "mentioned", tweetRef.id), {
            mentionedAt: new Date()
          }).catch(() => {})
        )
      ]);
    } catch (e) {}


    await handleTags(text, tweetRef.id);

    await setDoc(doc(db, "users", user.uid, "posts", tweetRef.id), {
      exists: true
    }).catch(() => {});

    document.getElementById("tweetInput").value = "";
    document.getElementById("mediaInput").value = "";
    document.getElementById("tweetPreview").innerHTML = "";
  } catch (error) {
    if (error.message.includes("The value of property \"media\" is longer than")) {
      alert("Media file is too large");
    }
  }
});

function applyReadMoreLogic(container) {
  const paragraphs = container.querySelectorAll("p");

  paragraphs.forEach((p) => {
    if (p.dataset.readmoreApplied) return;
    p.dataset.readmoreApplied = "true";

    const originalText = p.innerHTML;
    p.dataset.fullText = originalText;

    p.classList.add("clamp-text");
    p.style.webkitLineClamp = 10;

    requestAnimationFrame(() => {
      const lineHeight = parseFloat(getComputedStyle(p).lineHeight);
      const maxHeight = lineHeight * 10;

      if (p.scrollHeight > maxHeight + 5) {
        const btn = document.createElement("span");
        btn.textContent = "Read more";
        btn.className = "read-more";
        btn.style.marginBottom = '15px';

        let currentLines = 10;

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          currentLines += 10;
          p.style.webkitLineClamp = currentLines;

          if (p.scrollHeight <= lineHeight * currentLines + 5) {
            btn.remove();
          }
        });

        p.insertAdjacentElement("afterend", btn);
      }
    });
  });
}

async function renderTweets(user) {
  const q = query(
    collection(db, "tweets"),
    orderBy("likeCount", "desc")
  );

  onSnapshot(q, async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      const docSnap = change.doc;
      const tweetId = docSnap.id;
      const t = docSnap.data();

      if (change.type === "added") {
        await renderTweet(t, tweetId, user, "prepend");
      }

      if (change.type === "modified") {
        await renderTweet(t, tweetId, user, "replace");
      }

      if (change.type === "removed") {
        const el = document.getElementById("tweet-" + tweetId);
        if (el) el.remove();
      }
    }
  });
}

export async function parseMentionsToLinks(text) {
  let tokenIndex = 0;
  const tokens = {};
  const token = () => `__TOKEN_${tokenIndex++}__`;

  text = text.replace(/(https:\/\/[^\s]+)/g, (match) => {
    const id = token();
    tokens[id] = `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    return id;
  });

  const mentionsRaw = await extractMentions(text);
  for (const {
      uid,
      displayName
    }
    of mentionsRaw) {
    const regex = new RegExp(`@${displayName.replace(/\./g, "\\.")}`, "g");
    text = text.replace(regex, (match) => {
      const id = token();
      tokens[id] = `<span class="user-link" data-uid="${uid}" style="color:#1da1f2; cursor:pointer">${match}</span>`;
      return id;
    });
  }

  text = text.replace(/#(\w+)/g, (match, tag) => {
    const id = token();
    tokens[id] = `<span class="tag-link" data-tag="${tag}" style="color:#1da1f2; cursor:pointer">${match}</span>`;
    return id;
  });

  text = text.replace(/\|\|(.+?)\|\|/g, (_, spoilerContent) => {
    const id = token();
    tokens[id] = `<span class="spoiler-text" onclick="this.classList.remove('spoiler-text')">${escapeHTML(spoilerContent)}</span>`;
    return id;
  });

  let parsed = escapeHTML(text);

  for (const [id, html] of Object.entries(tokens)) {
    parsed = parsed.replace(id, html);
  }

  return parsed;
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, (char) => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    };
    return escapeMap[char];
  });
}

export async function renderTweet(t, tweetId, user, action = "prepend", container = document.getElementById("timeline")) {

  const likeRef = doc(db, "tweets", tweetId, "likes", user.uid);
  const likedSnap = await getDoc(likeRef);
  const isLiked = likedSnap.exists();

  const bookmarkRef = doc(db, "users", user.uid, "bookmarks", tweetId);
  const bookmarkedSnap = await getDoc(bookmarkRef);
  const isBookmarked = bookmarkedSnap.exists();

  const authorUID = t.uid;
  const userDoc = await getDoc(doc(db, "users", authorUID));

  let displayName = t.displayName;
  let avatar = t.photoURL;

  if (userDoc.exists()) {
    const userData = userDoc.data();
    displayName = userData.displayName || displayName;
    avatar = userData.photoURL || avatar;
  }

  let rtDisplayName = "";
  let rtAvatar = "";

  if (t.retweetOf) {
    const retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
      const rDate = formatDate(rt.createdAt);

      rtDisplayName = rt.displayName;
      rtAvatar = rt.photoURL;

      try {
        const rtUserDoc = await getDoc(doc(db, "users", rt.uid));
        if (rtUserDoc.exists()) {
          const rtUserData = rtUserDoc.data();
          rtDisplayName = rtUserData.displayName || rtDisplayName;
          rtAvatar = rtUserData.photoURL || rtAvatar;
        }
      } catch (err) {
        console.warn("Failed to fetch retweet user profile:", err);
      }

    }
  }
  const likeCountSnap = await getCountFromServer(
    collection(db, "tweets", tweetId, "likes")
  );
  const likeCount = likeCountSnap.data().count;

  const viewCountSnap = await getCountFromServer(
    collection(db, "tweets", tweetId, "views")
  );
  const viewCount = viewCountSnap.data().count;

  const commentCountSnap = await getCountFromServer(
    collection(db, "tweets", tweetId, "comments")
  );
  const commentCount = commentCountSnap.data().count;

  const retweetQuery = query(collection(db, "tweets"), where("retweetOf", "==", tweetId));
  const retweetSnap = await getCountFromServer(retweetQuery);
  const retweetCount = retweetSnap.data().count;

  const dateStr = formatDate(t.createdAt);

  let mediaHTML = "";
  const containsSpoiler = /\|\|.+?\|\|/.test(t.text);

  if (t.media && t.mediaType === "image") {
    if (containsSpoiler) {
      mediaHTML = `
  <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
    <div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>
    <img src="${t.media}" style="max-width: 100%; max-height: 300px; border-radius: 15px;" alt="tweet image" />
  </div>`;
    } else {
      mediaHTML = `
      <div class="attachment">
        <img src="${t.media}" style="max-width: 100%; max-height: 300px; border-radius: 15px;" alt="tweet image" />
      </div>`;
    }
  } else if (t.media && t.mediaType === "video") {
    if (containsSpoiler) {
      mediaHTML = `
  <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
    <div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>
    <video style="max-width: 100%; max-height: 300px;" muted controls>
      <source src="${t.media}" type="video/mp4" />
      Your browser does not support the video tag.
    </video>
  </div>`;

    } else {
      mediaHTML = `
      <div class="attachment">
        <video controls style="max-width: 100%; max-height: 300px">
          <source src="${t.media}" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>`;
    }
  }

  let retweetHTML = "";

  if (t.retweetOf) {
    const retweetDoc = await getDoc(doc(db, "tweets", t.retweetOf));
    if (retweetDoc.exists()) {
      const rt = retweetDoc.data();
      const rDate = formatDate(rt.createdAt);

      const hasText = rt.text?.trim()?.length > 0;
      const hasImage = rt.media && rt.mediaType === "image";
      const hasVideo = rt.media && rt.mediaType === "video";

      if (hasImage && hasText) {

        retweetHTML = `
          <div class="tweet retweet original-tweet-link" data-id="${t.retweetOf}">
            <div class="flex" style="gap:10px; align-items:center;">
              <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='image/default-avatar.jpg'" width="30">
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName)}</strong>
              <span style="color:grey;">${rDate}</span>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start; margin-top: 20px;">
              <img class="attachment2" src="${rt.media}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 5px; margin-left:4px" alt="retweet image" />
              <p style="margin: 0;">${await parseMentionsToLinks(rt.text)}</p>
            </div>
          </div>
        `;
      } else if (hasImage) {
        retweetHTML = `
          <div class="tweet retweet original-tweet-link" data-id="${t.retweetOf}">
            <div class="flex" style="gap:10px; align-items:center;">
              <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='image/default-avatar.jpg'" width="30">
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName)}</strong>
              <span style="color:grey;">${rDate}</span>
            </div>
            <div class="rt-attachment" style="margin-top: 10px;">
              <img src="${rt.media}" style="max-width: 100%; max-height: 300px; border-radius: 10px;" alt="retweet image" />
            </div>
          </div>
        `;
      } else if (hasVideo) {
        retweetHTML = `
          <div class="tweet retweet original-tweet-link" data-id="${t.retweetOf}">
            <div class="flex" style="gap:10px; align-items:center;">
              <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='image/default-avatar.jpg'" width="30">
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName)}</strong>
              <span style="color:grey;">${rDate}</span>
            </div>
            <div class="rt-attachment" style="margin-top: 10px;">
              <video controls style="max-width: 100%; max-height: 300px; border-radius: 10px;">
                <source src="${rt.media}" type="video/mp4" />
              </video>
            </div>
          </div>
        `;
      } else {
        retweetHTML = `
          <div class="tweet retweet original-tweet-link" data-id="${t.retweetOf}">
            <div class="flex" style="gap:10px; align-items:center;">
              <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='image/default-avatar.jpg'" width="30">
              <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName)}</strong>
              <span style="color:grey;">${rDate}</span>
            </div>
            <p style="margin-top: 10px;">${await parseMentionsToLinks(rt.text)}</p>
          </div>
        `;
      }
    } else {
      retweetHTML = `
        <div class="tweet retweet">
          <i>Original wint was deleted</i>
        </div>
      `;
    }
  }

  const tweetHTML = `
    <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}">
      <div class="flex" style="gap:10px">
        <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='image/default-avatar.jpg'" width="30" />
        <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
        <span style="color:grey;font-size:13px">${dateStr}</span>
      </div>
      <p>${await parseMentionsToLinks(t.text)}</p>
      ${mediaHTML}
      ${retweetHTML}
      <div class="flex">
        <span style="cursor:pointer" class="like-btn" id="likeBtn-${tweetId}">
          ${isLiked ? `<img src="image/filled-heart.svg">` : `<img src="image/heart.svg">`}
          <span id="likeCount-${tweetId}">${likeCount}</span>
        </span>     
        <span style="cursor:pointer" class="comment-btn" data-id="${tweetId}">
          <img src="image/message.svg"> ${commentCount}
        </span>
        <span style="cursor:pointer" class="retweet-btn" data-id="${tweetId}">
          <img src="image/rewint.svg"> ${retweetCount}
        </span>
        <div style="margin-left:auto;">
        <span style="cursor:pointer;" class="bookmark-btn" id="bookmarkBtn-${tweetId}">
        ${isBookmarked ? `<img src="image/bookmark-filled.svg">` : `<img src="image/bookmark.svg">`}
        </span>
          ${auth.currentUser.uid === t.uid ? `<span style="cursor:pointer;margin-left:5px" class="delete-btn" data-id="${tweetId}"><img src="image/trash.svg"></span>` : ""}
          <span style="margin-left:10px"><img src="image/chart.svg"> ${viewCount}</span>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById("tweet-" + tweetId);
  const tweetEl = document.getElementById("tweet-" + tweetId);
  const newTweet = document.getElementById("tweet-" + tweetId);
  const tweetIdSelector = `#tweet-${tweetId}`;
  const existingInContainer = container.querySelector(tweetIdSelector);

  if (action === "replace" && existingInContainer) {
    existingInContainer.outerHTML = tweetHTML;
  } else if (!existingInContainer) {
    container.insertAdjacentHTML("beforeend", tweetHTML);

    const newTweet = container.querySelector(tweetIdSelector);
    if (newTweet) {
      applyReadMoreLogic(newTweet);
      observer.observe(newTweet);
    } else {
      console.warn("Tweet inserted but not found in DOM for:", tweetId);
    }
  }
}

async function deleteSubcollectionDocs(tweetId, subcollectionName) {
  const subRef = collection(db, "tweets", tweetId, subcollectionName);
  const snapshot = await getDocs(subRef);

  for (const docSnap of snapshot.docs) {
    const subId = docSnap.id;

    if (subcollectionName === "comments") {
      const repliesRef = collection(db, "tweets", tweetId, "comments", subId, "replies");
      const repliesSnap = await getDocs(repliesRef);
      for (const replyDoc of repliesSnap.docs) {

        const replyLikesRef = collection(db, "tweets", tweetId, "comments", subId, "replies", replyDoc.id, "likes");
        const replyLikesSnap = await getDocs(replyLikesRef);
        await Promise.all(replyLikesSnap.docs.map(like =>
          deleteDoc(like.ref)
        ));

        await deleteDoc(replyDoc.ref);
      }

      const commentLikesRef = collection(db, "tweets", tweetId, "comments", subId, "likes");
      const commentLikesSnap = await getDocs(commentLikesRef);
      await Promise.all(commentLikesSnap.docs.map(like =>
        deleteDoc(like.ref)
      ));
    }

    await deleteDoc(docSnap.ref);
  }
}

document.body.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest(".delete-btn");
  if (deleteBtn) {
    const tweetId = deleteBtn.dataset.id;
    const userId = auth.currentUser.uid;

    if (confirm("Are you sure you want to delete this wint?")) {
      const tweetRef = doc(db, "tweets", tweetId);
      const tweetSnap = await getDoc(tweetRef);

      if (!tweetSnap.exists()) return;
      const data = tweetSnap.data();

      const tagDeletes = (data.tags || []).map(tag =>
        deleteDoc(doc(db, "tags", tag, "tweets", tweetId))
      );

      const mentionDeletes = (data.mentions || []).map(uid =>
        deleteDoc(doc(db, "users", uid, "mentioned", tweetId))
      );

      await Promise.all([
        deleteSubcollectionDocs(tweetId, "comments"),
        deleteSubcollectionDocs(tweetId, "likes"),
        deleteSubcollectionDocs(tweetId, "views"),
        deleteDoc(tweetRef),
        deleteDoc(doc(db, "users", userId, "posts", tweetId)),
        ...tagDeletes,
        ...mentionDeletes,
      ]);

      const el = document.getElementById("tweet-" + tweetId);
      if (el) el.remove();
    }
  }

});

const observer = new IntersectionObserver(async (entries, obs) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const el = entry.target;
      const tweetId = el.dataset.id;

      const viewRef = doc(db, "tweets", tweetId, "views", auth.currentUser.uid);
      const viewSnap = await getDoc(viewRef);
      if (!viewSnap.exists()) {
        await setDoc(viewRef, {
          viewedAt: new Date()
        });
      }

      obs.unobserve(el);
    }
  }
}, {
  threshold: 1.0
});

async function loadTweets(initial = false) {
  if (!isOnline) {
    showConnectionLost();
    return;
  }

  if (loadingMore || noMoreTweets) return;
  loadingMore = true;

  const loadingScreen = document.getElementById("loadingScreen");
  const logEl = document.getElementById("log");

  if (initial && loadingScreen) {
    loadingScreen.style.display = "flex";
    loadingScreen.style.opacity = "1";
    document.body.classList.add("no-scroll");
    if (logEl) logEl.textContent = "rendering wints...";
  }

  let qiqi = query(
    collection(db, "tweets"),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  if (!initial && lastTweet) {
    qiqi = query(
      collection(db, "tweets"),
      orderBy("createdAt", "desc"),
      startAfter(lastTweet),
      limit(30)
    );
  }

  const snap = await getDocs(qiqi);
  if (snap.empty) {
    noMoreTweets = true;
    loadingMore = false;
    if (initial && loadingScreen) loadingScreen.style.display = "none";
    return;
  }

  lastTweet = snap.docs[snap.docs.length - 1];

  let renderedCount = 0;

  for (let i = 0; i < snap.docs.length; i++) {
    const docSnap = snap.docs[i];
    const t = docSnap.data();
    const tweetId = docSnap.id;

    await renderTweet(t, tweetId, auth.currentUser);
    renderedCount++;

    if (initial && renderedCount === 3 && loadingScreen) {
      loadingScreen.style.opacity = "0";
      document.body.classList.remove("no-scroll");
      setTimeout(() => {
        loadingScreen.style.display = "none";
      }, 300);
    }
  }

  loadingMore = false;
}

document.body.addEventListener("click", async (e) => {
  const commentBtn = e.target.closest(".comment-btn");
  if (commentBtn) {
    const tweetId = commentBtn.dataset.id;
    document.getElementById("commentOverlay").classList.remove("hidden");

    const tweetEl = document.querySelector(`#tweet-${tweetId}`);
    const tweetText = tweetEl.querySelector("p")?.textContent || "";
    const tweetMediaEl = tweetEl.querySelector(".attachment")?.querySelector("img, video");
    const mediaSrc = tweetMediaEl?.getAttribute("src") || "";
    const isVideo = tweetMediaEl?.tagName === "VIDEO";
    const containsSpoiler = /\|\|.+?\|\|/.test(tweetText);

    const uid = auth.currentUser.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    const profile = userDoc.exists() ? userDoc.data() : {};

    let mediaHTML = "";
    if (mediaSrc) {
      if (isVideo) {
        mediaHTML = containsSpoiler ?
          `
        <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
          <div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>
          <video style="max-width: 100%; max-height: 300px;" muted controls>
            <source src="${mediaSrc}" type="video/mp4" />
          </video>
        </div>` :
          `
        <div class="attachment">
          <video controls style="max-width: 100%; max-height: 300px;">
            <source src="${mediaSrc}" type="video/mp4" />
          </video>
        </div>`;
      } else {
        mediaHTML = containsSpoiler ?
          `
        <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
          <div class="spoiler-overlay"><div class="spoilertxt">spoiler</div></div>
          <img src="${mediaSrc}" style="max-width: 100%; max-height: 300px; border-radius: 15px;" alt="image" />
        </div>` :
          `
        <div class="attachment">
          <img src="${mediaSrc}" style="max-width: 100%; max-height: 300px; border-radius: 15px;" alt="image" />
        </div>`;
      }
    }

    document.getElementById("commentTweet").innerHTML = `
    <p>${linkify(tweetText)}</p>
    ${mediaHTML}
  `;

    applyReadMoreLogic(commentTweet);


    document.getElementById("sendComment").onclick = async () => {
      const commentText = document.getElementById("commentInput").value.trim();
      const file = document.querySelector(".comment-media-input").files[0];
      const user = auth.currentUser;
      let media = "",
        mediaType = "";

      if (file) {
        mediaType = "image";
        media = await resizeImage(file);
        if (media.length > 1048487) {
          alert("Image is too large.");
          return;
        }
      }

      if (commentText || media) {
        await addDoc(collection(db, "tweets", tweetId, "comments"), {
          text: commentText,
          media,
          mediaType,
          uid: user.uid,
          createdAt: new Date()
        });
        document.getElementById("commentInput").value = "";
        document.querySelector(".comment-media-input").value = "";
        document.getElementById("commentPreview").innerHTML = "";
        loadComments(tweetId);
      }
    };
    loadComments(tweetId);
    document.body.classList.add('no-scroll');
  }

  const bookmarkBtn = e.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    const btn = bookmarkBtn;
    const tweetId = btn.id.replace("bookmarkBtn-", "");
    const bookmarkRef = doc(db, "users", auth.currentUser.uid, "bookmarks", tweetId);

    const snap = await getDoc(bookmarkRef);

    if (snap.exists()) {
      await deleteDoc(bookmarkRef);
      btn.innerHTML = `<img src="image/bookmark.svg">`;
    } else {
      await setDoc(bookmarkRef, {
        bookmarkedAt: new Date()
      });
      btn.innerHTML = `<img src="image/bookmark-filled.svg">`;
    }
  }

});

document.getElementById("closeComment").onclick = () => {
  document.getElementById("commentOverlay").classList.add("hidden");
  document.body.classList.remove('no-scroll');
};

let activeReplyCommentId = null;

document.body.addEventListener("click", async (e) => {
  const replyBtn = e.target.closest(".reply-btn");
  if (replyBtn) {
    activeReplyCommentId = e.target.dataset.id;
    document.getElementById("replyInputBox").classList.remove("hidden");
    document.getElementById("replyInput").focus();
  }
});

async function loadComments(tweetId) {
  const q = query(collection(db, "tweets", tweetId, "comments"), orderBy("createdAt"));

  const snap = await getDocs(q);
  const list = document.getElementById("commentList");
  list.innerHTML = `<div class="comment-scrollbox" id="commentWrapper"></div>`;
  const wrapper = document.getElementById("commentWrapper");

  const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
  if (!tweetDoc.exists()) return;

  const tweetData = tweetDoc.data();
  const pinnedCommentId = tweetData.pinnedCommentId || null;
  const tweetOwnerId = tweetData.uid;
  const isOwner = auth.currentUser.uid === tweetOwnerId;

  const inputBox = document.querySelector("#commentInput");
  if (inputBox) inputBox.style.display = "block";
  const skibidi = document.querySelector('#skibidi');
  if (skibidi) skibidi.style.display = "flex";

  let pinnedCommentHTML = null;

  const permission = tweetData.replyPermission || "everyone";
  let canComment = true;

  if (permission === "following") {
    const followingDoc = await getDoc(
      doc(db, "users", tweetOwnerId, "following", auth.currentUser.uid)
    );
    canComment = followingDoc.exists();
  } else if (permission === "mentioned") {
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const displayName = userDoc.exists() ? userDoc.data().displayName : null;

    if (displayName) {
      const mentions = tweetData.text.match(/@(\w+)/g) || [];
      canComment = mentions.some(m => m.slice(1) === displayName);
    } else {
      canComment = false;
    }
  }

  const commentStatus = document.getElementById("comment-status");
  if (commentStatus) {
    if (permission === "everyone") {
      commentStatus.innerHTML = "";
    } else if (permission === "following") {
      commentStatus.innerHTML = `<img src="image/exclamation.svg"> the creator has chosen only people they follow can comment`;
    } else if (permission === "mentioned") {
      commentStatus.innerHTML = `<img src="image/exclamation.svg"> the creator has chosen only people they mention can comment`;
    }
  }

  for (const docSnap of snap.docs) {
    const commentId = docSnap.id;
    const isPinned = commentId === pinnedCommentId;
    const d = docSnap.data();

    const replyCountSnap = await getCountFromServer(
      collection(db, "tweets", tweetId, "comments", commentId, "replies")
    );
    const replyCount = replyCountSnap.data().count;

    let displayName = d.name;
    let avatar = d.photoURL;

    try {
      const userDoc = await getDoc(doc(db, "users", d.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        displayName = userData.displayName || displayName;
        avatar = userData.photoURL || avatar;
      }
    } catch (err) {
      console.warn("Could not fetch user profile:", err);
    }

    const replyButtonHTML = `
      <button class="toggle-replies-btn link" data-id="${commentId}" data-tweet="${tweetId}" data-open="false">
        ${replyCount > 0 ? `View replies (${replyCount})` : "Reply"}
      </button>`;

    const commentHTML = document.createElement("div");
    commentHTML.className = "comment-item";

    const commentLikeRef = doc(db, "tweets", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    const commentLikeSnap = await getDoc(commentLikeRef);
    const isCommentLiked = commentLikeSnap.exists();

    const commentLikeCountSnap = await getCountFromServer(
      collection(db, "tweets", tweetId, "comments", commentId, "likes")
    );
    const commentLikeCount = commentLikeCountSnap.data().count;

    commentHTML.innerHTML = `
      <div class="flex" id="pinned" style="gap:3px;display:none;">
      <img src="image/pin.svg" style="width:22px;height:22px;">
      <p style="color:grey;margin:0;font-size:13px;">pinned by the creator</p>
      </div>
      <div class="flex comment-header" style="gap:10px">
        <img src="${escapeHTML(avatar)}" onerror="this.src='image/default-avatar.jpg'" class="avatar comment-avatar">
        <strong class="user-link" data-uid="${d.uid}" style="cursor:pointer">${escapeHTML(displayName)}</strong>
        <span class="comment-date">${formatDate(d.createdAt)}</span>
      </div>
      <div class="comment-body">
        <p class="no-margin">${linkify(d.text)}</p>
        ${d.media && d.mediaType === "image" ? `<img src="${d.media}" class="attachment1" style="max-width:100%;max-height:200px;margin-bottom:5px;border-radius:8px">` : ""}
        <div class="flex">
          <span class="comment-like-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer">
            ${isCommentLiked ? `<img src="image/filled-heart.svg">` : `<img src="image/heart.svg">`}
            <span id="comment-like-count-${commentId}">${commentLikeCount}</span>
          </span>
          ${auth.currentUser.uid === d.uid ? `
            <span class="comment-delete-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;margin-left:auto;"><img src="image/trash.svg"></span>` : ""}
        </div>
        <div class="reply-actions">${replyButtonHTML}</div>
        <div class="flex pin-comment-btn" style="display:none; width: 100%;">
  <button style="margin-left:auto; cursor:pointer; background:none; border:none; color:gray; font-size:13px;">
    pin comment
  </button>
</div>
        <div class="reply-box hidden" id="reply-box-${commentId}">
          <textarea class="reply-text" placeholder="thoughts...?"></textarea>
          <div class="attachment" id="replyPreview-${commentId}"></div>
          <div class="flex">
            <button class="send-reply-btn" data-id="${commentId}">Post</button>
            <input type="file" id="replyMedia-${commentId}" class="comment-media-input hidden-input" accept="image/*" />
            <label class="custom-file-btn" for="replyMedia-${commentId}"><img src="image/upload.svg"></label>
            <button style="margin-left:auto" class="cancel-reply-btn no-bg">Cancel</button>
          </div>
          <div class="reply-list" id="replies-${commentId}"></div>
        </div>
      </div>
    `;

    if (!canComment && !isOwner) {
      const inputBox = document.querySelector("#commentInput");
      if (inputBox) inputBox.style.display = 'none';
      const skibidi = document.querySelector('#skibidi');
      if (skibidi) skibidi.style.display = "none";

      const replyBoxEl = commentHTML.querySelector(`#reply-box-${commentId}`);
      if (replyBoxEl) {
        const textArea = replyBoxEl.querySelector(".reply-text");
        const sendBtn = replyBoxEl.querySelector(".send-reply-btn");
        const fileInput = replyBoxEl.querySelector(".comment-media-input");
        const label = replyBoxEl.querySelector(".custom-file-btn");
        const cancelBtn = replyBoxEl.querySelector(".cancel-reply-btn");
        const attachmentBox = replyBoxEl.querySelector(".attachment");

        if (textArea) textArea.remove();
        if (sendBtn) sendBtn.remove();
        if (fileInput) fileInput.remove();
        if (label) label.remove();
        if (cancelBtn) cancelBtn.remove();
        if (attachmentBox) attachmentBox.remove();
      }
    }

    if (isOwner) {
      const pinBtnContainer = commentHTML.querySelector(".pin-comment-btn");
      const pinBtn = pinBtnContainer.querySelector("button");

      pinBtn.textContent = isPinned ? "unpin comment" : "pin comment";

      pinBtn.onclick = async () => {
        await updateDoc(doc(db, "tweets", tweetId), {
          pinnedCommentId: isPinned ? null : commentId
        });
        await loadComments(tweetId);
      };

      if (isPinned) {
        pinBtnContainer.style.display = "flex";
      } else {
        commentHTML.addEventListener("mouseenter", () => {
          pinBtnContainer.style.display = "flex";
        });
        commentHTML.addEventListener("mouseleave", () => {
          pinBtnContainer.style.display = "none";
        });
      }
    }

    const repliesQ = query(collection(db, "tweets", tweetId, "comments", commentId, "replies"), orderBy("createdAt"));
    const repliesSnap = await getDocs(repliesQ);
    const replyContainer = commentHTML.querySelector(`#replies-${commentId}`);
    repliesSnap.forEach(rSnap => {
      const r = rSnap.data();
      replyContainer.innerHTML += `
        <div>
          <div class="flex comment-header" style="gap:10px">
            <img src="${r.photoURL}" class="avatar comment-avatar">
            <strong>${r.name}</strong>
          </div>
          <p>${linkify(r.text)}</p>
        </div>
      `;
    });

    applyReadMoreLogic(commentHTML);

    const pinned = commentHTML.querySelector('#pinned');

    if (isPinned) {
      if (pinned) pinned.style.display = 'flex';
      pinnedCommentHTML = commentHTML;
    } else {
      wrapper.appendChild(commentHTML);
      if (pinned) pinned.style.display = 'none';
    }
  }

  if (pinnedCommentHTML) {
    wrapper.insertBefore(pinnedCommentHTML, wrapper.firstChild);
  }
}

const REPLY_PAGE_SIZE = 10;
let loadedReplies = {};
let activeTweetId = null;

document.body.addEventListener("click", async (e) => {

  const toggleRepliesBtn = e.target.closest(".toggle-replies-btn");
  if (toggleRepliesBtn) {
    const commentId = e.target.dataset.id;
    const isOpen = e.target.dataset.open === "true";
    const replyBox = document.getElementById(`reply-box-${commentId}`);
    const list = document.getElementById("replies-" + commentId);

    const tweetId = e.target.dataset.tweet;
    if (!tweetId) {
      console.error("No tweet ID found on toggle button");
      return;
    }

    if (!isOpen) {
      e.target.textContent = "Close";
      e.target.dataset.open = "true";
      replyBox.classList.remove("hidden");
      list.innerHTML = "";
      loadedReplies[commentId] = 0;
      await loadReplies(tweetId, commentId);
    } else {
      const replyCount = list.childElementCount;
      e.target.textContent = replyCount < 1 ? "Reply" : `View replies (${replyCount})`;
      e.target.dataset.open = "false";
      replyBox.classList.add("hidden");
    }
  }

  const sendReplyBtn = e.target.closest(".send-reply-btn");
  if (sendReplyBtn) {
    const commentId = e.target.dataset.id;
    const box = e.target.closest(".reply-box");
    const textarea = box.querySelector(".reply-text");
    const file = box.querySelector(".comment-media-input")?.files[0];
    const text = textarea.value.trim();
    const tweetId = box.closest(".comment-item").querySelector(".comment-like-btn")?.dataset.tweet;

    const uid = auth.currentUser.uid;
    const user = auth.currentUser;
    const userDoc = await getDoc(doc(db, "users", uid));
    const profile = userDoc.exists() ? userDoc.data() : {};

    let media = "",
      mediaType = "";

    if (file) {
      mediaType = "image";
      media = await resizeImage(file);
      if (media.length > 1048487) {
        alert("Image is too large.");
        return;
      }
    }

    if (!text && !media) return;

    await addDoc(collection(db, "tweets", tweetId, "comments", commentId, "replies"), {
      text,
      media,
      mediaType,
      uid: user.uid,
      createdAt: new Date()
    });

    textarea.value = "";
    if (box.querySelector(".comment-media-input")) {
      box.querySelector(".comment-media-input").value = "";
    }
    const preview = document.getElementById(`replyPreview-${commentId}`);
    if (preview) preview.innerHTML = "";

    loadedReplies[commentId] = 0;
    document.getElementById("replies-" + commentId).innerHTML = "";
    await loadReplies(tweetId, commentId);
  }

  const cancelReplyBtn = e.target.closest(".cancel-reply-btn");
  if (cancelReplyBtn) {
    const box = e.target.closest(".reply-box");
    box.classList.add("hidden");
    const toggleBtn = box.parentElement.querySelector(".toggle-replies-btn");
    toggleBtn.dataset.open = "false";
    const replyCount = box.querySelector(".reply-list").childElementCount;
    toggleBtn.textContent = replyCount < 1 ? "Reply" : `View replies (${replyCount})`;
  }

  const loadMoreReplies = e.target.closest(".load-more-replies");
  if (loadMoreReplies) {
    const commentId = e.target.dataset.id;
    const tweetId = e.target.dataset.tweet;
    await loadReplies(tweetId, commentId);
  }

  const overlay = document.getElementById("mediaOverlay");
  const overlayContent = document.getElementById("overlayContent");

  if (e.target.tagName === "IMG" && (
      e.target.closest(".attachment") ||
      e.target.closest(".attachment1") ||
      e.target.closest(".rt-attachment") ||
      e.target.closest(".attachment2")
    )) {
    overlay.classList.remove("hidden");
    overlayContent.innerHTML = `<img src="${e.target.src}" />`;
  }

  if (e.target.tagName === "VIDEO" || (e.target.tagName === "SOURCE" && e.target.closest("video"))) {
    const video = e.target.closest("video");
    if (video && video.src) {
      overlay.classList.remove("hidden");
      overlayContent.innerHTML = `
        <video src="${video.src}" controls autoplay style="max-width: 90%; max-height: 90%;"></video>
      `;
    }
  }

  if (e.target.id === "closeOverlay") {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";
  }
});

async function loadReplies(tweetId, commentId) {
  const replyList = document.getElementById("replies-" + commentId);
  const offset = loadedReplies[commentId] || 0;
  replyList.innerHTML = "";

  const repliesQ = query(
    collection(db, "tweets", tweetId, "comments", commentId, "replies"),
    orderBy("createdAt")
  );
  const allReplies = await getDocs(repliesQ);
  const replyDocs = allReplies.docs.slice(offset, offset + REPLY_PAGE_SIZE);

  for (const rDoc of replyDocs) {
    const r = rDoc.data();
    const rId = rDoc.id;

    const replylikeRef = doc(
      db,
      "tweets",
      tweetId,
      "comments",
      commentId,
      "replies",
      rId,
      "likes",
      auth.currentUser.uid
    );
    const replylikedSnap = await getDoc(replylikeRef);
    const replyisLiked = replylikedSnap.exists();

    let displayName = r.name;
    let avatar = r.photoURL;

    try {
      const userDoc = await getDoc(doc(db, "users", r.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        displayName = userData.displayName || displayName;
        avatar = userData.photoURL || avatar;
      }
    } catch (err) {
      console.warn("Could not fetch user profile:", err);
    }

    const replylikeCountSnap = await getCountFromServer(
      collection(
        db,
        "tweets",
        tweetId,
        "comments",
        commentId,
        "replies",
        rId,
        "likes"
      )
    );
    const replylikeCount = replylikeCountSnap.data().count;

    replyList.innerHTML += `
      <div class="reply-block">
        <div class="flex comment-header" style="gap:10px">
          <img src="${escapeHTML(avatar)}" onerror="this.src='image/default-avatar.jpg'" class="avatar comment-avatar">
          <strong class="user-link" data-uid="${r.uid}" style="cursor:pointer">${escapeHTML(displayName)}</strong>
          <span class="reply-date">${formatDate(r.createdAt)}</span>
        </div>
        <p class="little-margin">${linkify(r.text)}</p>
${r.media && r.mediaType === "image" ? `<img src="${r.media}" class="attachment1" style="max-width:100%;max-height:200px;margin-bottom:5px;border-radius:8px">` : ""}
        <div class="flex">
        <span class="reply-like-btn" data-reply="${rId}" data-comment="${commentId}" data-tweet="${tweetId}" style="cursor:pointer">
  ${replyisLiked ? `<img src="image/filled-heart.svg">` : `<img src="image/heart.svg">`} <span id="reply-like-count-${rId}">${replylikeCount}</span></span>
      ${auth.currentUser.uid === r.uid ? `<span class="reply-delete-btn" data-comment="${commentId}" data-reply="${rId}" data-tweet="${tweetId}" style="cursor:pointer;margin-left:auto;"><img src="image/trash.svg"></span>
` : ""}
      </div>
</div>
    `;
  }

  loadedReplies[commentId] = offset + replyDocs.length;
  const remaining = allReplies.docs.length - loadedReplies[commentId];
  let loadMoreBtn = replyList.querySelector(".load-more-replies");
  applyReadMoreLogic(replyList);
  if (loadMoreBtn) loadMoreBtn.remove();
  if (remaining > 0) {
    replyList.innerHTML += `<button class="load-more-replies link" data-id="${commentId}" data-tweet="${tweetId}">Load more replies (${remaining})</button>`;
  }
}

document.body.addEventListener("click", async (e) => {

  const commentLikeBtn = e.target.closest(".comment-like-btn");
  if (commentLikeBtn) {
    const tweetId = commentLikeBtn.dataset.tweet;
    const commentId = commentLikeBtn.dataset.id;
    const icon = commentLikeBtn.querySelector("img");
    const countSpan = document.getElementById(`comment-like-count-${commentId}`);
    const ref = doc(db, "tweets", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await deleteDoc(ref);
      if (icon) icon.src = "image/heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 1) - 1}`;

    } else {
      await setDoc(ref, {
        likedAt: new Date()
      });
      if (icon) icon.src = "image/filled-heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 0) + 1}`;
    }
  }

  const replyLikeBtn = e.target.closest(".reply-like-btn");
  if (replyLikeBtn) {
    const tweetId = replyLikeBtn.dataset.tweet;
    const commentId = replyLikeBtn.dataset.comment;
    const replyId = replyLikeBtn.dataset.reply;
    const icon = replyLikeBtn.querySelector("img");
    const countSpan = document.getElementById(`reply-like-count-${replyId}`);
    const ref = doc(db, "tweets", tweetId, "comments", commentId, "replies", replyId, "likes", auth.currentUser.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await deleteDoc(ref);
      if (icon) icon.src = "image/heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 1) - 1}`;
    } else {
      await setDoc(ref, {
        likedAt: new Date()
      });
      if (icon) icon.src = "image/filled-heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 0) + 1}`;
    }
  }

  if (e.target.closest(".like-btn")) {
    const btn = e.target.closest(".like-btn");
    const tweetId = btn.id.replace("likeBtn-", "");
    const countSpan = document.getElementById(`likeCount-${tweetId}`);

    const tweetLikeRef = doc(db, "tweets", tweetId, "likes", auth.currentUser.uid);
    const snap = await getDoc(tweetLikeRef);

    if (snap.exists()) {
      await deleteDoc(tweetLikeRef);

      btn.innerHTML = `<img src="image/heart.svg"><span id="likeCount-${tweetId}">${(parseInt(countSpan.textContent) || 1) - 1}</span>`;
      await updateDoc(doc(db, "tweets", tweetId), {
        likeCount: increment(-1)
      });

    } else {
      const likeData = {
        likedAt: new Date()
      };
      await setDoc(tweetLikeRef, likeData);

      btn.innerHTML = `<img src="image/filled-heart.svg"><span id="likeCount-${tweetId}">${(parseInt(countSpan.textContent) || 0) + 1}</span>`;
      await updateDoc(doc(db, "tweets", tweetId), {
        likeCount: increment(1)
      });

    }
  }

  const commentDeleteBtn = e.target.closest(".comment-delete-btn");
  if (commentDeleteBtn) {
    const tweetId = commentDeleteBtn.dataset.tweet;
    const commentId = commentDeleteBtn.dataset.id;
    if (confirm("Delete this comment?")) {
      await deleteDoc(doc(db, "tweets", tweetId, "comments", commentId));
      loadComments(tweetId);
    }
  }

  const replyDeleteBtn = e.target.closest(".reply-delete-btn");
  if (replyDeleteBtn) {
    const tweetId = replyDeleteBtn.dataset.tweet;
    const commentId = replyDeleteBtn.dataset.comment;
    const replyId = replyDeleteBtn.dataset.reply;
    if (confirm("Delete this reply?")) {
      await deleteDoc(doc(db, "tweets", tweetId, "comments", commentId, "replies", replyId));
      loadedReplies[commentId] = 0;
      await loadReplies(tweetId, commentId);
    }
  }

});

let selectedRetweet = null;

const bookmark = document.getElementById('bookmarkOverlay');
const profile = document.getElementById('profileOverlay');
const profilesub = document.getElementById('profileSubOverlay');
const user = document.getElementById('userOverlay');
const usersub = document.getElementById('userSubOverlay');
const tag = document.getElementById('tagSubOverlay');
const follow = document.getElementById('followOverlay');
const viewer = document.getElementById('tweetViewer');

const bookmarksvg = document.querySelector('.smallbar img[src="image/bookmark.svg"]');
const homesvg = document.querySelector('.smallbar img[src="image/home.svg"]');
const usersvg = document.querySelector('.smallbar img[src="image/user.svg"]')
const searchsvg = document.querySelector('.smallbar img[src="image/search.svg"]')
const settingssvg = document.querySelector('.smallbar img[src="image/settings.svg"]')

const bookmarkfilled = document.querySelector('.smallbar img[src="image/bookmark-filled.svg"]');
const homefilled = document.querySelector('.smallbar img[src="image/home-filled.svg"]');
const userfilled = document.querySelector('.smallbar img[src="image/user-filled.svg"]')
const searchfilled = document.querySelector('.smallbar img[src="image/search-filled.svg"]')
const settingsfilled = document.querySelector('.smallbar img[src="image/settings-filled.svg"]')

document.body.addEventListener("click", async (e) => {
  const retweetBtn = e.target.closest(".retweet-btn");
  if (!retweetBtn) return;

  document.body.classList.remove("no-scroll");

  const tweetId = retweetBtn.dataset.id;
  selectedRetweet = tweetId;

  const docSnap = await getDoc(doc(db, "tweets", tweetId));
  if (!docSnap.exists()) return;

  const t = docSnap.data();

  const date = new Date(t.createdAt.seconds * 1000);
  const dateStr = `${date.getDate()} ${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()} • ${date.getHours()}.${String(date.getMinutes()).padStart(2, '0')}`;

  const retweetQuery = query(collection(db, "tweets"), where("retweetOf", "==", tweetId));
  const retweetSnap = await getCountFromServer(retweetQuery);
  const retweetCount = retweetSnap.data().count;

  let retweetMediaHTML = "";
  if (t.media && t.mediaType === "image") {
    retweetMediaHTML = `<div class="attachment"><img src="${t.media}" style="max-width: 100%; max-height: 300px" alt="tweet image" /></div>`;
  } else if (t.media && t.mediaType === "video") {
    retweetMediaHTML = `
      <div class="attachment">
        <video controls style="max-width: 100%; max-height: 300px">
          <source src="${t.media}" type="video/mp4" />
        </video>
      </div>`;
  }

  let displayName = t.displayName;
  let avatar = t.photoURL;

  try {
    const userDoc = await getDoc(doc(db, "users", t.uid));
    if (userDoc.exists()) {
      const u = userDoc.data();
      displayName = u.displayName || displayName;
      avatar = u.photoURL || avatar;
    }
  } catch (err) {
    console.warn("Couldn't fetch author profile:", err);
  }

  document.getElementById("retweetOriginal").innerHTML = `
    <div class="tweet retweet">
      <div class="flex" style="gap:10px">
        <img class="avatar" src="${avatar}" onerror="this.src='image/default-avatar.jpg'" width="30">
        <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px">${escapeHTML(displayName)}</strong>
        <span style="color:grey;font-size:13px">${dateStr}</span>
      </div>
      <p>${linkify(t.text)}</p>
      ${retweetMediaHTML}
    </div>
  `;

  document.getElementById("retweetOverlay").classList.remove("hidden");
  applyReadMoreLogic(document.getElementById("retweetOriginal"));

  follow?.classList.add('hidden');
  profile?.classList.add('hidden');
  profilesub?.classList.add('hidden');
  user?.classList.add('hidden');
  usersub?.classList.add('hidden');
  bookmark?.classList.add('hidden');
  tag?.classList.add('hidden');
  viewer?.classList.add('hidden');

  settingsfilled?.classList.add('hidden');
  homesvg?.classList.add('hidden');
  bookmarkfilled?.classList.add('hidden');
  userfilled?.classList.add('hidden');
  searchfilled?.classList.add('hidden');

  settingssvg?.classList.remove('hidden');
  usersvg?.classList.remove('hidden');
  searchsvg?.classList.remove('hidden');
  bookmarksvg?.classList.remove('hidden');
  homefilled?.classList.remove('hidden');

  document.body.classList.add('no-scroll');
});

document.getElementById("sendRetweet").onclick = async () => {
  const text = document.getElementById("retweetText").value.trim();
  const originalId = selectedRetweet;
  const file = document.getElementById("retweetMediaInput").files[0];

  const user = auth.currentUser;
  const uid = user?.uid;
  if (!uid || !originalId) return;

  let media = "";
  let mediaType = "";

  try {
    if (file) {
      mediaType = file.type.startsWith("video/") ? "video" : "image";
      media = mediaType === "image" ?
        await resizeImage(file) :
        await readFileAsBase64(file);

      if (media.length > 1048487) {
        alert("Media is too large.");
        return;
      }
    }

    const tweetRef = await addDoc(collection(db, "tweets"), {
      text,
      retweetOf: originalId,
      media,
      mediaType,
      likeCount: 0,
      createdAt: new Date(),
      uid
    });

    const mentionsRaw = await extractMentions(text);
    const mentions = mentionsRaw.map(m => m.uid);

    if (mentions.length > 0) {
      await updateDoc(tweetRef, {
        mentions
      });

      await Promise.all(
        mentions.map(mentionUid =>
          setDoc(doc(db, "users", mentionUid, "mentioned", tweetRef.id), {
            mentionedAt: new Date()
          })
        )
      );
    }

    await handleTags(text, tweetRef.id);

    await setDoc(doc(db, "users", uid, "posts", tweetRef.id), {
      exists: true
    });

    document.getElementById("retweetText").value = "";
    document.getElementById("retweetMediaInput").value = "";
    document.getElementById("retweetPreview").innerHTML = "";
    document.getElementById("retweetOverlay").classList.add("hidden");
    document.body.classList.remove('no-scroll');

  } catch (error) {
    if (error.message.includes("The value of property \"media\" is longer than")) {
      alert("Media file is too large");
    } else {
      console.error("❌ Retweet failed:", error);
    }
  }
};

function showImagePreview(fileInput, previewContainerId) {
  const file = fileInput.files[0];
  const preview = document.getElementById(previewContainerId);
  preview.innerHTML = "";

  if (file && file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.src = reader.result;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "300px";
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  }
}

document.body.addEventListener("change", (e) => {
  if (e.target.classList.contains("comment-media-input") && e.target.closest(".reply-box")) {
    const commentId = e.target.closest(".reply-box").id.replace("reply-box-", "");
    showImagePreview(e.target, `replyPreview-${commentId}`);
  }
});

document.getElementById("mediaInput").addEventListener("change", () => {
  showImagePreview(document.getElementById("mediaInput"), "tweetPreview");
});

document.getElementById("commentMediaInput").addEventListener("change", () => {
  showImagePreview(document.getElementById("commentMediaInput"), "commentPreview");
});

document.getElementById("retweetMediaInput").addEventListener("change", () => {
  showImagePreview(document.getElementById("retweetMediaInput"), "retweetPreview");
});

document.body.addEventListener("click", async (e) => {
  const userLink = e.target.closest(".user-link");
  if (userLink && userLink.dataset.uid) {
    const uid = userLink.dataset.uid;
    if (uid) {
      await window.openUserSubProfile(uid);
      document.getElementById('commentOverlay').classList.add('hidden');
      document.body.classList.add("no-scroll");
      document.getElementById('userOverlay').classList.remove('hidden');
      document.querySelector('.smallbar img[src="image/home-filled.svg"]').classList.add('hidden');
      document.querySelector('.smallbar img[src="image/home.svg"]').classList.remove('hidden');
      document.querySelector('.smallbar img[src="image/search.svg"]').classList.add('hidden');
      document.querySelector('.smallbar img[src="image/search-filled.svg"]').classList.remove('hidden');
      document.getElementById('followOverlay').classList.add('hidden');
    }
  }
});

document.body.addEventListener("click", async (e) => {
  const tagLink = e.target.closest(".tag-link");
  if (tagLink && tagLink.dataset.tag) {
    const tag = tagLink.dataset.tag;
    if (tag) {
      document.getElementById('tweetViewer')?.classList.add('hidden');
      document.getElementById('profileOverlay')?.classList.add('hidden');
      document.getElementById('commentOverlay')?.classList.add('hidden');
      document.body.classList.add("no-scroll");
      document.getElementById('userOverlay')?.classList.remove('hidden');
      document.querySelector('.smallbar img[src="image/home-filled.svg"]')?.classList.add('hidden');
      document.querySelector('.smallbar img[src="image/home.svg"]')?.classList.remove('hidden');
      document.querySelector('.smallbar img[src="image/user-filled.svg"]')?.classList.add('hidden');
      document.querySelector('.smallbar img[src="image/user.svg"]')?.classList.remove('hidden');
      document.querySelector('.smallbar img[src="image/bookmark-filled.svg"]')?.classList.add('hidden');
      document.querySelector('.smallbar img[src="image/bookmark.svg"]')?.classList.remove('hidden');
      document.querySelector('.smallbar img[src="image/search.svg"]').classList.add('hidden');
      document.querySelector('.smallbar img[src="image/search-filled.svg"]').classList.remove('hidden');
      document.getElementById('followOverlay')?.classList.add('hidden');
      window.openTag(tag);
    }
  }
});
