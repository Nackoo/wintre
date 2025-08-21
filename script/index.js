import { app, auth, db, storage, initializeApp, getAuth, increment, onAuthStateChanged, getFirestore, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, getStorage, ref, uploadBytes, getDownloadURL, updateDoc } from "./firebase.js";
import { extractMentions } from './mention.js';
import { handleTags } from './tags.js';
import { sendCommentNotification, sendReplyNotification, listenForUnreadNotifications, loadNotifications, sendMentionNotification, sendRetweetNotification, sendReplyMentionNotification, sendCommentMentionNotification } from './notification.js';
import { createClient, SUPABASE_URL, SUPABASE_ANON_KEY, MAX_FILE_BYTES, supabase } from "./firebase.js";
import { uploadToSupabase, compressImageTo480, showImagePreview, readFileAsBase64, setupVideoAutoplayOnVisibility } from "./attachments.js";
import { bookmark, profile, profilesub, user, usersub, tag, viewer, tweet, retweet, notification, comment, bookmarksvg, homesvg, usersvg, searchsvg, settingssvg, notifsvg, bookmarkfilled, homefilled, userfilled, searchfilled, settingsfilled, notiffilled } from "./nonsense.js"
import { viewTweet } from "./tweetViewer.js";
import { tokenize, formatDate, linkify, applyReadMoreLogic, parseMentionsToLinks, escapeHTML } from "./texts.js";

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
    if (logEl) logEl.textContent = "connection lost...";
  }
}

async function retryWhenBackOnline() {
  const loadingScreen = document.getElementById("loadingScreen");
  const logEl = document.getElementById("log");

  if (logEl) logEl.textContent = "connection restored";
  loadingScreen.style.display = "none";
  loadingScreen.style.opacity = "0";
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loadTweets(true);
    renderTweets(user);
    loadNotifications(true);
    listenForUnreadNotifications();

    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {

      const rawName = user.displayName || "user";
      const baseName = rawName.replace(/[^a-zA-Z0-9._-]/g, "") || "user";

      let finalName = baseName;
      let suffix = 1;

      while (suffix <= 100) {
        const querySnapshot = await getDocs(query(collection(db, "users"), where("displayName", "==", finalName)));
        if (querySnapshot.empty) {
          break;
        }
        finalName = `${baseName}${suffix}`;
        suffix++;
      }
      await setDoc(ref, {
        displayName: finalName,
        createdAt: new Date(),
        posts: 0
      });
    } else {
      const data = snap.data();
      const updateData = {};
      if (!data.createdAt) {
        updateData.createdAt = new Date();
      }
      if (!data.photoURL) {
        updateData.photoURL = '/image/default-avatar.jpg';
      }
      if (!("posts" in data)) {
        updateData.posts = 0;
      }
      if (!("displayName" in data)) {
        const rawName = user.displayName || "user";
        const baseName = rawName.replace(/[^a-zA-Z0-9._-]/g, "") || "user";
        let finalName = baseName;
        let suffix = 1;
        while (suffix <= 100) {
          const querySnapshot = await getDocs(query(collection(db, "users"), where("displayName", "==", finalName)));
          if (querySnapshot.empty) {
            break;
          }
          finalName = `${baseName}${suffix}`;
          suffix++;
        }
        updateData.displayName = finalName;
      }
      if (Object.keys(updateData).length > 0) {
        await setDoc(ref, updateData, {
          merge: true
        });
      }
    }
  } else {
    window.location.href = "/user/login";
  }
});

document.getElementById("postBtn").addEventListener("click", async () => {
  const btn = document.getElementById("postBtn");
  btn.disabled = true;
  btn.classList.add('disabled');

  const user = auth.currentUser;
  if (!user) {
    btn.disabled = false;
    btn.classList.remove('disabled');
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.cooldown?.toDate) {
      const now = new Date();
      const cooldownTime = data.cooldown.toDate();
      if (now < cooldownTime) {
        const diffMs = cooldownTime - now;
        const diffMins = Math.ceil(diffMs / 60000);
        alert(`Cooldown resets in ${diffMins} minute${diffMins > 1 ? 's' : ''}`);
        btn.disabled = false;
        btn.classList.remove('disabled');
        return;
      }
    }
  }

  const text = document.getElementById("tweetInput").value.trim();
  const fileInput = document.getElementById("mediaInput");
  const file = fileInput.files[0];

  if (file && file.size > 3 * 1024 * 1024) {
    alert("File size exceeds 3MB. Please choose a smaller file.");
    btn.disabled = false;
    btn.classList.remove('disabled');
    return;
  }

  let mediaURL = "";
  let mediaType = "";
  let mediaPath = "";

  try {
    if (file) {
      const upload = await uploadToSupabase(file, user.uid);
      mediaURL = upload.url;
      mediaType = upload.type;
      mediaPath = upload.path || "";
    }

    if (!text && !mediaURL) {
      btn.disabled = false;
      btn.classList.remove('disabled');
      return;
    }

    const permission = document.getElementById("replyPermission").value;
    const tagMatches = text.match(/#(\w+)/g) || [];
    const tags = [...new Set(tagMatches.map(tag => tag.slice(1).toLowerCase().slice(0, 30)))];

    const mentionsRaw = await extractMentions(text);
    const mentions = mentionsRaw.map(m => m.uid);

    const tweetRef = await addDoc(collection(db, "tweets"), {
      text,
      media: mediaURL,
      mediaType,
      mediaPath,
      createdAt: new Date(),
      searchTokens: tokenize(text),
      uid: user.uid,
      tags,
      replyPermission: permission,
      ...(mentions.length > 0 && {
        mentions
      })
    });

    for (const tagId of tags) {
      const tagRef = doc(db, "tags", tagId);
      await setDoc(tagRef, {
        name: tagId,
        tweetCount: increment(1)
      }, {
        merge: true
      });
      await setDoc(doc(tagRef, "tweets", tweetRef.id), {
        createdAt: new Date()
      });
    }

    await Promise.all(
      mentions.map(uid =>
        Promise.all([
          setDoc(doc(db, "users", uid, "mentioned", tweetRef.id), {
            mentionedAt: new Date()
          }),
          sendMentionNotification(tweetRef.id, uid)
        ])
      )
    );

    await handleTags(text, tweetRef.id);
    await setDoc(doc(db, "users", user.uid, "posts", tweetRef.id), {
      exists: true
    });
    await updateDoc(userRef, {
      posts: increment(1),
      cooldown: new Date(Date.now() + 15 * 60 * 1000)
    });

    document.getElementById("tweetInput").value = "";
    document.getElementById("mediaInput").value = "";
    document.getElementById("tweetPreview").innerHTML = "";

  } catch (error) {
    console.error("❌ Tweet failed:", error);
    alert(error.message || "Upload failed");
  }

  btn.disabled = false;
  btn.classList.remove('disabled');
  document.getElementById('tweetOverlay').classList.add('hidden');
});

