const bookmark = document.getElementById('bookmarkOverlay');
const profile = document.getElementById('profileOverlay');
const profilesub = document.getElementById('profileSubOverlay');
const user = document.getElementById('userOverlay');
const usersub = document.getElementById('userSubOverlay');
const tag = document.getElementById('tagSubOverlay');
const viewer = document.getElementById('tweetViewer');
const tweet = document.getElementById('tweetOverlay');
const retweet = document.getElementById('retweetOverlay');
const notification = document.getElementById('notificationOverlay');
const comment = document.getElementById('commentOverlay');

const bookmarksvg = document.querySelector('.smallbar img[src="image/bookmark.svg"]');
const homesvg = document.querySelector('.smallbar img[src="image/home.svg"]');
const usersvg = document.querySelector('.smallbar img[src="image/user.svg"]');
const searchsvg = document.querySelector('.smallbar img[src="image/search.svg"]');
const settingssvg = document.querySelector('.smallbar img[src="image/settings.svg"]');
const notifsvg = document.getElementById('notifsvg');

const bookmarkfilled = document.querySelector('.smallbar img[src="image/bookmark-filled.svg"]');
const homefilled = document.querySelector('.smallbar img[src="image/home-filled.svg"]');
const userfilled = document.querySelector('.smallbar img[src="image/user-filled.svg"]');
const searchfilled = document.querySelector('.smallbar img[src="image/search-filled.svg"]');
const settingsfilled = document.querySelector('.smallbar img[src="image/settings-filled.svg"]');
const notiffilled = document.querySelector('.smallbar img[src="image/notification-filled.svg"]');

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
    filledIcons.forEach(icon => icon?.classList.add('hidden'));
    Object.values(outlineIcons).forEach(icon => icon?.classList.remove('hidden'));
    outlineIcons[clickedIcon]?.classList.add('hidden');
    filledIconMap[clickedIcon]?.classList.remove('hidden');
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
