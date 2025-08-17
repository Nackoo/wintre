export const bookmark = document.getElementById('bookmarkOverlay');
export const profile = document.getElementById('profileOverlay');
export const profilesub = document.getElementById('profileSubOverlay');
export const user = document.getElementById('userOverlay');
export const usersub = document.getElementById('userSubOverlay');
export const tag = document.getElementById('tagSubOverlay');
export const viewer = document.getElementById('tweetViewer');
export const tweet = document.getElementById('tweetOverlay');
export const retweet = document.getElementById('retweetOverlay');
export const notification = document.getElementById('notificationOverlay');
export const comment = document.getElementById('commentOverlay');

export const bookmarksvg = document.querySelector('.smallbar img[src="image/bookmark.svg"]');
export const homesvg = document.querySelector('.smallbar img[src="image/home.svg"]');
export const usersvg = document.querySelector('.smallbar img[src="image/user.svg"]');
export const searchsvg = document.querySelector('.smallbar img[src="image/search.svg"]');
export const settingssvg = document.querySelector('.smallbar img[src="image/settings.svg"]');
export const notifsvg = document.getElementById('notifsvg');

export const bookmarkfilled = document.querySelector('.smallbar img[src="image/bookmark-filled.svg"]');
export const homefilled = document.querySelector('.smallbar img[src="image/home-filled.svg"]');
export const userfilled = document.querySelector('.smallbar img[src="image/user-filled.svg"]');
export const searchfilled = document.querySelector('.smallbar img[src="image/search-filled.svg"]');
export const settingsfilled = document.querySelector('.smallbar img[src="image/settings-filled.svg"]');
export const notiffilled = document.querySelector('.smallbar img[src="image/notification-filled.svg"]');

const panelsToHide = () => [
  profile, profilesub, user, usersub, tag, document.getElementById("followOverlay"),
  viewer, tweet, retweet, bookmark, notification, comment
];

const filledIcons = [
  settingsfilled, 
  homefilled, 
  bookmarkfilled, 
  userfilled, 
  searchfilled,
  notiffilled
];

const outlineIcons = {
  bookmarksvg,
  homesvg,
  usersvg,
  searchsvg,
  settingssvg,
  notifsvg
};

const overlayMap = {
  bookmarksvg: bookmark,     
  usersvg: profile,
  searchsvg: user,          
  settingssvg: profilesub,
  notifsvg: notification
};

const filledIconMap = {
  bookmarksvg: bookmarkfilled,
  homesvg: homefilled,
  usersvg: userfilled,
  searchsvg: searchfilled,
  settingssvg: settingsfilled,
  notifsvg: notiffilled
};

const clickHandler = (clickedIcon) => {
  return () => {
    panelsToHide().forEach(p => p?.classList.add("hidden"));
    filledIcons.forEach(icon => icon?.classList.add("hidden"));
    Object.values(outlineIcons).forEach(icon => icon?.classList.remove("hidden"));
    outlineIcons[clickedIcon]?.classList.add("hidden");
    filledIconMap[clickedIcon]?.classList.remove("hidden");
    overlayMap[clickedIcon]?.classList.remove("hidden");
  };
};

Object.keys(outlineIcons).forEach(iconName => {
  const icon = outlineIcons[iconName];
  if (icon) {
    icon.addEventListener("click", clickHandler(iconName));
  }
});

function hidebookmark() {
  bookmark.classList.add('hidden');
  homesvg.classList.add('hidden');
  bookmarkfilled.classList.add('hidden');
  bookmarksvg.classList.remove('hidden');
  homefilled.classList.remove('hidden');
}

function hideprofile() {
  document.querySelector('#profileOverlay').classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  userfilled.classList.add('hidden');
  usersvg.classList.remove('hidden');
}

function hideuser() {
  user.classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  searchfilled.classList.add('hidden');
  searchsvg.classList.remove('hidden');
}

function hidesettings() {
  document.querySelector('#profileSubOverlay').classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  settingsfilled.classList.add('hidden');
  settingssvg.classList.remove('hidden');
}

function hidenotif() {
  notification.classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  notiffilled.classList.add('hidden');
  notifsvg.classList.remove('hidden');
}

function closeUser() {
  usersub?.classList.add('hidden');
  user.classList.remove('hidden');
}

window.hideprofile = hideprofile;
window.hideuser = hideuser;
window.hidebookmark = hidebookmark;
window.hidesettings = hidesettings;
window.hidenotif = hidenotif;
window.closeUser = closeUser

document.body.addEventListener("click", async (e) => {
  const userLink = e.target.closest(".user-link");
  if (userLink && userLink.dataset.uid) {
    const uid = userLink.dataset.uid;
    if (uid) {
      await window.openUserSubProfile(uid);
      document.getElementById("followOverlay")?.classList.add('hidden');
      comment?.classList.add('hidden');
      user?.classList.remove('hidden');
      homefilled?.classList.add('hidden');
      homesvg?.classList.remove('hidden');
      searchsvg?.classList.add('hidden');
      searchfilled?.classList.remove('hidden');
      profile?.classList.add('hidden');
      userfilled?.classList.add('hidden');
      usersvg?.classList.remove('hidden');
      notiffilled?.classList.add('hidden');
      notifsvg?.classList.remove('hidden');
      viewer?.classList.add('hidden');
    }
  }
});

document.body.addEventListener("click", async (e) => {
  const tagLink = e.target.closest(".tag-link");
  if (tagLink && tagLink.dataset.tag) {
    const tag = tagLink.dataset.tag;
    if (tag) {
      await window.openTag(tag);
      viewer?.classList.add('hidden');
      profile?.classList.add('hidden');
      usersub?.classList.add('hidden');
      comment?.classList.add('hidden');
      user?.classList.remove('hidden');
      homefilled?.classList.add('hidden');
      homesvg?.classList.remove('hidden');
      userfilled?.classList.add('hidden');
      usersvg?.classList.remove('hidden');
      bookmarkfilled?.classList.add('hidden');
      bookmarksvg?.classList.remove('hidden');
      searchsvg?.classList.add('hidden');
      searchfilled?.classList.remove('hidden');
      notiffilled?.classList.add('hidden');
      notifsvg?.classList.remove('hidden');
      viewer?.classList.add('hidden');
    }
  }
});
