/* ── Global Bestie — Luxury Enhancements ── */

/* ── 1. CUSTOM CURSOR ── */
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  document.body.append(dot, ring);

  let mx = -200, my = -200, rx = -200, ry = -200, rafId;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });

  (function tick() {
    rx += (mx - rx) * 0.1;
    ry += (my - ry) * 0.1;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    rafId = requestAnimationFrame(tick);
  })();

  const HOVER_SEL = 'a,button,[onclick],label,input[type="checkbox"],input[type="radio"],.prod-card,.cat-card,.bnav-item,[role="button"],select';
  const TEXT_SEL  = 'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="search"],textarea,.track-input,.form-input,.sidebar-search-input';

  document.addEventListener('mouseover', e => {
    const t = e.target;
    if (t.closest(TEXT_SEL)) {
      ring.classList.add('cr-text');
      ring.classList.remove('cr-hover');
    } else if (t.closest(HOVER_SEL)) {
      ring.classList.add('cr-hover');
      ring.classList.remove('cr-text');
    }
  });

  document.addEventListener('mouseout', e => {
    const t = e.target;
    if (t.closest(TEXT_SEL)) ring.classList.remove('cr-text');
    else if (t.closest(HOVER_SEL)) ring.classList.remove('cr-hover');
  });

  document.addEventListener('mousedown', () => {
    ring.classList.add('cr-click');
    dot.style.transform = 'translate(-50%,-50%) scale(0.55)';
  });
  document.addEventListener('mouseup', () => {
    ring.classList.remove('cr-click');
    dot.style.transform = 'translate(-50%,-50%) scale(1)';
  });

  document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; ring.style.opacity = '1'; });
})();


/* ── 2. SPLIT-TEXT HEADING REVEAL ── */
(function () {
  const TARGETS = [
    '#heroTitle', '#hiwTitle', '#spotlightTitle',
    '.page-title', '.section-title', '.about-hero-title',
    '.contact-hero-title', '.faq-hero-title', '.policy-hero-title'
  ];

  function splitEl(el) {
    if (!el || el.dataset.stDone) return [];
    el.dataset.stDone = '1';

    const children = Array.from(el.childNodes);
    el.innerHTML = '';

    const inners = [];
    let wordIdx = 0;

    children.forEach(node => {
      if (node.nodeType === 3) {
        // plain text — split by words
        const tokens = node.textContent.split(/(\s+)/);
        tokens.forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) {
            el.appendChild(document.createTextNode(tok));
          } else {
            const outer = document.createElement('span');
            outer.className = 'st-outer';
            const inner = document.createElement('span');
            inner.className = 'st-inner';
            inner.style.transitionDelay = (wordIdx * 0.065) + 's';
            inner.style.transition = 'transform 0.78s cubic-bezier(0.22,1,0.36,1)';
            inner.textContent = tok;
            outer.appendChild(inner);
            el.appendChild(outer);
            inners.push(inner);
            wordIdx++;
          }
        });
      } else if (node.nodeName === 'BR') {
        el.appendChild(document.createElement('br'));
      } else {
        // element child (em, span, etc.) — treat as one unit
        const outer = document.createElement('span');
        outer.className = 'st-outer';
        const inner = document.createElement('span');
        inner.className = 'st-inner';
        inner.style.transitionDelay = (wordIdx * 0.065) + 's';
        inner.style.transition = 'transform 0.78s cubic-bezier(0.22,1,0.36,1)';
        inner.appendChild(node.cloneNode(true));
        outer.appendChild(inner);
        el.appendChild(outer);
        inners.push(inner);
        wordIdx++;
      }
    });

    return inners;
  }

  function reveal(inners) {
    inners.forEach(s => s.classList.add('st-visible'));
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        reveal(e.target._stInners || []);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });

  function init() {
    TARGETS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const inners = splitEl(el);
        if (!inners.length) return;
        el._stInners = inners;
        // If already in viewport, reveal after a short delay
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) {
          setTimeout(() => reveal(inners), 120);
        } else {
          obs.observe(el);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 80);
  }
})();


/* ── 3. SCROLL PROGRESS BAR ── */
(function () {
  let bar = document.getElementById('page-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'page-progress';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  let ticking = false;
  function update() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
})();


/* ── 4. AMBIENT CURSOR GLOW ── */
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const glow = document.createElement('div');
  glow.style.cssText = 'position:fixed;pointer-events:none;z-index:1;width:520px;height:520px;border-radius:50%;transform:translate(-50%,-50%);will-change:left,top;transition:background 1.4s ease;background:radial-gradient(circle,rgba(196,82,90,0.055) 0%,transparent 62%)';
  document.body.appendChild(glow);
  let gx = -600, gy = -600, cx = -600, cy = -600, lastCol = 0;
  document.addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; });
  (function tick() {
    gx += (cx - gx) * 0.055; gy += (cy - gy) * 0.055;
    glow.style.left = gx + 'px'; glow.style.top = gy + 'px';
    const now = Date.now();
    if (now - lastCol > 1200) {
      lastCol = now;
      const el = document.elementFromPoint(cx, cy);
      const dark = el && !!el.closest('.hero,.spotlight,.footer,.announce-bar,.ink-bg,[style*="var(--ink"]');
      glow.style.background = dark
        ? 'radial-gradient(circle,rgba(212,175,55,0.07) 0%,transparent 62%)'
        : 'radial-gradient(circle,rgba(196,82,90,0.05) 0%,transparent 62%)';
    }
    requestAnimationFrame(tick);
  })();
})();


