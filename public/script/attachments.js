import { supabase } from "./firebase.js"

let ffmpeg;

async function compressVideoTo480(file) {
  currentFFmpeg = FFmpeg.createFFmpeg({ log: true });
  await currentFFmpeg.load();

  showCompressionOverlay(true);

  currentFFmpeg.setLogger(({ type, message }) => {
    appendCompressionLog(`[${type}] ${message}`);
  });

  currentFFmpeg.FS("writeFile", "input.mp4", await FFmpeg.fetchFile(file));

  await currentFFmpeg.run(
    "-i", "input.mp4",
    "-vf", "scale=-2:480",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "28",
    "-c:a", "aac",
    "output.mp4"
  );

  const data = currentFFmpeg.FS("readFile", "output.mp4");

  showCompressionOverlay(false);

  return new Blob([data.buffer], { type: "video/mp4" });
}

let currentFFmpeg = null;

function showCompressionOverlay(show) {
  let overlay = document.getElementById("compression-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "compression-overlay";
    overlay.style.cssText = `
      display:none;
      position:fixed;
      top:0; left:0;
      width:100%; height:100%;
      background:rgba(0,0,0,0.6);
      z-index:9999;
      display:flex;
      justify-content:center;
      align-items:center;
    `;

    const box = document.createElement("div");
    box.className = "overlay-box";
    box.style.cssText = `
      background: var(--dark);
      padding:20px;
      border-radius:10px;
      color: var(--color);
      font-family:monospace;
      width:80%;
      max-width:600px;
      max-height:70%;
      overflow:auto;
      box-shadow:0 0 20px rgba(0,0,0,0.7);
    `;

    const title = document.createElement("h2");
    title.textContent = "Compressing...";
    title.style.cssText = "margin-top:0; color:#fff; font-family:sans-serif; font-size:18px;";

    const logBox = document.createElement("pre");
    logBox.id = "compression-log";
    logBox.style.cssText = `
      margin-top:20px;
      font-size:12px;
      white-space:pre-wrap;
      max-height:300px;
      overflow:auto;
      border-radius: 7px;
      background: var(--light);
    `;

    const cancelBtn = document.createElement("div");
    cancelBtn.innerHTML = `<div class="flex"><button style="width:100%;padding:10px;margin-left:auto;margin-top:10px;">Cancel</button></div>`;
    cancelBtn.onclick = () => {
      if (currentFFmpeg) {
        try { currentFFmpeg.exit(); } catch {}
      }
      overlay.style.display = "none";
      const sendBtn = document.getElementById("postBtn");
      sendBtn.classList.remove("disabled");
      sendBtn.disabled = false;
      const sendRetweet = document.getElementById("sendRetweet");
      sendRetweet.disabled = false;
      sendRetweet.classList.remove('disabled');
    };

    box.appendChild(title);
    box.appendChild(logBox);
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  overlay.style.display = show ? "flex" : "none";
  if (show) document.getElementById("compression-log").textContent = "";
}

function appendCompressionLog(msg) {
  const logBox = document.getElementById("compression-log");
  if (logBox) {
    logBox.textContent += msg + "\n";
    logBox.scrollTop = logBox.scrollHeight;
  }
}

async function uploadToSupabase(file, uid) {
  if (!file) return { url: "", path: "", type: "" };

  if (file.type.startsWith("image/")) {
    const compressedBase64 = await compressImageTo480(file);

    const base64Size = Math.ceil((compressedBase64.length * 3) / 4);
    if (base64Size > 3 * 1024 * 1024) {
      alert("Image is too large after compression (max 3MB).");
      return { url: "", path: "", type: "" };
    }

    return {
      url: compressedBase64,
      path: null, 
      type: "image"
    };
  }

if (file.type.startsWith("video/")) {
  try {
    const compressedFile = await compressVideoTo480(file);

    const filePath = `wints/${uid}-${Date.now()}.mp4`;
    const { data, error } = await supabase.storage
      .from("wints")
      .upload(filePath, compressedFile, { upsert: true });

    if (error) {
      console.error("Video upload error:", error);
      return { url: "", path: "", type: "" };
    }

    const { data: publicUrlData } = supabase.storage
      .from("wints")
      .getPublicUrl(filePath);

    return {
      url: publicUrlData.publicUrl,
      path: filePath,
      type: "video",
    };
  } catch (err) {
    console.error("Video compression failed:", err);
    return { url: "", path: "", type: "" };
  }
}

  alert("Unsupported file type.");
  return { url: "", path: "", type: "" };
}

async function compressImageTo480(file) {
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = (e) => {
      const originalBase64 = e.target.result;

      const getSize = (b64) => Math.ceil((b64.length * 3) / 4);

      if (getSize(originalBase64) <= 1024 * 1024) {
        return resolve(originalBase64);
      }

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let width = img.width;
        let height = img.height;

        const maxDim = 480;
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.7; 
        let base64 = canvas.toDataURL("image/jpeg", quality);

        while (getSize(base64) > 1024 * 1024 && quality > 0.1) {
          quality -= 0.1;
          base64 = canvas.toDataURL("image/jpeg", quality);
        }

        while (getSize(base64) > 1024 * 1024) {
          width = Math.floor(width * 0.8);
          height = Math.floor(height * 0.8);
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          base64 = canvas.toDataURL("image/jpeg", 0.5); 
        }

        resolve(base64);
      };

      img.onerror = reject;
      img.src = originalBase64;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showImagePreview(input, previewElementId) {
  const file = input.files[0];
  const preview = document.getElementById(previewElementId);

  preview.innerHTML = "";

  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      if (file.type.startsWith("video/")) {
        preview.innerHTML = `
<video controls class="attachment">
  <source src="${e.target.result}">
</video>`;
      } else {
        preview.innerHTML = `
<img src="${e.target.result}" class="attachment">`;
      }
    };
    reader.readAsDataURL(file);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function setupVideoAutoplayOnVisibility(tweetElement) {
  const videos = tweetElement.querySelectorAll("video");
  const visibilityMap = new Map();

  function isCoveredByOverlay(video) {
    const overlays = document.querySelectorAll('.overlay, .useroverlay, .mediaOverlay');
    if (overlays.length === 0) return false;

    const videoRect = video.getBoundingClientRect();

    for (const overlay of overlays) {
      const overlayRect = overlay.getBoundingClientRect();

      if (
        overlayRect.width > 0 &&
        overlayRect.height > 0 &&
        !(overlayRect.right < videoRect.left || overlayRect.left > videoRect.right ||
          overlayRect.bottom < videoRect.top || overlayRect.top > videoRect.bottom)
      ) {
        return true;
      }
    }
    return false;
  }

  function updateVideoState(video) {
    const isVisible = visibilityMap.get(video) || false;
    const covered = isCoveredByOverlay(video);

    if (isVisible && !covered) {
      video.play().catch(() => {});
      video._isVisible = true;
    } else {
      video.pause();
      video._isVisible = false;
    }
  }

  const observer1 = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      visibilityMap.set(entry.target, entry.isIntersecting);
      updateVideoState(entry.target);
    });
  }, {
    threshold: 1.0
  });

  videos.forEach(video => {
    if (!video.hasAttribute("muted")) {
      video.muted = true;
    }

    video.addEventListener("ended", () => {
      if (video._isVisible) {
        video.play().catch(() => {});
      }
    });

    observer1.observe(video);
  });

  function onScrollOrResize() {
    videos.forEach(video => updateVideoState(video));
  }
  window.addEventListener('scroll', onScrollOrResize, {
    passive: true
  });
  window.addEventListener('resize', onScrollOrResize);

  const overlaysParent = document.body;
  const mutationObserver = new MutationObserver(() => {
    videos.forEach(video => updateVideoState(video));
  });

  mutationObserver.observe(overlaysParent, {
    attributes: true,
    childList: true,
    subtree: true
  });
}

