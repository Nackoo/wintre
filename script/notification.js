import { auth, db, doc, getDoc, collection, query, orderBy, onSnapshot,serverTimestamp, setDoc, limit, getDocs, where, updateDoc, writeBatch, deleteDoc, startAfter } from "./firebase.js";
import { renderTweet } from "./index.js";

let notificationLastDoc = null;
let notificationLoading = false;
const NOTIFICATION_PAGE_SIZE = 30;

const notificationsContainer = document.getElementById("notifications");

function formatDateHeader(date) {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) return "Today";

  const options = {
    day: "numeric",
    month: "short",
    year: "numeric"
  };
  return date.toLocaleDateString(undefined, options);
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function clearNotificationsUI() {
  notificationsContainer.innerHTML = "";
}

function createNotificationElement(notification) {
  const div = document.createElement("div");
  div.className = `notification`;

  let content = "";
  const hasText = notification.tweetText?.trim().length > 0;
  const tweetPreview = hasText ? `"${textClamp(notification.tweetText)}"` : "";

  if (notification.type === "comment") {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> <b><span style="color:#f91880">commented</span></b> <i>"${textClamp(notification.text)}"</i> on your wint <i>${tweetPreview}</i>`;
  } else if (notification.type === "commentMention") {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> <b><span style="color:#7856ff">mentioned</span></b> you on a comment <i>"${textClamp(notification.text)}"</i> in their wint <b>${tweetPreview}</b>`;
  } else if (notification.type === "replyMention") {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> <b><span style="color:#7856ff">mentioned</span></b> you on a reply <i>"${textClamp(notification.text)}</i>"`;
  } else if (notification.type === "reply") {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> <b><span style="color:#f91880">replied</span></b> <i>"${textClamp(notification.text)}"</i> on your comment "${textClamp(notification.replyToText)}"`;
  } else if (notification.type === "mention") {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> <b><span style="color:#7856ff">mentioned</span></b> you on their Wynt <i>${tweetPreview}</i>.`;
  } else if (notification.type === "retweet") {
    const replyPart = notification.text?.trim() ? ` "<i>${textClamp(notification.text)}</i>"` : "";
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> <b><span style="color:#ffd400">rewynted</span></b> ${replyPart} on your post <i>${tweetPreview}</i>`;
  } else if (notification.type === "follow") {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> is now <b><span style="color:#1d9bf0">following</span></b> you`;
    div.dataset.senderId = notification.senderId;
  } else {
    content = `<span style="color:#00ba7c;">@${notification.senderName}</span> sent you a notification`;
  }

  div.innerHTML = `
<div class="flex" style="margin:0;">
  <p style="margin:0;">
    <span class="notif-unread" style="color:#1d9bf0;${notification.read === false ? '' : 'display:none;'}">(unread)</span>
    ${content}
    <span style="color:grey;font-size:13px">
      ${formatTime(notification.createdAt.toDate())}
    </span>
  </p>
  <button class="delete-notif-btn" style="background:none;margin-left:auto;">
    <img src="image/trash.svg">
  </button>
</div>
  `;

  div.dataset.tweetId = notification.tweetId;
  if (notification.commentId) div.dataset.commentId = notification.commentId;
  if (notification.replyId) div.dataset.replyId = notification.replyId;
  div.dataset.type = notification.type;

  div.addEventListener("click", () => {
    handleNotificationClick(div.dataset);
  });

  div.querySelector(".delete-notif-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;

    const notifRef = doc(db, "users", user.uid, "notifications", notification.id);
    try {
      await deleteDoc(notifRef);
      div.remove();
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  });

  return div;
}

export async function handleNotificationClick({
  tweetId,
  commentId,
  replyId,
  type,
  senderId
}) {

  if (type === "follow") {
    if (typeof window.openUserSubProfile === "function") {
      window.openUserSubProfile(senderId);
    }
    return;
  }

  const tweetViewer = document.getElementById("tweetViewer");
  const box = tweetViewer.querySelector("#appendTweet");
  tweetViewer.classList.remove("hidden");
  document.body.classList.add("no-scroll");
  box.innerHTML = "";

  const tweetSnap = await getDoc(doc(db, "tweets", tweetId));

  if (!tweetSnap.exists()) {
    box.innerHTML = `<div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div>`;
    return;
  }

  await renderTweet(tweetSnap.data(), tweetId, auth.currentUser, "append", box);

  if (type !== "mention" && type !== "retweet") {
    const commentBtn = box.querySelector(`.comment-btn[data-id="${tweetId}"]`);
    if (commentBtn) commentBtn.click();
  }
}

let lastUnreadCount = 0;

export function listenForUnreadNotifications() {
  const user = auth.currentUser;
  if (!user) return;

  const ref = collection(db, "users", user.uid, "notifications");
  const q = query(ref, where("read", "==", false));

  onSnapshot(q, (snap) => {
    const unreadCount = snap.size;
    const hasUnread = unreadCount > 0;
    const unread = document.getElementById('unread');

    if (unread) {
      unread.classList.toggle("has-unread", hasUnread);
    }

    if (unreadCount === 0) {
      document.title = "Wyntr";
    } else {
      document.title = `(${unreadCount}) Wyntr`;
    }
  });
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    const maxTries = timeout / interval;
    let tries = 0;

    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (++tries > maxTries) {
        clearInterval(timer);
        reject(new Error(`Element ${selector} not found within timeout.`));
      }
    }, interval);
  });
}

export async function loadNotifications(initial = false) {
  if (notificationLoading) return;
  notificationLoading = true;

  const user = auth.currentUser;
  if (!user) return;

  const notificationsRef = collection(db, "users", user.uid, "notifications");
  let q = query(
    notificationsRef,
    orderBy("createdAt", "desc"),
    limit(NOTIFICATION_PAGE_SIZE)
  );

  if (!initial && notificationLastDoc) {
    q = query(
      notificationsRef,
      orderBy("createdAt", "desc"),
      startAfter(notificationLastDoc),
      limit(NOTIFICATION_PAGE_SIZE)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty && initial) {
    notificationsContainer.innerHTML = `
      <div style="display:flex;justify-content:center;opacity:0.2;"><img style="height:250px;width:250px;" src="image/404.png"></div></div>
    `;
    notificationLoading = false;
    return;
  }

  if (!snap.empty) {
    notificationLastDoc = snap.docs[snap.docs.length - 1];

    let currentDate = "";
    for (const docSnap of snap.docs) {
      const data = {
        id: docSnap.id,
        ...docSnap.data()
      };
      if (!data.createdAt) continue;

      const date = data.createdAt.toDate();
      const formattedDate = formatDateHeader(date);

      if (formattedDate !== currentDate) {
        currentDate = formattedDate;
        notificationsContainer.appendChild(
          createDateDivider(formattedDate)
        );
      }

      notificationsContainer.appendChild(createNotificationElement(data));
    }
  }

  notificationLoading = false;
}

function createDateDivider(dateText) {
  const wrapper = document.createElement("div");
  wrapper.className = "date-divider";
  wrapper.textContent = dateText;
  return wrapper;
}

document.getElementById('notifsvg').addEventListener("click", async () => {
  document.getElementById("notificationOverlay").classList.remove("hidden");
  notificationsContainer.innerHTML = "";
  notificationLastDoc = null;
  await loadNotifications(true);

  const user = auth.currentUser;
  if (user) {
    const notificationsRef = collection(db, "users", user.uid, "notifications");
    const unreadQuery = query(notificationsRef, where("read", "==", false));
    const snap = await getDocs(unreadQuery);

    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => batch.update(docSnap.ref, { read: true }));
    await batch.commit();
  }
  document.title = "Wyntr";
});

function textClamp(text, maxLength = 30) {
  if (!text || typeof text !== "string") return "…";
  return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

export async function sendCommentNotification(tweetId, commentText) {
  const sender = auth.currentUser;
  if (!sender) return;

  const tweetRef = doc(db, "tweets", tweetId);
  const tweetSnap = await getDoc(tweetRef);
  if (!tweetSnap.exists()) return;

  const creatorId = tweetSnap.data().uid;
  if (creatorId === sender.uid) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    creatorId,
    "notifications",
    `${tweetId}-comment-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "comment",
    senderName,
    text: textClamp(commentText),
    createdAt: serverTimestamp(),
    tweetId,
    tweetText: tweetSnap.data().text || "",
    read: false
  });

}

