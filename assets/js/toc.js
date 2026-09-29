// toc.js: progressive enhancement for the table of contents.
// Marks the section currently being read with aria-current="location".
// Without JS the TOC is a plain jump list.
(() => {
  const toc = document.getElementById("markdown-toc");
  if (!toc) return;

  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const headings = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));

  // The current section is the last one whose heading is above the top quarter
  // of the viewport. Recomputing from positions keeps this right after jumps
  // (deep links, back button, reload) that skip over several sections.
  const update = () => {
    const line = innerHeight / 4;
    let current = -1;
    headings.forEach((h, i) => {
      if (h && h.getBoundingClientRect().top <= line) current = i;
    });
    links.forEach((a, i) => {
      if (i === current) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  };

  let queued = false;
  addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }, { passive: true });
  addEventListener("resize", update);
  update();
})();
