import { auth, db, doc, getDoc, collection, query, orderBy, onSnapshot,serverTimestamp, setDoc, limit, getDocs, where, updateDoc, writeBatch, deleteDoc } from "./firebase.js";
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
  div.className = `notification ${notification.type || 'default'}`;

  let content = "";
  const hasText = notification.tweetText?.trim().length > 0;

  const tweetPreview = hasText ?
    `"${textClamp(notification.tweetText)}"` :
    "";

  if (notification.type === "comment") {
    content = `<i>${notification.senderName}</i> commented "<b>${textClamp(notification.text)}</b>" on your wint <b>${tweetPreview}</b>`;
  } else if (notification.type === "reply") {
    content = `<i>${notification.senderName}</i> replied "<b>${textClamp(notification.text)}</b>" on your comment "<b>${textClamp(notification.replyToText)}</b>"`;
  } else if (notification.type === "mention") {
    content = `<i>${notification.senderName}</i> mentioned you on their wint <b>${tweetPreview}</b>.`;
  } else if (notification.type === "retweet") {
    const replyPart = notification.text?.trim() ?
      ` "<b>${textClamp(notification.text)}</b>"` :
      "";
    content = `<i>${notification.senderName}</i> rewinted ${replyPart} on your post <b>${tweetPreview}</b>`;
  } else {
    content = `<i>${notification.senderName}</i> sent a notification`;
  }

  div.innerHTML = `
    <p>${content}</p>
    <div class="flex" style="align-items:center;">
      <span style="color:grey;font-size:13px">
        ${formatTime(notification.createdAt.toDate())}
      </span>
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
  type
}) {
  const tweetViewer = document.getElementById("tweetViewer");
  const box = tweetViewer.querySelector("#appendTweet");
  tweetViewer.classList.remove("hidden");
  document.body.classList.add("no-scroll");
  box.innerHTML = "";

  const tweetSnap = await getDoc(doc(db, "tweets", tweetId));

  if (!tweetSnap.exists()) {
    box.innerHTML = "<p>Wint not found.</p>";
    return;
  }

  await renderTweet(tweetSnap.data(), tweetId, auth.currentUser, "append", box);

  if (type !== "mention" && type !== "retweet") {
    const commentBtn = box.querySelector(`.comment-btn[data-id="${tweetId}"]`);
    if (commentBtn) commentBtn.click();
  }
}

export function listenForUnreadNotifications() {
  const user = auth.currentUser;
  if (!user) return;

  const ref = collection(db, "users", user.uid, "notifications");
  const q = query(ref, where("read", "==", false));

  onSnapshot(q, (snap) => {
    const hasUnread = !snap.empty;
    const unread = document.getElementById('unread');

    if (unread) {
      unread.classList.toggle("has-unread", hasUnread);
    }

    if (hasUnread && document.visibilityState === "visible") {
      showBrowserNotification(snap.size);
    }
  });
}

function showBrowserNotification(count) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification("You have new notifications", {
    body: `You have ${count} unread notification${count > 1 ? "s" : ""}`,
    icon: "/image/W.png"
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
      <p style="text-align:center;color:grey;">aw snap! you have no notification... yet.</div>
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
    snap.docs.forEach(docSnap => {
      batch.update(docSnap.ref, {
        read: true
      });
    });
    await batch.commit();
  }
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
