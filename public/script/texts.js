import { extractMentions } from './mention.js';

function tokenize(text) {
  const lower = (text || "").toLowerCase();

  const cleaned = lower.replace(/[^a-z0-9@#'\s]+/gi, " ");

  const raw = cleaned.split(/\s+/).filter(Boolean);

  const out = new Set();
  for (const t of raw) {
    out.add(t);
    const noApos = t.replace(/['’]/g, "");
    if (noApos && noApos !== t) out.add(noApos);
  }
  return Array.from(out);
}

function formatDate(timestamp) {
  if (!timestamp) return "";

  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function linkify(text) {
  const escaped = escapeHTML(text);
  return escaped.replace(/(https:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}


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

async function parseMentionsToLinks(text) {
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
      tokens[id] = `<span class="user-link" data-uid="${uid}" style="color:#00ba7c; cursor:pointer">${match}</span>`;
      return id;
    });
  }

  text = text.replace(/#(\w+)/g, (match, tag) => {
    const id = token();
    tokens[id] = `<span class="tag-link" data-tag="${tag}" style="color:#00ba7c; cursor:pointer">${match}</span>`;
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
  return str.replace(/[<>]/g, (char) => {
    const escapeMap = {
      '<': '&lt;',
      '>': '&gt;'
    };
    return escapeMap[char];
  });
}

export { tokenize, formatDate, linkify, applyReadMoreLogic, parseMentionsToLinks, escapeHTML }