async function renderTweets(user) {
  const q = query(collection(db, "tweets"), orderBy("likeCount", "desc"), orderBy("createdAt", "desc"));
  onSnapshot(q, async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      const docSnap = change.doc;
      const tweetId = docSnap.id;
      const t = docSnap.data();

      if (change.type === "added") {
        await renderTweet(t, tweetId, user, mode, container);
      }

      if (change.type === "removed") {
        const el = document.getElementById("tweet-" + tweetId);
        if (el) el.remove();
      }
    }
  });
}

function setupSoundToggle(tweetElement) {
  const btn = tweetElement.querySelector(".sound-toggle-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {

    const allVideos = document.querySelectorAll("video");

    const anyMuted = Array.from(allVideos).some(v => v.muted);

    allVideos.forEach(video => {
      video.muted = !anyMuted;
    });

    const allBtns = document.querySelectorAll(".sound-toggle-btn");
    allBtns.forEach(button => {
      button.innerHTML = anyMuted ? "<img src='/image/volume.svg'>" : "<img src='/image/volume-muted.svg'>";
    });
  });
}

async function getSupabaseVideo(fileUrl, videoId) {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("Failed to fetch video");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const videoEl = document.getElementById(videoId);
    if (videoEl) {

      videoEl.innerHTML = "";

      const source = document.createElement("source");
      source.src = objectUrl;
      source.type = blob.type || "video/mp4";
      videoEl.appendChild(source);

      videoEl.load();
    }
  } catch (err) {
    console.error("Failed to load Supabase video:", err);

    const videoEl = document.getElementById(videoId);
    if (videoEl) {
      videoEl.innerHTML = `<source src="${fileUrl}" type="video/mp4">`;
      videoEl.load();
    }
  }
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
  const commentCount = t.commentCount || 0;
  const retweetCount = t.retweetCount || 0;
  const dateStr = formatDate(t.createdAt);

  let mediaHTML = "";
  const containsSpoiler = /\|\|.+?\|\|/.test(t.text);

  if (t.media && t.mediaType === "image") {
    if (containsSpoiler) {
      mediaHTML = `
              <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
                <div class="spoiler-overlay">
                  <div class="spoilertxt">spoiler</div>
                </div>
                <img src="${t.media}" style="max-width: 100%; max-height: 300px; border-radius: 10px;" alt="tweet image" />
              </div>`;
    } else {
      mediaHTML = `
              <div class="attachment">
                <img src="${t.media}" style="max-width: 100%; max-height: 300px; border-radius: 10px;" alt="tweet image" />
              </div>`;
    }
  } else if (t.media && t.mediaType === "video") {
    if (containsSpoiler) {
      const vidId = t.id ? `vid-${t.id}` : `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

      mediaHTML = `
  <div class="attachment spoiler-media" style="position: relative; max-width: 100%; max-height: 300px;" onclick="this.classList.add('revealed')">
    <div class="spoiler-overlay">
      <div class="spoilertxt">spoiler</div>
    </div>
    <video id="${vidId}" muted controls style="max-width: 100%; max-height: 300px; border-radius: 10px;">
      Your browser does not support the video tag.
    </video>
    <button class="sound-toggle-btn" aria-label="Toggle sound" style="        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0,0,0,0.5);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        color: white;">
      <img src='/image/volume-muted.svg'>
    </button>
  </div>`;
      getSupabaseVideo(t.media, vidId);
    } else {
      const vidId = t.id ? `vid-${t.id}` : `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

      mediaHTML = `
  <div class="attachment" style="position: relative; max-width: 100%; max-height: 300px;">
    <video id="${vidId}" muted controls style="max-width: 100%; max-height: 300px; border-radius: 10px;">
      Your browser does not support the video tag.
    </video>
    <button class="sound-toggle-btn" aria-label="Toggle sound" style="position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0,0,0,0.5);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        color: white;">
      <img src='/image/volume-muted.svg'>
    </button>
  </div>`;
      getSupabaseVideo(t.media, vidId);
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
                  <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30">
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
                  <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName)}</strong>
                  <span style="color:grey;">${rDate}</span>
                </div>
                <div class="rt-attachment" style="margin-top: 10px;">
                  <img src="${rt.media}" style="max-width: 100%; max-height: 300px; border-radius: 10px;" alt="retweet image" />
                </div>
              </div>
              `;
      } else if (hasVideo && hasText) {
        retweetHTML = `
              <div class="tweet retweet original-tweet-link" data-id="${t.retweetOf}">
                <div class="flex" style="gap:10px; align-items:center;">
                  <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30">
                  <strong class="user-link" data-uid="${rt.uid}" style="cursor:pointer">${escapeHTML(rtDisplayName)}</strong>
                  <span style="color:grey;">${rDate}</span>
                </div>
                <div style="display: flex; gap: 12px; align-items: flex-start; margin-top: 20px;">
                  <div class="attachment2">
                    <video controls style="max-width: 100px; max-height: 100px; border-radius: 10px;">
                      <source src="${rt.media}" type="video/mp4" />
                    </video>
                  </div>
                  <p style="margin: 0;">${await parseMentionsToLinks(rt.text)}</p>
                </div>
              </div>
              `;
      } else if (hasVideo) {
        retweetHTML = `
              <div class="tweet retweet original-tweet-link" data-id="${t.retweetOf}">
                <div class="flex" style="gap:10px; align-items:center;">
                  <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30">
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
                  <img class="avatar" src="${escapeHTML(rtAvatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30">
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
                <i>Original wynt was deleted</i>
              </div>
              `;
    }
  }

  const tweetHTML = `
              <div class="tweet" id="tweet-${tweetId}" data-id="${tweetId}">
                <div class="flex" style="gap:10px">
                  <img class="avatar" src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" width="30" />
                  <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px;">${escapeHTML(displayName)}</strong>
                  <span style="color:grey;font-size:13px">${dateStr}</span>
                </div>
                <p>${await parseMentionsToLinks(t.text)}</p>
    <div class="tweet-media">
                ${mediaHTML}
    </div>
                ${retweetHTML}
                <div class="flex">
                  <span style="cursor:pointer" class="like-btn" id="likeBtn-${tweetId}">
                    ${isLiked ? `<img src="/image/filled-heart.svg">` : `<img src="/image/heart.svg">`}
                    <span id="likeCount-${tweetId}">${likeCount}</span>
                  </span>
                  <span style="cursor:pointer" class="comment-btn" data-id="${tweetId}">
                    <img src="/image/message.svg"> ${commentCount}
                  </span>
                  <span style="cursor:pointer" class="retweet-btn" data-id="${tweetId}">
                    <img src="/image/rewint.svg"> ${retweetCount}
                  </span>

                  <div class="tweet-menu hidden">
                    <div class="menu-item share-btn" data-id="${tweetId}"><img src="/image/share.svg"> share this Wynt</div>
                    <div class="menu-item bookmark-btn" id="bookmarkBtn-${tweetId}">${isBookmarked ? `<img src="/image/bookmark-filled.svg"> Unbookmark this Wynt` : `<img src="/image/bookmark.svg"> Bookmark this Wynt`}</div>
                    ${auth.currentUser.uid === t.uid ? `<div class="menu-item delete-btn" data-id="${tweetId}"><img src="/image/trash.svg"> Delete this Wynt</div>` : ""}
                    <div class="menu-item download-btn" data-id="${tweetId}"><img src="/image/download.svg"> Download attachment</div>
                  </div>
                  <div style="margin-left:auto;">
                    <span style="cursor:pointer" class="menubtn"><img src="/image/three-dots.svg"></span>
                    <span class="viewbtn" style="margin-left:10px"><img src="/image/chart.svg"> ${viewCount}</span>
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
      setupVideoAutoplayOnVisibility(newTweet);
      setupSoundToggle(newTweet);

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
  const menubtn = e.target.closest(".menubtn");
  if (menubtn) {
    const tweet = menubtn.closest(".tweet");
    const menu = tweet.querySelector(".tweet-menu");
    document.querySelectorAll(".tweet-menu").forEach(m => m.classList.add("hidden"));
    if (menu) {
      menu.classList.toggle("hidden");
    }
  }
  const deleteBtn = e.target.closest(".delete-btn");
  if (!deleteBtn) return;

  const tweetId = deleteBtn.dataset.id;
  const userId = auth.currentUser.uid;

  if (!confirm("Are you sure you want to delete this wynt?")) return;

  const tweetRef = doc(db, "tweets", tweetId);
  const tweetSnap = await getDoc(tweetRef);

  if (!tweetSnap.exists()) return;
  const data = tweetSnap.data();

  if (data.retweetOf) {
    const originalRef = doc(db, "tweets", data.retweetOf);
    await updateDoc(originalRef, {
      retweetCount: increment(-1)
    });
  }

  if (data.mediaType === "video" && data.mediaPath) {
    try {
      const {
        error
      } = await supabase.storage.from("wints").remove([data.mediaPath]);
      if (error) console.error("Error deleting video from Supabase:", error);
      else console.log("Video deleted from Supabase:", data.mediaPath);
    } catch (err) {
      console.error("Failed to delete video:", err);
    }
  }

  await deleteSubcollectionDocs(tweetId, "comments");
  await deleteSubcollectionDocs(tweetId, "likes");
  await deleteSubcollectionDocs(tweetId, "views");

  if (Array.isArray(data.mentions) && data.mentions.length > 0) {
    for (const uid of data.mentions) {
      await deleteDoc(doc(db, "users", uid, "mentioned", tweetId));
    }
  }

  if (Array.isArray(data.tags)) {
    for (const tagId of data.tags) {
      const tagRef = doc(db, "tags", tagId);
      await updateDoc(tagRef, {
        tweetCount: increment(-1)
      });
      await deleteDoc(doc(tagRef, "tweets", tweetId));
    }
  }

  await deleteDoc(tweetRef);
  await deleteDoc(doc(db, "users", userId, "posts", tweetId));
  await updateDoc(doc(db, "users", userId), {
    posts: increment(-1)
  });

  const tweetEl = document.getElementById(`tweet-${tweetId}`);
  if (tweetEl) {
    tweetEl.remove();
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

let removedCount = 0;
let topRemovedCount = 0;
let newestSnapshotMostLiked = null;
let newestSnapshotNewest = null;
let oldestSnapshotMostLiked = null;
let oldestSnapshotNewest = null;
const MAX_TWEETS = 55;
const REMOVE_BATCH = 30;

async function loadTweets(initial = false, direction = "down", count = 15) {
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
    if (logEl) logEl.innerHTML = `<div class="loader"></div> rendering Wynts...`;
  }

  const tweetsRef = collection(db, "tweets");

  let mostLikedQuery, newestQuery;
  if (direction === "down") {
    mostLikedQuery = newestSnapshotMostLiked ?
      query(tweetsRef, orderBy("likeCount", "desc"), startAfter(newestSnapshotMostLiked), limit(count)) :
      query(tweetsRef, orderBy("likeCount", "desc"), limit(count));

    newestQuery = newestSnapshotNewest ?
      query(tweetsRef, orderBy("createdAt", "desc"), startAfter(newestSnapshotNewest), limit(count)) :
      query(tweetsRef, orderBy("createdAt", "desc"), limit(count));
  } else {
    mostLikedQuery = oldestSnapshotMostLiked ?
      query(tweetsRef, orderBy("likeCount", "asc"), startAfter(oldestSnapshotMostLiked), limit(count)) :
      query(tweetsRef, orderBy("likeCount", "asc"), limit(count));

    newestQuery = oldestSnapshotNewest ?
      query(tweetsRef, orderBy("createdAt", "asc"), startAfter(oldestSnapshotNewest), limit(count)) :
      query(tweetsRef, orderBy("createdAt", "asc"), limit(count));
  }

  const [mostLikedSnap, newestSnap] = await Promise.all([
    getDocs(mostLikedQuery),
    getDocs(newestQuery),
  ]);

  if (mostLikedSnap.empty && newestSnap.empty) {
    noMoreTweets = true;
    loadingMore = false;
    if (initial && loadingScreen) loadingScreen.style.display = "none";
    return;
  }

  const usedIds = new Set();
  const mixed = [];
  const mostLikedDocs = mostLikedSnap.docs;
  const newestDocs = newestSnap.docs;
  const maxLength = Math.max(mostLikedDocs.length, newestDocs.length);

  for (let i = 0; i < maxLength; i++) {
    if (mostLikedDocs[i] && !usedIds.has(mostLikedDocs[i].id)) {
      mixed.push(mostLikedDocs[i]);
      usedIds.add(mostLikedDocs[i].id);
    }
    if (newestDocs[i] && !usedIds.has(newestDocs[i].id)) {
      mixed.push(newestDocs[i]);
      usedIds.add(newestDocs[i].id);
    }
  }
  if (direction === "down") {
    mixed.forEach((docSnap) => {
      renderTweet(docSnap.data(), docSnap.id, auth.currentUser, "append");
    });
    newestSnapshotMostLiked = mostLikedDocs[mostLikedDocs.length - 1] || newestSnapshotMostLiked;
    newestSnapshotNewest = newestDocs[newestDocs.length - 1] || newestSnapshotNewest;
  } else {
    mixed.reverse().forEach((docSnap) => {
      renderTweet(docSnap.data(), docSnap.id, auth.currentUser, "prepend");
    });
    oldestSnapshotMostLiked = mostLikedDocs[mostLikedDocs.length - 1] || oldestSnapshotMostLiked;
    oldestSnapshotNewest = newestDocs[newestDocs.length - 1] || oldestSnapshotNewest;
  }

  if (initial && loadingScreen) {
    loadingScreen.style.opacity = "0";
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 300);
  }

  const tweets = document.querySelectorAll(".tweet");
  if (tweets.length > MAX_TWEETS) {
    for (let i = 0; i < REMOVE_BATCH; i++) {
      const firstTweet = document.querySelector(".tweet");
      if (firstTweet) {
        firstTweet.remove();
        topRemovedCount++;
      }
    }
  }
  loadingMore = false;
}
window.addEventListener("scroll", async () => {
  const tweets = document.querySelectorAll(".tweet");
  if (loadingMore) return;

  const lastTweet = tweets[tweets.length - 1];
  if (lastTweet && lastTweet.getBoundingClientRect().top < window.innerHeight) {
    await loadTweets(false, "down", 15);
  }
  const firstTweet = tweets[0];
  if (firstTweet && window.scrollY === 0 && topRemovedCount > 0) {
    await loadTweets(false, "up", REMOVE_BATCH);
    topRemovedCount -= REMOVE_BATCH;
  }
});