export async function sendReplyNotification(tweetId, commentId, replyText, originalCommenterId, replyToText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === originalCommenterId) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    originalCommenterId,
    "notifications",
    `${tweetId}-reply-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "reply",
    senderName,
    text: textClamp(replyText),
    replyToText: textClamp(replyToText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId,
    read: false
  });
}

export async function sendMentionNotification(tweetId, mentionedUserId) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const tweetSnap = await getDoc(doc(db, "tweets", tweetId));
  if (!tweetSnap.exists()) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `${tweetId}-mention-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "mention",
    senderName,
    createdAt: serverTimestamp(),
    tweetId,
    tweetText: tweetSnap.data().text || "",
    read: false
  });
}

export async function sendRetweetNotification(originalTweetId, replyText, retweetId) {
  const sender = auth.currentUser;
  if (!sender) return;

  const tweetSnap = await getDoc(doc(db, "tweets", originalTweetId));
  if (!tweetSnap.exists()) return;

  const originalAuthorId = tweetSnap.data().uid;
  if (sender.uid === originalAuthorId) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    originalAuthorId,
    "notifications",
    `${retweetId}-retweet-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "retweet",
    senderName,
    text: replyText || "",
    createdAt: serverTimestamp(),
    tweetId: retweetId,
    originalTweetId: originalTweetId,
    tweetText: tweetSnap.data().text || "",
    read: false
  });
}

export async function sendCommentMentionNotification(tweetId, mentionedUserId, commentText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const tweetSnap = await getDoc(doc(db, "tweets", tweetId));
  if (!tweetSnap.exists()) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `${tweetId}-commentmention-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "commentMention",
    senderName,
    text: textClamp(commentText),
    createdAt: serverTimestamp(),
    tweetId,
    tweetText: tweetSnap.data().text || "",
    read: false
  });
}

