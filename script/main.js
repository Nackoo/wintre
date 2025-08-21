let lastScrollTop = 0;

window.addEventListener('scroll', () => {
  let currentScroll = window.pageYOffset || document.documentElement.scrollTop;
  if (window.innerWidth <= 700) {
    const post = document.querySelector('#post');
    if (post) {
      if (currentScroll > lastScrollTop) {
        post.style.opacity = '0.3';
        post.style.bottom = '20px';
      } else {
        post.style.opacity = '1';
        post.style.bottom = '65px';
      }
    }

    const bar = document.querySelector('.smallbar');
    if (bar) {
      if (currentScroll > lastScrollTop) {
        bar.style.bottom = '-100vh';
      } else {
        bar.style.bottom = '0';
      }
    }
  }

  const header = document.querySelector('#timeline-header');
  if (header) {
    if (currentScroll > lastScrollTop) {
      header.style.top = '-100vh';
    } else {
      header.style.top = '0';
    }
  }

  lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});

document.querySelectorAll(".tab1").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab1").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.target).classList.remove("hidden");
  });
});

let followingLoadedOnce = false;

import { loadFollowingTweets } from "./timeline.js";

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", async () => {

    document.querySelector(".tab.active")?.classList.remove("active");
    tab.classList.add("active");

    document.getElementById("timeline").classList.add("hidden");
    document.getElementById("following1").classList.add("hidden");

    const target = tab.dataset.target;

    if (target === "timeline") {
      document.getElementById("timeline").classList.remove("hidden");
    }

    if (target === "following1") {
      document.getElementById("following1").classList.remove("hidden");

      if (!followingLoadedOnce) {
        await loadFollowingTweets(true);
        followingLoadedOnce = true;
      }
    }
  });
});

const allowedCounterIds = ["tweetInput", "retweetText"];
const maxLength = 300;

document.body.addEventListener("input", (e) => {
  const t = e.target;
  const isText = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type === "text");

  if (isText) {
    if (t.value.length > maxLength) {
      t.value = t.value.slice(0, maxLength);
    }

    if (allowedCounterIds.includes(t.id)) {
      let counter = t.nextElementSibling;
      if (!counter || !counter.classList.contains("char-counter")) {
        counter = document.createElement("div");
        counter.className = "char-counter";
        Object.assign(counter.style, {
          fontSize: "13px",
          textAlign: "right",
          color: "var(--color)",
        });
        t.parentNode.insertBefore(counter, t.nextSibling);
      }
      counter.textContent = `${t.value.length}/${maxLength}`;
    }
  }
});

document.body.addEventListener("paste", (e) => {
  const t = e.target;
  const isText = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type === "text");

  if (isText) {
    e.preventDefault();

    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const current = t.value;
    const { selectionStart: start, selectionEnd: end } = t;
    const maxInsert = maxLength - (current.length - (end - start));
    const insertableText = pasted.slice(0, maxInsert);

    t.setRangeText(insertableText, start, end, "end");

    if (allowedCounterIds.includes(t.id)) {
      let counter = t.nextElementSibling;
      if (counter && counter.classList.contains("char-counter")) {
        counter.textContent = `${t.value.length}/${maxLength}`;
      }
    }
  }
});
