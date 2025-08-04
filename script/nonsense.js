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
const usersvg = document.querySelector('.smallbar img[src="image/user.svg"]');
const searchsvg = document.querySelector('.smallbar img[src="image/search.svg"]');
const settingssvg = document.querySelector('.smallbar img[src="image/settings.svg"]');

const bookmarkfilled = document.querySelector('.smallbar img[src="image/bookmark-filled.svg"]');
const homefilled = document.querySelector('.smallbar img[src="image/home-filled.svg"]');
const userfilled = document.querySelector('.smallbar img[src="image/user-filled.svg"]');
const searchfilled = document.querySelector('.smallbar img[src="image/search-filled.svg"]');
const settingsfilled = document.querySelector('.smallbar img[src="image/settings-filled.svg"]');

if (bookmarksvg) {
  bookmarksvg.addEventListener("click", async () => {
    profile?.classList.add('hidden');
    profilesub?.classList.add('hidden');
    user?.classList.add('hidden');
    usersub?.classList.add('hidden');
    tag?.classList.add('hidden');
    follow?.classList.add('hidden');
    viewer?.classList.add('hidden');

    settingsfilled?.classList.add('hidden');
    homefilled?.classList.add('hidden');
    bookmarksvg?.classList.add('hidden');
    userfilled?.classList.add('hidden');
    searchfilled?.classList.add('hidden');

    settingssvg?.classList.remove('hidden');
    homesvg?.classList.remove('hidden');
    usersvg?.classList.remove('hidden');
    searchsvg?.classList.remove('hidden');
    bookmarkfilled?.classList.remove('hidden');

    document.body.classList.add("no-scroll");
  });
}

if (homesvg) {
  homesvg.addEventListener("click", async () => {
    follow?.classList.add('hidden');
    profile?.classList.add('hidden');
    profilesub?.classList.add('hidden');
    user?.classList.add('hidden');
    usersub?.classList.add('hidden');
    bookmark?.classList.add('hidden');
    tag?.classList.add('hidden');

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

    document.body.classList.remove("no-scroll");
  });
}

if (usersvg) {
  usersvg.addEventListener("click", async () => {
    bookmark?.classList.add('hidden');
    profilesub?.classList.add('hidden');
    user?.classList.add('hidden');
    usersub?.classList.add('hidden');
    tag?.classList.add('hidden');
    follow?.classList.add('hidden');
    viewer?.classList.add('hidden');

    settingsfilled?.classList.add('hidden');
    homefilled?.classList.add('hidden');
    bookmarkfilled?.classList.add('hidden');
    searchfilled?.classList.add('hidden');
    usersvg?.classList.add('hidden');

    settingssvg?.classList.remove('hidden');
    searchsvg?.classList.remove('hidden');
    bookmarksvg?.classList.remove('hidden');
    homesvg?.classList.remove('hidden');
    userfilled?.classList.remove('hidden');

    document.body.classList.add("no-scroll");
  });
}

if (searchsvg) {
  searchsvg.addEventListener("click", async () => {
    bookmark?.classList.add('hidden');
    profile?.classList.add('hidden');
    profilesub?.classList.add('hidden');
    usersub?.classList.add('hidden');
    tag?.classList.add('hidden');
    viewer?.classList.add('hidden');

    settingsfilled?.classList.add('hidden');
    homefilled?.classList.add('hidden');
    bookmarkfilled?.classList.add('hidden');
    userfilled?.classList.add('hidden');
    searchsvg?.classList.add('hidden');

    settingssvg?.classList.remove('hidden');
    bookmarksvg?.classList.remove('hidden');
    homesvg?.classList.remove('hidden');
    usersvg?.classList.remove('hidden');
    searchfilled?.classList.remove('hidden');

    document.body.classList.add("no-scroll");
  });
}

if (settingssvg) {
  settingssvg.addEventListener("click", async () => {
    bookmark?.classList.add('hidden');
    profile?.classList.add('hidden');
    user?.classList.add('hidden');
    usersub?.classList.add('hidden');
    tag?.classList.add('hidden');
    follow?.classList.add('hidden');
    viewer?.classList.add('hidden');

    homefilled?.classList.add('hidden');
    bookmarkfilled?.classList.add('hidden');
    userfilled?.classList.add('hidden');
    searchfilled?.classList.add('hidden');
    settingssvg?.classList.add('hidden');

    bookmarksvg?.classList.remove('hidden');
    homesvg?.classList.remove('hidden');
    usersvg?.classList.remove('hidden');
    searchsvg?.classList.remove('hidden');
    settingsfilled?.classList.remove('hidden');

    document.body.classList.add("no-scroll");
  });
}

function hidebookmark() {
  document.querySelector('.useroverlay').classList.add('hidden');
  homesvg.classList.add('hidden');
  bookmarkfilled.classList.add('hidden');
  bookmarksvg.classList.remove('hidden');
  homefilled.classList.remove('hidden');
  document.body.classList.remove("no-scroll");
}

function hideprofile() {
  document.querySelector('#profileOverlay').classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  userfilled.classList.add('hidden');
  usersvg.classList.remove('hidden');
  document.body.classList.remove("no-scroll");
}

function hideuser() {
  document.querySelector('#userOverlay').classList.add('hidden');
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  searchfilled.classList.add('hidden');
  searchsvg.classList.remove('hidden');
  document.body.classList.remove("no-scroll");
}

function hidesettings() {
  document.querySelector('#profileSubOverlay').classList.add('hidden')
  homesvg.classList.add('hidden');
  homefilled.classList.remove('hidden');
  settingsfilled.classList.add('hidden');
  settingssvg.classList.remove('hidden');
  document.body.classList.remove("no-scroll");
}

function closeUser() {
  document.querySelector('#userSubOverlay').classList.add('hidden');
  document.querySelector('#userOverlay').classList.remove('hidden');
}
