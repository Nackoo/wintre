import { db, auth, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc, orderBy, limit, signOut, startAfter, onSnapshot } from "./firebase.js";
import { renderTweet } from './index.js';

const bannerInput = document.getElementById("banner-input");
const bannerPreview = document.getElementById("banner-preview");
const avaInput = document.getElementById("ava-input");
const avaPreview = document.getElementById("ava-preview");
const nameInput = document.getElementById("name-edit");
const descriptionInput = document.getElementById("description-edit");
const saveButton = document.getElementById("save-profile-changes");
const myPfp = document.getElementById("my-pfp");
const myBanner = document.getElementById("my-banner");
const myDescription = document.querySelector("#my-description");
const myName = document.querySelector("#my-name");
const profileSubOverlay = document.getElementById("profileSubOverlay");

let unsubscribeMentioned = null;
let unsubscribeYouList = null;

document.getElementById("logout").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "/user/login";
  } catch (error) {
    console.error("Logout failed:", error);
  }
});

async function applyProfileUpdatesToAll(uid, newDisplayName, newPhotoURL) {
  const userTweets = await getDocs(collection(db, "tweets"));
  const updatePromises = [];

  for (const tweetDoc of userTweets.docs) {
    const t = tweetDoc.data();
    const ref = doc(db, "tweets", tweetDoc.id);

    if (t.uid === uid) {
      updatePromises.push(updateDoc(ref, {
        displayName: newDisplayName,
        photoURL: newPhotoURL
      }));
    }

    const commentsSnap = await getDocs(collection(db, "tweets", tweetDoc.id, "comments"));
    for (const commentDoc of commentsSnap.docs) {
      const c = commentDoc.data();
      if (c.uid === uid) {
        const commentRef = doc(db, "tweets", tweetDoc.id, "comments", commentDoc.id);
        updatePromises.push(updateDoc(commentRef, {
          name: newDisplayName,
          photoURL: newPhotoURL
        }));
      }

      const repliesSnap = await getDocs(collection(db, "tweets", tweetDoc.id, "comments", commentDoc.id, "replies"));
      for (const replyDoc of repliesSnap.docs) {
        const r = replyDoc.data();
        if (r.uid === uid) {
          const replyRef = doc(db, "tweets", tweetDoc.id, "comments", commentDoc.id, "replies", replyDoc.id);
          updatePromises.push(updateDoc(replyRef, {
            name: newDisplayName,
            photoURL: newPhotoURL
          }));
        }
      }
    }
  }

  await Promise.all(updatePromises);
  console.log("profile updated");
}

function fileToBase64(file, maxSize = 200 * 1024) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target.result;
      if (base64.length > maxSize * 1.37) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.sqrt(maxSize / (base64.length * 0.75));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = base64;
      } else {
        resolve(base64);
      }
    };
    reader.readAsDataURL(file);
  });
}

function escapeHTML(text) {
  return text.replace(/[&<>]/g, (match) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    } [match])
  );
}

document.querySelector('.smallbar img[src="/image/settings.svg"]').addEventListener("click", async () => {
  document.getElementById("profileSubOverlay").classList.remove("hidden");

  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const docSnap = await getDoc(doc(db, "users", uid));
  if (!docSnap.exists()) return;
  const data = docSnap.data();

  const banner = data.banner;
  const bannerPreview = document.getElementById("banner-preview");

  if (banner) {
    bannerPreview.style.backgroundImage = `url('${banner}')`;
    bannerPreview.style.backgroundRepeat = 'no-repeat';
    bannerPreview.style.backgroundPosition = 'center';
    bannerPreview.style.backgroundSize = 'cover';
    bannerPreview.style.backgroundColor = 'unset';
    bannerPreview.dataset.image = banner;
  } else {
    bannerPreview.style.background = "grey";
    delete bannerPreview.dataset.image;
  }

  const avatarURL = data.photoURL || auth.currentUser.photoURL;
  const avaPreview = document.getElementById("ava-preview");

  if (avatarURL) {
    avaPreview.style.background = `url('${avatarURL}') no-repeat center / cover`;
    avaPreview.dataset.image = avatarURL;
  } else {
    avaPreview.style.background = "grey";
    delete avaPreview.dataset.image;
  }

  const name = data.displayName || auth.currentUser.displayName;
  document.getElementById("name-edit").value = name;

  const description = data.description || "wsg homie?";
  document.getElementById("description-edit").value = description;
});

bannerInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    const base64 = await fileToBase64(file);
    bannerPreview.style.background = `url("${base64}") no-repeat center / cover`;
    bannerPreview.style.backgroundSize = 'cover';
    bannerPreview.dataset.image = base64;
  }
});

avaInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    const base64 = await fileToBase64(file);
    avaPreview.style.background = `url('${base64}') no-repeat center / cover`;
    avaPreview.dataset.image = base64;
  }
});

nameInput.addEventListener("input", () => {
  nameInput.value = nameInput.value
    .replace(/[^a-zA-Z._-]/g, "")
    .slice(0, 20);
});

saveButton.addEventListener("click", async () => {
  const uid = auth.currentUser.uid;
  const newName = escapeHTML(nameInput.value.trim());
  const newDescription = escapeHTML(descriptionInput.value.trim());
  const newBanner = bannerPreview.dataset.image || "";
  const newAvatar = avaPreview.dataset.image || "";

  if (!newName) {
    alert("Username cannot be empty");
    return;
  }

  const usersRef = collection(db, "users");
  const querySnapshot = await getDocs(query(usersRef, where("displayName", "==", newName)));

  if (!querySnapshot.empty && querySnapshot.docs[0].id !== uid) {
    alert('this username was already taken. plase choose another one');
    return;
  }

  document.querySelector('.smallbar img[src="/image/settings-filled.svg"]').classList.add('hidden');
  document.querySelector('.smallbar img[src="/image/settings.svg"]').classList.remove('hidden');
  document.querySelector('.smallbar img[src="/image/home-filled.svg"]').classList.remove('hidden');
  document.querySelector('.smallbar img[src="/image/home.svg"]').classList.add('hidden');

  const userRef = doc(db, "users", uid);
  await setDoc(userRef, {
    displayName: newName,
    description: newDescription,
    banner: newBanner,
    photoURL: newAvatar,
  }, { merge: true });

  profileSubOverlay.classList.add("hidden");
  myName.textContent = newName;
  myDescription.textContent = newDescription;
  myBanner.style.background = newBanner ? `url(${newBanner}) center no-repeat / cover` : "grey";
  myPfp.style.background = `url('${newAvatar || auth.currentUser.photoURL}')`;

  const collectionsToUpdate = ["tweets", "comments"];
  for (const col of collectionsToUpdate) {
    const q = query(collection(db, col), where("uid", "==", uid));
    const snap = await getDocs(q);
    const updates = snap.docs.map(docRef => updateDoc(docRef.ref, {
      displayName: newName,
      photoURL: newAvatar
    }));
    await Promise.all(updates);
  }

  await applyProfileUpdatesToAll(uid, newName, newAvatar);
});

document.querySelector('.smallbar img[src="/image/user.svg"]').addEventListener("click", async () => {

  const uid = auth.currentUser?.uid;
  if (!uid) return;

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
