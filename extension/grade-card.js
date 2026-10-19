/* Private grade images are rendered on the student's device, never as public site assets. */
(() => {
  function fit(ctx, value, width) {
    let text = String(value || "");
    while (text.length > 1 && ctx.measureText(text).width > width) text = text.slice(0, -2) + "…";
    return text;
  }
  async function render(course, records, previousSignature) {
    if (typeof OffscreenCanvas === "undefined") return [];
    const signature = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(records))))].map(n => n.toString(16).padStart(2, "0")).join("");
    if (signature === previousSignature) return [];
    const pages = Math.max(1, Math.ceil(records.length / 38)), images = [];
    for (let page = 0; page < pages; page++) {
      const items = records.slice(page * 38, (page + 1) * 38), height = 200 + items.length * 62;
      const canvas = new OffscreenCanvas(1100, height), ctx = canvas.getContext("2d");
      ctx.fillStyle = "#141923"; ctx.fillRect(0, 0, 1100, height);
      ctx.fillStyle = "#91a8ed"; ctx.font = "600 20px sans-serif"; ctx.fillText("UNITIFY  /  GRADES", 35, 42);
      ctx.fillStyle = "#f0f3fc"; ctx.font = "600 28px sans-serif"; ctx.fillText(fit(ctx, course.name.split("|")[0].trim(), 1020), 35, 90);
      ctx.fillStyle = "#8f9db7"; ctx.font = "18px sans-serif";
      ctx.fillText("ASSESSMENT", 35, 139); ctx.fillText("GRADE", 720, 139); ctx.fillText("RANGE", 860, 139); ctx.fillText("WEIGHT", 990, 139);
      items.forEach((r, index) => {
        const y = 153 + index * 62;
        ctx.fillStyle = index % 2 ? "#1c2433" : "#202a3b"; ctx.fillRect(24, y, 1052, 59);
        ctx.font = "20px sans-serif"; ctx.fillStyle = "#e2e9f7";
        const title = String(r.title), words = title.split(" "); let first = "", second = "";
        for (const word of words) {
          if (!second && ctx.measureText(first + " " + word).width < 650) first = (first + " " + word).trim();
          else second += (second ? " " : "") + word;
        }
        ctx.fillText(first, 35, y + (second ? 24 : 36));
        if (second) { ctx.font = "17px sans-serif"; ctx.fillText(fit(ctx, second, 650), 35, y + 47); }
        ctx.font = "600 21px sans-serif"; ctx.fillStyle = /^[—–-]?$/.test(r.value) ? "#7d8ba3" : "#b7cafc";
        ctx.fillText(fit(ctx, r.value, 130), 720, y + 36);
        ctx.font = "17px sans-serif"; ctx.fillStyle = "#9eacc3";
        ctx.fillText(fit(ctx, r.range, 120), 860, y + 36); ctx.fillText(fit(ctx, r.weight, 75), 990, y + 36);
      });
      ctx.fillStyle = "#7d8ca6"; ctx.font = "16px sans-serif";
      ctx.fillText(`${records.length} items · Moodle snapshot`, 35, height - 17); ctx.fillText(`${page + 1} / ${pages}`, 1000, height - 17);
      let bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.80 })).arrayBuffer());
      if (bytes.length > 200000) bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.55 })).arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 16000) binary += String.fromCharCode(...bytes.subarray(i, i + 16000));
      images.push({ courseId: course.id, page, pages, signature, image: btoa(binary) });
    }
    return images;
  }
  globalThis.UnitifyGradeCards = { render };
})();