loadTweets(true, "down", 15);

document.body.addEventListener("click", async (e) => {
  const commentBtn = e.target.closest(".comment-btn");
  if (commentBtn) {
    const tweetId = commentBtn.dataset.id;
    document.getElementById("commentOverlay").classList.remove("hidden");

    const tweetEl = document.querySelector(`#tweet-${tweetId}`);
    const tweetText = tweetEl.querySelector("p")?.textContent || "";
    let tweetMediaEl = tweetEl.querySelector(".attachment img, .attachment video");
    let mediaSrc = "";

    if (tweetMediaEl) {
      if (tweetMediaEl.tagName === "VIDEO") {
        const sourceEl = tweetMediaEl.querySelector("source");
        mediaSrc = sourceEl ? sourceEl.src || sourceEl.getAttribute("src") : "";
      } else {
        mediaSrc = tweetMediaEl.src || tweetMediaEl.getAttribute("src");
      }
    }

    const isVideo = tweetMediaEl?.tagName === "VIDEO";
    const containsSpoiler = /\|\|.+?\|\|/.test(tweetText);

    const uid = auth.currentUser.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    const profile = userDoc.exists() ? userDoc.data() : {};

    let mediaHTML = "";

    if (mediaSrc) {
      if (isVideo) {
        const vidId = `vid-${tweetId}`;
        mediaHTML = containsSpoiler ?
          `
      <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
        <div class="spoiler-overlay">
          <div class="spoilertxt">spoiler</div>
        </div>
        <video id="${vidId}" style="max-width: 100%; max-height: 300px;" muted controls></video>
      </div>` :
          `
      <div class="attachment">
        <video id="${vidId}" controls style="max-width: 100%; max-height: 300px;"></video>
      </div>`;
      } else {
        mediaHTML = containsSpoiler ?
          `
                    <div class="attachment spoiler-media" onclick="this.classList.add('revealed')">
                      <div class="spoiler-overlay">
                        <div class="spoilertxt">spoiler</div>
                      </div>
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

    if (isVideo && mediaSrc) {
      getSupabaseVideo(mediaSrc, `vid-${tweetId}`);
    }
    applyReadMoreLogic(commentTweet);

    document.getElementById("sendComment").onclick = async () => {

      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
      const tweetOwnerId = tweetDoc.exists() ? tweetDoc.data().uid : null;
      const sendBtn = document.getElementById("sendComment");
      const preview = document.getElementById("commentPreview");
      sendBtn.disabled = true;
      sendBtn.classList.add("disabled");

      try {
        const commentInput = document.getElementById("commentInput");
        const commentText = commentInput.value.trim();
        const fileInput = document.querySelector(".comment-media-input");
        const file = fileInput.files[0];
        const user = auth.currentUser;
        let media = "",
          mediaType = "";

        if (file) {
          mediaType = "image";
          media = await compressImageTo480(file);
          if (media.length > 1048487) {
            alert("Image is too large.");
            sendBtn.disabled = false;
            sendBtn.classList.remove("disabled");
            return;
          }
        }

        if (commentText || media) {
          const mentionsRaw = await extractMentions(commentText);
          const mentions = mentionsRaw.map(m => m.uid);

          await addDoc(collection(db, "tweets", tweetId, "comments"), {
            text: commentText,
            media,
            mediaType,
            uid: user.uid,
            likeCount: 0,
            isOwner: user.uid === tweetOwnerId,
            createdAt: new Date(),
            ...(mentions.length > 0 && {
              mentions
            })
          });

          await updateDoc(doc(db, "tweets", tweetId), {
            commentCount: increment(1)
          });

          await Promise.all(
            mentions.map(uid =>
              sendCommentMentionNotification(tweetId, uid, commentText)
            )
          );

          await sendCommentNotification(tweetId, commentText);

          commentInput.value = "";
          preview.innerHTM = "";
          fileInput.value = "";

          await loadComments(tweetId);
        }
      } catch (err) {
        console.error("Error sending comment:", err);
      } finally {
        sendBtn.disabled = false;
        sendBtn.classList.remove("disabled");
      }
    };
    await loadComments(tweetId);
  }

  const bookmarkBtn = e.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    const btn = bookmarkBtn;
    const tweetId = btn.id.replace("bookmarkBtn-", "");
    const bookmarkRef = doc(db, "users", auth.currentUser.uid, "bookmarks", tweetId);

    const snap = await getDoc(bookmarkRef);

    if (snap.exists()) {
      await deleteDoc(bookmarkRef);
      btn.innerHTML = `<img src="/image/bookmark.svg"> Bookmark this Wynt`;
    } else {
      await setDoc(bookmarkRef, {
        bookmarkedAt: new Date()
      });
      btn.innerHTML = `<img src="/image/bookmark-filled.svg"> Unbookmark this Wynt`;
    }
  }

});

document.body.addEventListener("click", (e) => {
  if (!e.target.closest(".menubtn") && !e.target.closest(".tweet-menu")) {
    document.querySelectorAll(".tweet-menu").forEach(m => m.classList.add("hidden"));
  }
  const viewBtn = e.target.closest(".viewbtn");
  if (viewBtn) {
    document.getElementById("viewOverlay").classList.remove("hidden");
  }

  const closeViewBtn = e.target.closest("#closeViewOverlay");
  const closeview = e.target.closest("#closeviewover")
  if (closeViewBtn || closeview || e.target.id === "viewOverlay") {
    document.getElementById("viewOverlay").classList.add("hidden");
  }
});

document.getElementById("closeComment").onclick = () => {
  document.getElementById("commentOverlay").classList.add("hidden");
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
  const q = query(
    collection(db, "tweets", tweetId, "comments"),
    orderBy("likeCount", "desc"),
    orderBy("createdAt", "desc")
  );

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

  const inputBox = document.querySelector("#commentInput");
  const skibidi = document.querySelector("#skibidi");

  if (canComment || isOwner) {
    if (inputBox) inputBox.style.display = "block";
    if (skibidi) skibidi.style.display = "flex";
  } else {
    if (inputBox) inputBox.style.display = "none";
    if (skibidi) skibidi.style.display = "none";
  }

  const commentStatus = document.getElementById("comment-status");
  if (commentStatus) {
    if (permission === "everyone") {
      commentStatus.innerHTML = "";
    } else if (permission === "following") {
      commentStatus.innerHTML = `<img src="/image/exclamation.svg"> the creator has chosen only people they follow can comment`;
    } else if (permission === "mentioned") {
      commentStatus.innerHTML = `<img src="/image/exclamation.svg"> the creator has chosen only people they mention can comment`;
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
    commentHTML.dataset.uid = d.uid;
    commentHTML.dataset.text = d.text;

    const commentLikeRef = doc(db, "tweets", tweetId, "comments", commentId, "likes", auth.currentUser.uid);
    const commentLikeSnap = await getDoc(commentLikeRef);
    const isCommentLiked = commentLikeSnap.exists();

    const commentLikeCountSnap = await getCountFromServer(
      collection(db, "tweets", tweetId, "comments", commentId, "likes")
    );
    const commentLikeCount = commentLikeCountSnap.data().count;

    const creatorLikeRef = doc(db, "tweets", tweetId, "comments", commentId, "likes", tweetOwnerId);
    const creatorLikeSnap = await getDoc(creatorLikeRef);
    const likedByCreator = !!d.creatorLiked;

    commentHTML.innerHTML = `
                    <div class="flex" id="pinned" style="gap:3px;display:none;">
                      <img src="/image/pin.svg" style="width:22px;height:22px;">
                      <p style="color:grey;margin:0;font-size:14px;">pinned</p>
                    </div>
                    <div class="flex comment-header" style="gap:10px">
                      <img src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar">
                      <div class="user-link" data-uid="${d.uid}" style="cursor:pointer; ${d.uid}">
                        @${escapeHTML(displayName)}
                      </div>
                      ${likedByCreator ? `<div style="height:24px;width:24px;" title="liked by the creator"><img src="/image/liked.svg"></div>` : ""}
                      <span class="comment-date">${formatDate(d.createdAt)}</span>
                    </div>
                    <div class="comment-body">
                      <p class="no-margin">${await parseMentionsToLinks(d.text)}</p>
                      ${d.media && d.mediaType === "image" ? `<img src="${d.media}" class="attachment1" style="max-width:100%;max-height:200px;margin-bottom:5px;border-radius:8px">` : ""}
                      <div class="flex" style="margin:0;gap:13px;">
                        <span class="comment-like-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;display:flex;align-items:center;gap:3px;">
                          ${isCommentLiked ? `<img src="/image/filled-heart.svg" style="width:16px;height:16px;">` : `<img src="/image/heart.svg" style="width:16px;height:16px;">`}
                          <span id="comment-like-count-${commentId}">${commentLikeCount}</span>
                        </span>
                        <div class="reply-actions">${replyButtonHTML}</div>
                        <div class="pin-comment-btn" style="display:none;">
                        <button style="cursor:pointer; background:none; border:none; color:gray; font-size:13px; padding:0;">
                            pin
                        </button>
                        </div>
                        ${auth.currentUser.uid === d.uid ? `
                        <span class="comment-delete-btn" data-id="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;margin-left:auto;"><img src="/image/trash.svg"></span>` : ""}
                      </div>
                      <div class="reply-box hidden" id="reply-box-${commentId}">
                        <textarea class="reply-text" placeholder="thoughts...?"></textarea>
                        <div class="attachment" id="replyPreview-${commentId}"></div>
                        <div class="flex">
                          <button class="send-reply-btn" data-id="${commentId}">Post</button>
                          <input type="file" id="replyMedia-${commentId}" class="comment-media-input hidden-input" accept="/image/*" />
                          <label class="custom-file-btn" for="replyMedia-${commentId}"><img src="/image/upload.svg"></label>
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

    if (d.isOwner) {
      commentHTML.querySelector(".user-link").classList.add("owner-comment");
    }

    if (isOwner) {
      const pinBtnContainer = commentHTML.querySelector(".pin-comment-btn");
      const pinBtn = pinBtnContainer.querySelector("button");

      pinBtn.textContent = isPinned ? "unpin" : "pin";

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

function clearcomment() {
  const commentpreview = document.getElementById('commentPreview');
  commentpreview.innerHTML = '';
  const commentinput = document.getElementById('commentInput');
  commentinput.value = '';
  const commentMediaInput = document.getElementById('commentMediaInput');
  commentMediaInput.value = '';
}

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
      const commentDoc = await getDoc(doc(db, "tweets", tweetId, "comments", commentId));
      const replyCount = commentDoc.exists() ? commentDoc.data().replyCount || 0 : 0;
      e.target.textContent = replyCount < 1 ? "Reply" : `View replies (${replyCount})`
      e.target.dataset.open = "false";
      replyBox.classList.add("hidden");
    }
  }
  const sendReplyBtn = e.target.closest(".send-reply-btn");
  if (sendReplyBtn) {
    sendReplyBtn.disabled = true;
    sendReplyBtn.classList.add('disabled');
    try {
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
      const originalCommenterId = box.closest(".comment-item")?.dataset.uid;
      const originalCommentText = box.closest(".comment-item")?.dataset.text || "";
      const tweetDoc = await getDoc(doc(db, "tweets", tweetId));

      let media = "",
        mediaType = "";
      if (file) {
        mediaType = "image";
        media = await compressImageTo480(file);
        if (media.length > 1048487) {
          alert("Image is too large.");
          sendReplyBtn.disabled = false;
          sendReplyBtn.classList.remove('disabled');
          return;
        }
      }

      if (!text && !media) {
        sendReplyBtn.disabled = false;
        sendReplyBtn.classList.remove('disabled');
        return;
      }

      const mentionsRaw = await extractMentions(text);
      const mentions = mentionsRaw.map(m => m.uid);
      const tweetOwnerId = tweetDoc.exists() ? tweetDoc.data().uid : null;

      await addDoc(collection(db, "tweets", tweetId, "comments", commentId, "replies"), {
        text,
        media,
        isOwner: user.uid === tweetOwnerId,
        mediaType,
        uid: user.uid,
        createdAt: new Date(),
        ...(mentions.length > 0 && {
          mentions
        })
      });

      await updateDoc(doc(db, "tweets", tweetId, "comments", commentId), {
        replyCount: increment(1)
      });

      await Promise.all(
        mentions.map(uid =>
          sendReplyMentionNotification(tweetId, commentId, uid, text)
        )
      );

      await sendReplyNotification(tweetId, commentId, text, originalCommenterId, originalCommentText);

      textarea.value = "";
      if (box.querySelector(".comment-media-input")) {
        box.querySelector(".comment-media-input").value = "";
      }
      const preview = document.getElementById(`replyPreview-${commentId}`);
      if (preview) preview.innerHTML = "";

      loadedReplies[commentId] = 0;
      document.getElementById("replies-" + commentId).innerHTML = "";
      await loadReplies(tweetId, commentId);

    } catch (err) {
      console.error("Error sending reply:", err);
    } finally {
      sendReplyBtn.disabled = false;
      sendReplyBtn.classList.remove('disabled');
    }
  }

  const closecomment = e.target.closest("#closeComment");
  if (closecomment) {
    const commentOverlay = document.getElementById('commentOverlay');
    commentOverlay.classList.add('hidden');
    clearcomment();
  }

  const cancelcommentbtn = e.target.closest(".cancel-comment-btn");
  if (cancelcommentbtn) {
    clearcomment();
  }

  const cancelReplyBtn = e.target.closest(".cancel-reply-btn");
  if (cancelReplyBtn) {
    const commentId = e.target.closest(".reply-box").id.replace("reply-box-", "");
    const replypreview = document.getElementById(`replyPreview-${commentId}`);
    const replyMedia = document.getElementById(`replyMedia-${commentId}`);
    replyMedia.value = '';
    replypreview.innerHTML = '';
    const box = e.target.closest(".reply-box");
    box.classList.add("hidden");
    const toggleBtn = box.parentElement.querySelector(".toggle-replies-btn");
    toggleBtn.dataset.open = "false";
    const replyCount = box.querySelector(".reply-list").childElementCount;
    toggleBtn.textContent = replyCount <
      1 ? "Reply" : `View replies (${replyCount})`;
  }
  const loadMoreReplies = e.target.closest(".load-more-replies");
  if (loadMoreReplies) {
    const commentId = e.target.dataset.id;
    const tweetId = e.target.dataset.tweet;
    await loadReplies(tweetId, commentId);
  }
});

async function loadReplies(tweetId, commentId) {
  const replyList = document.getElementById("replies-" + commentId);
  const offset = loadedReplies[commentId] || 0;
  replyList.innerHTML = "";

  const repliesQ = query(
    collection(db, "tweets", tweetId, "comments", commentId, "replies"),
    orderBy("createdAt", "asc")
  );
  const allReplies = await getDocs(repliesQ);
  const replyDocs = allReplies.docs.slice(offset, offset + REPLY_PAGE_SIZE);

  const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
  const tweetOwnerId = tweetDoc.exists() ? tweetDoc.data().uid : null;

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
    const replylikeCount = r.likeCount || 0;

    const replyHTML = document.createElement("div");
    replyHTML.className = "reply-block";
    replyHTML.innerHTML = `
    <div class="flex comment-header" style="gap:10px">
      <img src="${escapeHTML(avatar)}" onerror="this.src='/image/default-avatar.jpg'" class="avatar comment-avatar">
      <div class="user-link" data-uid="${r.uid}" style="cursor:pointer;">
        @${escapeHTML(displayName)}
      </div>
      <span class="reply-date">${formatDate(r.createdAt)}</span>
    </div>
    <p class="little-margin" style="flex:1">${await parseMentionsToLinks(r.text)}</p>
    ${r.media && r.mediaType === "image" ? `<img src="${r.media}" class="attachment1" style="max-width:100%;max-height:200px;margin-bottom:5px;border-radius:8px">` : ""}
    <div class="flex">
    <span class="reply-like-btn" data-reply="${rId}" data-comment="${commentId}" data-tweet="${tweetId}" style="cursor:pointer;">
      ${replyisLiked ? `<img src="/image/filled-heart.svg">` : `<img src="/image/heart.svg">`} <span id="reply-like-count-${rId}">${replylikeCount}</span>
    </span>
      ${auth.currentUser.uid === r.uid ? `<span class="reply-delete-btn" data-comment="${commentId}" data-reply="${rId}" data-tweet="${tweetId}" style="margin-left:auto;cursor:pointer;margin-left:auto;"><img src="/image/trash.svg"></span>` : ""}
    </div>
  `;

    if (r.isOwner) {
      replyHTML.querySelector(".user-link").classList.add("owner-comment");
    }

    replyList.appendChild(replyHTML);
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

    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    const tweetOwnerId = tweetDoc.exists() ? tweetDoc.data().uid : null;
    const isCreator = auth.currentUser.uid === tweetOwnerId;

    if (snap.exists()) {
      await deleteDoc(ref);
      if (icon) icon.src = "/image/heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 1) - 1}`;
      const updateData = {
        likeCount: increment(-1)
      };
      if (isCreator) updateData.creatorLiked = false;
      await updateDoc(doc(db, "tweets", tweetId, "comments", commentId), updateData);
    } else {
      await setDoc(ref, {
        likedAt: new Date()
      });
      if (icon) icon.src = "/image/filled-heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 0) + 1}`;
      const updateData = {
        likeCount: increment(1)
      };
      if (isCreator) updateData.creatorLiked = true;
      await updateDoc(doc(db, "tweets", tweetId, "comments", commentId), updateData);
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

    const tweetDoc = await getDoc(doc(db, "tweets", tweetId));
    const tweetOwnerId = tweetDoc.exists() ? tweetDoc.data().uid : null;
    const isCreator = auth.currentUser.uid === tweetOwnerId;

    const replyRef = doc(db, "tweets", tweetId, "comments", commentId, "replies", replyId);

    if (snap.exists()) {
      await deleteDoc(ref);
      if (icon) icon.src = "/image/heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 1) - 1}`;

      const updateData = {
        likeCount: increment(-1)
      };
      if (isCreator) updateData.creatorLiked = false;

      await updateDoc(replyRef, updateData);

    } else {
      await setDoc(ref, {
        likedAt: new Date()
      });
      if (icon) icon.src = "/image/filled-heart.svg";
      if (countSpan) countSpan.textContent = `${parseInt(countSpan.textContent || 0) + 1}`;

      const updateData = {
        likeCount: increment(1)
      };
      if (isCreator) updateData.creatorLiked = true;

      await updateDoc(replyRef, updateData);
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

      btn.innerHTML = `<img src="/image/heart.svg"><span id="likeCount-${tweetId}">${(parseInt(countSpan.textContent) || 1) - 1}</span>`;
      await updateDoc(doc(db, "tweets", tweetId), {
        likeCount: increment(-1)
      });

    } else {
      const likeData = {
        likedAt: new Date()
      };
      await setDoc(tweetLikeRef, likeData);

      btn.innerHTML = `<img src="/image/filled-heart.svg"><span id="likeCount-${tweetId}">${(parseInt(countSpan.textContent) || 0) + 1}</span>`;
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
      await updateDoc(doc(db, "tweets", tweetId), {
        commentCount: increment(-1)
      });
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
      await updateDoc(doc(db, "tweets", tweetId, "comments", commentId), {
        replyCount: increment(-1)
      });

      loadedReplies[commentId] = 0;
      await loadReplies(tweetId, commentId);
    }
  }

});

let selectedRetweet = null;

document.body.addEventListener("click", async (e) => {
  const retweetBtn = e.target.closest(".retweet-btn");
  if (!retweetBtn) return;

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
  let vidId = null;

  if (t.media && t.mediaType === "image") {
    retweetMediaHTML = `<div class="attachment"><img src="${t.media}" style="max-width: 100%; max-height: 300px" alt="tweet image" /></div>`;
  } else if (t.media && t.mediaType === "video") {
    vidId = t.id ? `vid-${t.id}` : `vid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    retweetMediaHTML = `
    <div class="attachment">
      <video id="${vidId}" controls style="max-width: 100%; max-height: 300px"></video>
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
      <img class="avatar" src="${avatar}" onerror="this.src='/image/default-avatar.jpg'" width="30">
      <strong class="user-link" data-uid="${t.uid}" style="cursor:pointer;font-size:17px">${escapeHTML(displayName)}</strong>
      <span style="color:grey;font-size:13px">${dateStr}</span>
    </div>
    <p>${linkify(t.text)}</p>
    ${retweetMediaHTML}
  </div>
`;

  if (t.media && t.mediaType === "video") {
    getSupabaseVideo(t.media, vidId);
  }


  document.getElementById("retweetOverlay").classList.remove("hidden");
  applyReadMoreLogic(document.getElementById("retweetOriginal"));

  tag?.classList.add('hidden');
  viewer?.classList.add('hidden');
});

const sendRetweet = document.getElementById("sendRetweet");

sendRetweet.onclick = async () => {
  sendRetweet.disabled = true;
  sendRetweet.classList.add('disabled');

  const text = document.getElementById("retweetText").value.trim();
  const originalId = selectedRetweet;

  const fileInput =
    document.getElementById(`retweetMedia-${originalId}`) ||
    document.getElementById("retweetMedia-TWEETID");

  const file = fileInput?.files?.[0];

  const user = auth.currentUser;
  const uid = user?.uid;
  if (!uid || !originalId) {
    sendRetweet.disabled = false;
    sendRetweet.classList.remove('disabled');
    return;
  }

  let media = "";
  let mediaType = "";

  try {
    if (file) {
      const upload = await uploadToSupabase(file, uid);
      media = upload.url;
      mediaType = upload.type;
    }

    const mentionsRaw = await extractMentions(text);
    const mentions = mentionsRaw.map(m => m.uid);

    const tweetRef = await addDoc(collection(db, "tweets"), {
      text,
      retweetOf: originalId,
      media,
      mediaType,
      likeCount: 0,
      createdAt: new Date(),
      uid,
      ...(mentions.length > 0 && {
        mentions
      })
    });

    await updateDoc(doc(db, "tweets", originalId), {
      retweetCount: increment(1)
    });

    await sendRetweetNotification(originalId, text, tweetRef.id);

    await Promise.all(
      mentions.map(mentionUid =>
        Promise.all([
          setDoc(doc(db, "users", mentionUid, "mentioned", tweetRef.id), {
            mentionedAt: new Date()
          }),
          sendMentionNotification(tweetRef.id, mentionUid)
        ])
      )
    );

    await handleTags(text, tweetRef.id);

    await setDoc(doc(db, "users", uid, "posts", tweetRef.id), {
      exists: true
    });
    await updateDoc(doc(db, "users", uid), {
      posts: increment(1),
      cooldown: new Date(Date.now() + 15 * 60 * 1000)
    });

    document.getElementById("retweetText").value = "";
    if (fileInput) fileInput.value = "";

    const preview =
      document.getElementById(`retweetPreview-${originalId}`) ||
      document.getElementById("retweetPreview-TWEETID");
    if (preview) preview.innerHTML = "";

    document.getElementById("retweetOverlay").classList.add("hidden");

  } catch (error) {
    if (error.message?.includes('The value of property "media" is longer than')) {
      alert("Media file is too large");
    } else {
      console.error("❌ Retweet failed:", error);
    }
  } finally {
    sendRetweet.disabled = false;
    sendRetweet.classList.remove('disabled');
  }
};

document.body.addEventListener("change", (e) => {
  if (e.target.classList.contains("comment-media-input") && e.target.closest(".reply-box")) {
    const commentId = e.target.closest(".reply-box").id.replace("reply-box-", "");
    showImagePreview(e.target, `replyPreview-${commentId}`);
  }
});

document.getElementById("commentMediaInput").addEventListener("change", () => {
  showImagePreview(document.getElementById("commentMediaInput"), "commentPreview");
});

const mediaInput = document.getElementById('mediaInput');
const attachment = document.getElementById('tweetPreview');

document.getElementById('mediaInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  attachment.innerHTML = '';
  attachment.style.position = 'relative';
  attachment.style.marginBottom = '20px';

  if (file) {
    const maxSize = 3 * 1024 * 1024;
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);

    const sizeCounter = document.createElement('div');
    sizeCounter.style.position = 'absolute';
    sizeCounter.style.top = '10px';
    sizeCounter.style.left = '10px';
    sizeCounter.style.background = 'rgba(0,0,0,0.6)';
    sizeCounter.style.color = 'white';
    sizeCounter.style.padding = '2px 6px';
    sizeCounter.style.borderRadius = '4px';
    sizeCounter.style.fontSize = '12px';
    sizeCounter.style.zIndex = '10';
    sizeCounter.textContent = `${sizeInMB} MB`;

    if (file.size > maxSize) {
      sizeCounter.style.background = '#db1d23';
      attachment.appendChild(sizeCounter);
    }

    attachment.appendChild(sizeCounter);

    const preview = document.createElement(file.type.startsWith('video') ? 'video' : 'img');
    preview.src = URL.createObjectURL(file);
    preview.style.maxWidth = '100%';
    preview.style.maxHeight = '333px';
    preview.controls = file.type.startsWith('video');
    attachment.appendChild(preview);
  }
});

const mediaInput1 = document.getElementById('retweetMedia-TWEETID');
const attachment1 = document.getElementById('retweetPreview-TWEETID');

mediaInput1.addEventListener('change', function(e) {
  const file = e.target.files[0];
  attachment1.innerHTML = '';
  attachment1.style.position = 'relative';
  attachment1.style.marginBottom = '20px';

  if (file) {
    const maxSize = 3 * 1024 * 1024;
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeCounter = document.createElement('div');
    sizeCounter.style.position = 'absolute';
    sizeCounter.style.top = '10px';
    sizeCounter.style.left = '10px';
    sizeCounter.style.background = 'rgba(0,0,0,0.6)';
    sizeCounter.style.color = 'white';
    sizeCounter.style.padding = '2px 6px';
    sizeCounter.style.borderRadius = '4px';
    sizeCounter.style.fontSize = '12px';
    sizeCounter.style.zIndex = '10';
    sizeCounter.textContent = `${sizeInMB} MB`;

    if (file.size > maxSize) {
      sizeCounter.style.background = '#db1d23';
      attachment1.appendChild(sizeCounter);
    }

    attachment1.appendChild(sizeCounter);

    const preview = document.createElement(file.type.startsWith('video') ? 'video' : 'img');
    preview.src = URL.createObjectURL(file);
    preview.style.maxWidth = '100%';
    preview.style.maxHeight = '333px';
    preview.controls = file.type.startsWith('video');
    attachment1.appendChild(preview);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const match = path.match(/^\/wynt\/([a-zA-Z0-9_-]+)$/);
  if (match) {
    const tweetId = match[1];
    viewTweet(tweetId);
  }
});

document.body.addEventListener("click", async (e) => {
  const shareBtn = e.target.closest(".share-btn");
  if (shareBtn) {
    const tweetId = shareBtn.dataset.id;
    const url = `${window.location.origin}/wynt/${tweetId}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied!");
    } catch {
      prompt("Copy this link:", url);
    }
  }

  const downloadBtn = e.target.closest(".download-btn");
  if (downloadBtn) {
    const tweetId = downloadBtn.dataset.id;
    const tweetEl = document.querySelector(`#tweet-${tweetId}`);

    const mediaEl = tweetEl.querySelector(".tweet-media img, .tweet-media video, .tweet-media video source");

    if (!mediaEl) return;

    let url = "";
    if (mediaEl.tagName === "VIDEO") {
      const sourceEl = mediaEl.querySelector("source");
      url = sourceEl ? sourceEl.src || sourceEl.getAttribute("src") : "";
    } else {
      url = mediaEl.src || mediaEl.getAttribute("src");
    }

    if (!url) return;

    const filename = getSafeFilename(tweetId, url);
    await downloadFile(url, filename);

  }
});

function getSafeFilename(tweetId, url, index = 0) {
  const urlParts = url.split(".");
  const ext = urlParts[urlParts.length - 1].split("?")[0];
  return `tweet-${tweetId}-${Date.now()}-${index}.${ext}`;
}

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();

    let ext = "";
    if (blob.type.includes("png")) ext = ".png";
    else if (blob.type.includes("jpeg")) ext = ".jpg";
    else if (blob.type.includes("gif")) ext = ".gif";
    else if (blob.type.includes("mp4")) ext = ".mp4";
    else if (blob.type.includes("webm")) ext = ".webm";

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename.endsWith(ext) ? filename : filename + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error("Download failed:", err);
  }
}