export async function sendReplyMentionNotification(tweetId, commentId, mentionedUserId, replyText) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === mentionedUserId) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    mentionedUserId,
    "notifications",
    `${tweetId}-replymention-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "replyMention",
    senderName,
    text: textClamp(replyText),
    createdAt: serverTimestamp(),
    tweetId,
    commentId,
    read: false
  });
}

export async function sendFollowNotification(targetUserId) {
  const sender = auth.currentUser;
  if (!sender || sender.uid === targetUserId) return;

  const senderDoc = await getDoc(doc(db, "users", sender.uid));
  const senderName = senderDoc.exists() ? senderDoc.data().displayName : "Someone";

  const notificationRef = doc(
    db,
    "users",
    targetUserId,
    "notifications",
    `follow-${Date.now()}`
  );

  await setDoc(notificationRef, {
    type: "follow",
    senderName,
    senderId: sender.uid,
    text: `${senderName} just followed you`,
    createdAt: serverTimestamp(),
    read: false
  });
}

document.getElementById("notifications").addEventListener("scroll", async () => {
  const container = document.getElementById("notifications");
  const items = container.querySelectorAll(".notification");

  if (items.length >= 25) {
    const triggerEl = items[24];
    const rect = triggerEl.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom >= 0;

    if (inView && !notificationLoading) {
      await loadNotifications(false);
    }
  }
});