/* ── 5. HERO IMAGE PARALLAX ── */
(function () {
  const img = document.querySelector('.hero-img-frame img');
  if (!img) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        img.style.transform = 'translateY(' + (window.scrollY * 0.22) + 'px)';
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();


/* ── 6. SPOTLIGHT PARALLAX ── */
(function () {
  const bg = document.querySelector('.spotlight-bg');
  if (!bg) return;
  const spot = bg.closest('.spotlight');
  let ticking = false;
  function update() {
    const r = spot.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.bottom < -80 || r.top > vh + 80) { ticking = false; return; }
    const pct = (vh - r.top) / (vh + r.height);
    bg.style.transform = 'translateY(' + ((pct - 0.5) * 70) + 'px) scale(1.1)';
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
})();


/* ── 7. CATEGORY CARDS — STAGGER ENTRANCE ── */
(function () {
  const container = document.querySelector('.cat-cards');
  if (!container) return;
  const cards = Array.from(container.querySelectorAll('.cat-card'));
  cards.forEach(c => { c.style.opacity = '0'; });

  /* stagger each card by its index within the grid row */
  const colCount = () => Math.round(container.offsetWidth / (cards[0] && cards[0].offsetWidth || 260));

  new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    cards.forEach((card, i) => {
      const col = i % Math.max(colCount(), 1);
      card.style.animationDelay = (col * 0.1 + Math.floor(i / Math.max(colCount(), 1)) * 0.08) + 's';
      card.classList.add('cat-animated');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }).observe(container);
})();


/* ── 8. HIW STEPS — STAGGER ENTRANCE ── */
(function () {
  const steps = Array.from(document.querySelectorAll('.hiw-step'));
  if (!steps.length) return;
  steps.forEach(s => { s.style.opacity = '0'; });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const idx = steps.indexOf(e.target);
      e.target.style.animationDelay = (idx * 0.11) + 's';
      e.target.classList.add('step-animated');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.2 });
  steps.forEach(s => obs.observe(s));
})();


/* ── 9. TRUST ROW — STAGGER ENTRANCE ── */
(function () {
  const cards = Array.from(document.querySelectorAll('.trust-card'));
  if (!cards.length) return;
  cards.forEach(c => { c.style.opacity = '0'; });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const idx = cards.indexOf(e.target);
      e.target.style.animationDelay = (idx * 0.09) + 's';
      e.target.classList.add('trust-animated');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.25 });
  cards.forEach(c => obs.observe(c));
})();


/* ── 10. TESTIMONIALS — STAGGER ENTRANCE ── */
(function () {
  const cards = Array.from(document.querySelectorAll('.testi-card'));
  if (!cards.length) return;
  cards.forEach(c => { c.style.opacity = '0'; c.style.transform = 'translateY(22px)'; });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const idx = cards.indexOf(e.target);
      setTimeout(() => {
        e.target.style.transition = 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)';
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
      }, idx * 130);
      obs.unobserve(e.target);
    });
  }, { threshold: 0.15 });
  cards.forEach(c => obs.observe(c));
})();


/* ── 11. MAGNETIC BUTTONS ── */
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.btn-primary, .btn-wa, .spotlight-cta').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width  / 2)) * 0.2;
      const dy = (e.clientY - (r.top  + r.height / 2)) * 0.2;
      btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translateY(-2px)';
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
})();


/* ── 12. HERO STAT COUNTER ── */
(function () {
  const stats = document.querySelectorAll('.hstat-val[data-count]');
  if (!stats.length) return;

  function run(el) {
    el.classList.add('counting');
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || '';
    const dur = 1500;
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(ease * target) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { run(e.target); } });
  }, { threshold: 0.6, rootMargin: '0px 0px -40px 0px' }).observe(
    document.querySelector('.hero-stats') || stats[0]
  );

  /* fire all at once when the stats box enters view */
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    stats.forEach(s => run(s));
  }, { threshold: 0.5 }).observe(document.querySelector('.hero-stats') || stats[0]);
})();


/* ── 13. PRODUCT IMAGE BLUR-UP LOADING ── */
(function () {
  function wire(imgs) {
    imgs.forEach(img => {
      if (img.dataset.blurWired) return;
      img.dataset.blurWired = '1';
      if (img.complete && img.naturalWidth) return; /* already loaded */
      img.style.filter = 'blur(9px)';
      img.style.transition = 'filter 0.65s ease';
      img.addEventListener('load', () => { img.style.filter = ''; }, { once: true });
    });
  }

  wire(document.querySelectorAll('.prod-img img, .hero-img-frame img'));

  const grid = document.getElementById('productsGrid');
  if (grid) {
    new MutationObserver(() => {
      wire(grid.querySelectorAll('.prod-img img:not([data-blur-wired])'));
    }).observe(grid, { childList: true, subtree: true });
  }
})();
