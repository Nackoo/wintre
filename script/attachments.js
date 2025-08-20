import { supabase } from "./firebase.js"

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
    if (file.size > 3 * 1024 * 1024) {
      alert("Video exceeds 3MB. Please upload a smaller file.");
      return { url: "", path: "", type: "" };
    }

    const filePath = `wints/${uid}-${Date.now()}.mp4`;

    const { data, error } = await supabase.storage
      .from("wints")
      .upload(filePath, file, { upsert: true });

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
      type: "video"
    };
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
    threshold: 0.65
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

export { uploadToSupabase, compressImageTo480, showImagePreview, readFileAsBase64, setupVideoAutoplayOnVisibility }