function checkOverlayState() {
  const overlays = document.querySelectorAll(".overlay, .useroverlay, .mediaOverlay");

  const anyVisible = Array.from(overlays).some(el => !el.classList.contains("hidden"));

  if (anyVisible) {
    document.body.classList.add("no-scroll");
  } else {
    document.body.classList.remove("no-scroll");
  }
}

const observer = new MutationObserver(checkOverlayState);

document.querySelectorAll(".overlay, .useroverlay, .mediaOverlay").forEach(el => {
  observer.observe(el, {
    attributes: true,
    attributeFilter: ['class']
  });
});

const overlay = document.querySelector(".mediaOverlay");
const overlayContent = document.getElementById("overlayContent");

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";
  }
});

document.addEventListener("click", (e) => {
  if (e.target.id === "closeOverlay") {
    overlay.classList.add("hidden");
    overlayContent.innerHTML = "";
  }
});

document.body.addEventListener("click", async (e) => {
  if (e.target.tagName === "VIDEO" || e.target.closest("video")) {
    return;
  }

  const container = e.target.closest(".attachment, .rt-attachment, .attachment1, .attachment2");
  if (!container) return;

  let img;

  if (
    container.classList.contains("attachment1") ||
    container.classList.contains("attachment2")
  ) {
    img = container;
  } else {
    img = [...container.querySelectorAll("img")].find(el => {
      const src = (el.currentSrc || el.src || "");
      const cleaned = src.split("#")[0].split("?")[0].toLowerCase();
      return !cleaned.endsWith("/image/volume.svg") &&
        !cleaned.endsWith("/image/volume-muted.svg");
    });
  }

  if (img) {
    overlay.classList.remove("hidden");
    overlayContent.innerHTML = `<img src="${img.src}" />`;
  }
});

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

