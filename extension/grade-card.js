/* Private grade images are rendered on the student's device, never as public site assets. */
(() => {
  function fit(ctx, value, width) {
    let text = String(value || "");
    while (text.length > 1 && ctx.measureText(text).width > width) text = text.slice(0, -2) + "…";
    return text;
  }
  async function render(course, records, previousSignature, group = "") {
    if (typeof OffscreenCanvas === "undefined") return [];
    const V = globalThis.UnitifyGradeView || await import(chrome.runtime.getURL("lib/grade-view.mjs"));
    const view = V.gradeView(records, group), layout = V.gradePages(view);
    const signature = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ format: V.CARD_FORMAT, group, records: view.records }))))].map(n => n.toString(16).padStart(2, "0")).join("");
    if (signature === previousSignature) return [];
    const pages = layout.length, images = [];
    for (let page = 0; page < pages; page++) {
      const sectionHeight = s => 40 + (s.section === "registry" ? Math.ceil(s.records.length / 3) * 98 : s.records.length * (s.section === "attendance" ? 52 : 68));
      const height = 190 + layout[page].reduce((sum, s) => sum + sectionHeight(s), 0);
      const canvas = new OffscreenCanvas(1100, height), ctx = canvas.getContext("2d");
      const box = (x, y, w, h, color, border) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fillStyle = color; ctx.fill(); if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); } };
      const write = (text, x, y, font = "20px sans-serif", color = "#e2e9f7", width = 1000) => { ctx.font = font; ctx.fillStyle = color; ctx.fillText(fit(ctx, text, width), x, y); };
      ctx.fillStyle = "#141923"; ctx.fillRect(0, 0, 1100, height);
      write("UNITIFY  /  GRADES", 28, 36, "600 18px sans-serif", "#91a8ed");
      write(group, 900, 36, "18px sans-serif", "#8f9db7", 170);
      write(course.name.split("|")[0].trim(), 28, 80, "600 28px sans-serif", "#f0f3fc", 1040);
      let y = 112;
      const labels = { registry: "REGISTER / TOTALS", attendance: "ATTENDANCE", exams: "EXAMS & CHECKPOINTS", assignments: "ASSIGNMENTS & PRACTICE" };
      for (const section of layout[page]) {
        write(labels[section.section] + (section.continued ? " · CONTINUED" : ""), 28, y + 18, "600 16px sans-serif", "#9baac4");
        y += 30;
        section.records.forEach((r, index) => {
          if (section.section === "registry") {
            const x = 28 + index % 3 * 352, top = y + Math.floor(index / 3) * 98;
            box(x, top, 340, 86, "#1b263b", "#354968");
            write(r.title.replace(/^regist(?:er|ry)\s*(?:\(not to edit\))?\s*/iu, ""), x + 16, top + 26, "17px sans-serif", "#a9bad5", 306);
            write(r.value, x + 16, top + 64, "600 30px sans-serif", V.hasGrade(r.value) ? "#c2d3ff" : "#7d8ba3", 210);
            write(r.range, x + 234, top + 63, "15px sans-serif", "#7d8ba3", 90);
          } else if (section.section === "attendance") {
            const top = y + index * 52;
            box(28, top, 1044, 44, "#1a302e", "#30504a");
            write(r.title, 44, top + 29, "19px sans-serif", "#c3dfd8", 750);
            const percent = /^0\s*[-–—]\s*100$/.test(r.range) && /^\d+(?:[.,]\d+)?$/.test(r.value);
            write(r.value + (percent ? "%" : ""), 886, top + 30, "600 24px sans-serif", "#94d4bb", 160);
          } else {
            const top = y + index * 68;
            box(28, top, 1044, 62, index % 2 ? "#1b2331" : "#202b3c");
            ctx.font = "20px sans-serif";
            const words = r.title.split(" "); let first = "", second = "";
            for (const word of words) {
              if (!second && ctx.measureText((first + " " + word).trim()).width <= 770) first = (first + " " + word).trim();
              else second += (second ? " " : "") + word;
            }
            write(first || second, 44, top + (second && first ? 25 : 36), "20px sans-serif", "#e2e9f7", 770);
            if (second && first) write(second, 44, top + 49, "17px sans-serif", "#a9b8d0", 770);
            write(r.value, 886, top + 28, "600 24px sans-serif", V.hasGrade(r.value) ? "#b7cafc" : "#7d8ba3", 160);
            write(r.range + (V.hasGrade(r.weight) ? " · " + r.weight : ""), 886, top + 49, "14px sans-serif", "#8f9db7", 160);
          }
        });
        y += sectionHeight(section) - 30;
      }
      write(`${view.records.length} items · Moodle snapshot${view.hidden ? ` · ${view.hidden} other-group rows hidden` : ""}`, 28, height - 25, "15px sans-serif", "#7d8ca6", 820);
      box(890, height - 61, 182, 44, "#2b3d60", "#718dcb");
      write(`Page ${page + 1}/${pages}`, 910, height - 31, "600 23px sans-serif", "#eef3ff", 150);
      let bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.80 })).arrayBuffer());
      if (bytes.length > 200000) bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.55 })).arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 16000) binary += String.fromCharCode(...bytes.subarray(i, i + 16000));
      images.push({ courseId: course.id, page, pages, signature, format: V.CARD_FORMAT, group, image: btoa(binary) });
    }
    return images;
  }
  globalThis.UnitifyGradeCards = { render };
})();