document.body.addEventListener("change", (e) => {
  if (e.target.classList.contains("comment-media-input") && e.target.closest(".reply-box")) {
    const commentId = e.target.closest(".reply-box").id.replace("reply-box-", "");
    showImagePreview(e.target, `replyPreview-${commentId}`);
  }
});

document.getElementById("commentMediaInput").addEventListener("change", () => {
  showImagePreview(document.getElementById("commentMediaInput"), "commentPreview");
});

async function handleMediaInput(e, previewEl) {
  const files = Array.from(e.target.files);
  previewEl.innerHTML = "";
  previewEl.style.position = "relative";
  previewEl.style.marginBottom = "20px";

  const videos = files.filter(f => f.type.startsWith("video/"));
  const images = files.filter(f => f.type.startsWith("image/"));

  if (videos.length > 1) {
    alert("videos can't be inserted more than one");
    return;
  }
  if (images.length > 4) {
    alert("maximum image inserted is 4");
    return;
  }

  if (videos.length > 0 && images.length > 0) {
    alert("You can't upload videos and images together");
    return;
  }

  files.forEach(file => {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeCounter = document.createElement("div");
    sizeCounter.style.position = "absolute";
    sizeCounter.style.top = "10px";
    sizeCounter.style.left = "10px";
    sizeCounter.style.background = "rgba(0,0,0,0.6)";
    sizeCounter.style.color = "white";
    sizeCounter.style.padding = "2px 6px";
    sizeCounter.style.borderRadius = "4px";
    sizeCounter.style.fontSize = "12px";
    sizeCounter.style.zIndex = "10";
    sizeCounter.textContent = `${sizeInMB} MB`;
    previewEl.appendChild(sizeCounter);
  });

  if (videos.length === 1) {
    const file = videos[0];
    const videoEl = document.createElement("video");
    videoEl.src = URL.createObjectURL(file);
    videoEl.controls = true;
    videoEl.style.maxWidth = "100%";
    videoEl.style.maxHeight = "333px";
    previewEl.appendChild(videoEl);
  }

  for (const file of images) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.style.maxWidth = "100%";
    img.style.maxHeight = "200px";
    img.style.margin = "5px";
    previewEl.appendChild(img);
  }

  if (images.length > 1) {
    const compressedBase64s = await Promise.all(images.map(f => compressImageTo480(f)));
    const collageBase64 = await makeCollage(compressedBase64s);
    console.log("Collage ready for upload:", collageBase64);
  }
}

async function makeCollage(base64Images) {
  return new Promise((resolve, reject) => {
    const images = [];
    let loaded = 0;

    base64Images.forEach((src, i) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        images[i] = img;
        loaded++;
        if (loaded === base64Images.length) {
          buildCollage(images);
        }
      };
      img.onerror = reject;
      img.src = src;
    });

    function buildCollage(images) {
      let canvas = document.createElement("canvas");
      let ctx = canvas.getContext("2d");

      if (images.length === 2) {
        canvas.width = 960;
        canvas.height = 480;
        images.forEach((img, idx) => {
          const x = idx * 480;
          const y = 0;
          drawKeepAspect(ctx, img, x, y, 480, 480);
        });
      } else if (images.length === 3) {
        canvas.width = 960;
        canvas.height = 960;
        drawKeepAspect(ctx, images[0], 0, 0, 480, 480);
        drawKeepAspect(ctx, images[1], 480, 0, 480, 480);
        drawKeepAspect(ctx, images[2], 240, 480, 480, 480);
      } else if (images.length === 4) {
        canvas.width = 960;
        canvas.height = 960;
        let positions = [
          [0, 0], [480, 0],
          [0, 480], [480, 480]
        ];
        images.forEach((img, i) => {
          const [x, y] = positions[i];
          drawKeepAspect(ctx, img, x, y, 480, 480);
        });
      } else {
        canvas.width = 480;
        canvas.height = 480;
        drawKeepAspect(ctx, images[0], 0, 0, 480, 480);
      }

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    }

    function drawKeepAspect(ctx, img, x, y, w, h) {
      const imgRatio = img.width / img.height;
      const boxRatio = w / h;

      let drawW, drawH;
      if (imgRatio > boxRatio) {
        drawH = h;
        drawW = img.width * (h / img.height);
      } else {
        drawW = w;
        drawH = img.height * (w / img.width);
      }

      const offsetX = x + (w - drawW) / 2;
      const offsetY = y + (h - drawH) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    }
  });
}

document.getElementById("mediaInput").addEventListener("change", (e) => {
  handleMediaInput(e, document.getElementById("tweetPreview"));
});

document.getElementById("retweetMedia-TWEETID").addEventListener("change", (e) => {
  handleMediaInput(e, document.getElementById("retweetPreview-TWEETID"));
});

export { uploadToSupabase, compressImageTo480, showImagePreview, readFileAsBase64, setupVideoAutoplayOnVisibility, getSupabaseVideo, getSafeFilename, downloadFile, makeCollage }