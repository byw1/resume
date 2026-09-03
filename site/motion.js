/**
 * hired.tools — the page's behaviour.
 *
 * Rules this file keeps, because the product keeps them:
 *
 * 1. Nothing here is required to read the page. Every string that gets typed,
 *    every element that fades in and every number that counts up is already in
 *    the HTML. The `js` class added in the document head is what opts an
 *    element into being hidden first — so with scripting off, or before this
 *    file arrives, the page is simply finished.
 * 2. Nothing loops. Animations play once, on entry, and then hold.
 * 3. Anyone who has asked their system to calm down gets a still page. The
 *    stylesheet neutralises the transitions; `calm` below skips the work.
 */

(function () {
  "use strict";

  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /** Run fn the first time el crosses into view, then stop watching it. */
  function once(el, fn, margin) {
    if (!("IntersectionObserver" in window)) { fn(el); return; }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          fn(entry.target);
        });
      },
      { rootMargin: margin || "0px 0px -12% 0px", threshold: 0.15 }
    );
    io.observe(el);
  }

  // -------------------------------------------------------------------------
  // The mark, built out into an object
  //
  // The markup ships the flat SVG. This puts a preserve-3d stage beside it and
  // only then adds `on`, which is what hides the picture — so the mark is the
  // mark with scripting off, and this file failing to load costs nothing.
  //
  // Geometry is the same 64-unit grid the SVG uses, expressed as fractions of
  // --s so one element scales to any size: bar height 10.9%, longest bar 50%,
  // corner radius 23.4%, the three bars at 26.6%, 44.5% and 62.5% down.
  // -------------------------------------------------------------------------

  var BARS = [
    { y: 0.265625, w: 0.203125 },
    { y: 0.4453125, w: 0.3515625 },
    { y: 0.625, w: 0.5 },
  ];

  /** Slices through the slab. Enough that the rim reads as milled, not stepped. */
  var SLICES = 14;

  function buildMark(host) {
    var size = parseFloat(host.getAttribute("data-mark3d")) || 24;
    host.style.setProperty("--s", size + "px");

    var depth = size * 0.24;
    var stage = document.createElement("span");
    stage.className = "m3d-stage";

    var slab = document.createElement("span");
    slab.className = "m3d-slab";
    for (var i = 0; i < SLICES; i++) {
      var slice = document.createElement("i");
      slice.style.setProperty("--z", (i * depth) / SLICES);
      slab.appendChild(slice);
    }
    stage.appendChild(slab);

    BARS.forEach(function (spec, index) {
      var bar = document.createElement("span");
      bar.className = "m3d-bar";
      bar.style.setProperty("--y", spec.y);
      bar.style.setProperty("--w", spec.w);
      bar.style.setProperty("--bi", index);

      var grow = document.createElement("span");
      for (var j = 0; j < 4; j++) {
        var slice = document.createElement("i");
        slice.style.setProperty("--z", j * size * 0.009);
        grow.appendChild(slice);
      }
      bar.appendChild(grow);
      stage.appendChild(bar);
    });

    var glass = document.createElement("span");
    glass.className = "m3d-glass";
    stage.appendChild(glass);

    host.appendChild(stage);
    host.classList.add("on");

    // The field is the mark's own region grown by four times its size, so the
    // cursor is answered well before it arrives rather than only on top of the
    // 24px target itself.
    if (!calm) {
      window.addEventListener(
        "pointermove",
        function (event) {
          var box = host.getBoundingClientRect();
          if (!box.width) return;
          var reach = box.width * 4;
          var dx = Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / reach));
          var dy = Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / reach));
          stage.style.setProperty("--ry", -23 + dx * 14 + "deg");
          stage.style.setProperty("--rx", 12 - dy * 14 + "deg");
          glass.style.setProperty("--gx", 34 - dx * 30 + "%");
          glass.style.setProperty("--gy", 24 - dy * 22 + "%");
        },
        { passive: true }
      );
    }

    once(host, function (target) { target.classList.add("in"); });
  }

  $$("[data-mark3d]").forEach(buildMark);

  // -------------------------------------------------------------------------
  // The headline, a word at a time
  //
  // Each word gets a box that clips it and an inner span that rises out of the
  // box. Element children — the accented span in the hero headline — are
  // wrapped whole rather than taken apart, so the accent survives and any
  // markup inside it comes along.
  // -------------------------------------------------------------------------

  $$("[data-words]").forEach(function (line) {
    var pieces = [];

    Array.prototype.slice.call(line.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (chunk) {
          if (!chunk.trim()) { if (chunk) pieces.push(document.createTextNode(chunk)); return; }
          var inner = document.createElement("span");
          inner.textContent = chunk;
          pieces.push(inner);
        });
      } else if (node.nodeType === 1) {
        pieces.push(node);
      }
    });

    if (!pieces.length) return;

    line.textContent = "";
    var i = 0;
    pieces.forEach(function (piece) {
      if (piece.nodeType === 3) { line.appendChild(piece); return; }
      var box = document.createElement("span");
      box.className = "w";
      box.style.setProperty("--wi", i++);
      box.appendChild(piece);
      line.appendChild(box);
    });

    line.classList.add("split");
    once(line, function (target) { target.classList.add("in"); }, "0px");
  });

  // -------------------------------------------------------------------------
  // Pointer light on a card, and the pull on the primary action
  //
  // Both write a custom property and stop. No layout is read on move except
  // the one rect, and neither runs at all for anyone who asked for calm.
  // -------------------------------------------------------------------------

  if (!calm) {
    $$("[data-spot]").forEach(function (card) {
      card.addEventListener(
        "pointermove",
        function (event) {
          var box = card.getBoundingClientRect();
          card.style.setProperty("--mx", event.clientX - box.left + "px");
          card.style.setProperty("--my", event.clientY - box.top + "px");
        },
        { passive: true }
      );
    });

    $$("[data-magnet]").forEach(function (button) {
      var pull = Number(button.getAttribute("data-magnet")) || 5;
      window.addEventListener(
        "pointermove",
        function (event) {
          var box = button.getBoundingClientRect();
          if (!box.width) return;
          var cx = box.left + box.width / 2;
          var cy = box.top + box.height / 2;
          var reach = box.width;
          var dx = (event.clientX - cx) / reach;
          var dy = (event.clientY - cy) / reach;
          // Outside the reach it sits still. A button that leans towards a
          // cursor on the other side of the page is a button that is never
          // still, which is the opposite of the point.
          var near = Math.abs(dx) < 1.1 && Math.abs(dy) < 1.6;
          button.style.setProperty("--mgx", near ? dx * pull + "px" : "0px");
          button.style.setProperty("--mgy", near ? dy * pull + "px" : "0px");
        },
        { passive: true }
      );
    });
  }

  // -------------------------------------------------------------------------
  // Reveals
  // -------------------------------------------------------------------------

  $$("[data-reveal]").forEach(function (el) {
    once(el, function (target) { target.classList.add("in"); });
  });

  // Groups whose children animate off the parent's `in` class — the funnel
  // bars and the velocity chart both do this so the bars grow as one gesture.
  $$("[data-grow]").forEach(function (el) {
    once(el, function (target) { target.classList.add("in"); });
  });

  // -------------------------------------------------------------------------
  // Nav and scroll progress
  // -------------------------------------------------------------------------

  var nav = $(".nav");
  var progress = $(".progress");
  var ticking = false;

  /* The stylesheet drives the progress bar off a scroll timeline where the
     browser supports one, which is both smoother and off the main thread.
     Only fill it from here when it doesn't. */
  var cssDrivesProgress =
    window.CSS && CSS.supports && CSS.supports("animation-timeline: scroll()");
  if (cssDrivesProgress) progress = null;

  /* Nav links that point at a section on this page, paired with their target,
     so scrolling can say which one you are in. Anything pointing elsewhere —
     GitHub, the app — is left alone. */
  var marks = $$(".nav-links a.link[href^='#']")
    .map(function (link) {
      var section = document.getElementById(link.getAttribute("href").slice(1));
      return section ? { link: link, section: section } : null;
    })
    .filter(Boolean);
  var marked = null;

  function markSection() {
    if (!marks.length) return;
    /* The section you are "in" is the last one whose top has passed a line a
       third of the way down the viewport — steadier than asking which is most
       visible, because these sections differ wildly in height. */
    var line = window.innerHeight / 3;
    var current = null;
    marks.forEach(function (m) {
      if (m.section.getBoundingClientRect().top <= line) current = m;
    });
    if (current === marked) return;
    if (marked) marked.link.removeAttribute("aria-current");
    if (current) current.link.setAttribute("aria-current", "true");
    marked = current;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY || window.pageYOffset;
      if (nav) nav.classList.toggle("stuck", y > 12);
      if (progress) {
        var height = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.setProperty("--p", height > 0 ? Math.min(1, y / height) : 0);
      }
      markSection();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // -------------------------------------------------------------------------
  // Smoothed scrolling
  //
  // A mouse wheel is a series of jumps. This turns each notch into a short
  // glide towards a target the wheel moves, so the page arrives rather than
  // teleports.
  //
  // Deliberately NOT the usual implementation of this, which translates a
  // wrapper element and leaves the document's real scroll offset at zero. Three
  // things here read that offset — the sticky tour chapters, the progress bar
  // and the two scroll timelines — and a transformed wrapper breaks all of
  // them. So the scroll is real: window.scrollTo, once a frame, towards a
  // target. Everything that watches the scrollbar goes on working, including
  // the browser's own find-on-page and the back button.
  //
  // Three things are left alone, on purpose:
  //   - touch, where the platform's momentum is better than anything here;
  //   - precision devices, because a trackpad already emits a smooth stream and
  //     easing on top of it only adds lag — the small-delta test below is what
  //     tells the two apart;
  //   - a pane with its own scrollbar, which should scroll itself.
  // -------------------------------------------------------------------------

  if (!calm && window.matchMedia("(pointer: fine)").matches) {
    (function () {
      var target = 0;
      var frame = 0;
      var last = 0;
      var gliding = false;
      var root = document.documentElement;

      /* Below this, a wheel event came from a trackpad or a precision mouse and
         is already smooth. Above it, it is a notch. */
      var NOTCH = 40;

      function limit() {
        return Math.max(0, root.scrollHeight - window.innerHeight);
      }

      function step(now) {
        var gap = Math.min(64, now - last);
        last = now;

        var current = window.scrollY;
        var left = target - current;

        if (Math.abs(left) < 0.5) {
          window.scrollTo(0, target);
          stop();
          return;
        }

        // Frame-rate independent, so 120Hz does not arrive twice as fast.
        var t = 1 - Math.pow(1 - 0.2, gap / 16.67);
        window.scrollTo(0, current + left * t);
        frame = requestAnimationFrame(step);
      }

      function stop() {
        frame = 0;
        gliding = false;
        // Hand the anchors back their smooth scrolling.
        root.style.scrollBehavior = "";
      }

      /* Anything that moves the page other than this — a scrollbar drag, Page
         Down, an anchor, the browser restoring a position — becomes the new
         target, or the next notch would yank the page back to where the glide
         had been heading. */
      function resync() {
        if (!gliding) target = window.scrollY;
      }
      window.addEventListener("scroll", resync, { passive: true });
      window.addEventListener("resize", resync, { passive: true });

      function ownScroller(node) {
        while (node && node.nodeType === 1 && node !== document.body) {
          var style = window.getComputedStyle(node);
          if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
            return true;
          }
          node = node.parentNode;
        }
        return false;
      }

      window.addEventListener(
        "wheel",
        function (event) {
          if (event.ctrlKey || event.defaultPrevented) return;
          if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
          if (event.deltaMode === 0 && Math.abs(event.deltaY) < NOTCH) return;
          if (ownScroller(event.target)) return;

          var amount =
            event.deltaY *
            (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1);
          if (!amount) return;

          event.preventDefault();

          if (!gliding) {
            target = window.scrollY;
            gliding = true;
            last = performance.now();
            // A CSS smooth scroll on every frame of our own would fight this.
            root.style.scrollBehavior = "auto";
          }

          target = Math.max(0, Math.min(limit(), target + amount));
          if (!frame) frame = requestAnimationFrame(step);
        },
        { passive: false }
      );
    })();
  }

  // -------------------------------------------------------------------------
  // The transcript
  //
  // The text is already on the page; this retypes it. Each turn waits for the
  // one before it, tool chips appear while the answer is still being written,
  // and each chip goes green when its call "returns" — which is what actually
  // happens in a client, and the reason the sequence is worth showing at all.
  // -------------------------------------------------------------------------

  function typeInto(el, done) {
    var full = el.getAttribute("data-text") || el.textContent;
    el.setAttribute("data-text", full);
    var speed = Number(el.getAttribute("data-speed")) || 16;
    el.textContent = "";

    var caret = document.createElement("span");
    caret.className = "caret";
    el.appendChild(caret);

    var i = 0;
    (function step() {
      // Type in small bites rather than one character per frame: a per-frame
      // character is slower than anyone reads and makes long lines drag.
      var bite = full.charAt(i) === " " ? 2 : 1;
      i = Math.min(full.length, i + bite);
      caret.insertAdjacentText("beforebegin", full.slice(i - bite, i));
      if (i < full.length) {
        setTimeout(step, speed);
      } else {
        caret.remove();
        if (done) done();
      }
    })();
  }

  function playTape(tape) {
    var steps = $$("[data-step]", tape).sort(function (a, b) {
      return Number(a.getAttribute("data-step")) - Number(b.getAttribute("data-step"));
    });

    function next(index) {
      if (index >= steps.length) {
        tape.classList.add("played");
        return;
      }
      var step = steps[index];
      var body = $("[data-type]", step) || step;
      var calls = $$(".call", step);

      /* A step can spend a moment working before it says anything, which is
         what a client connected over MCP actually does: the calls go out, they
         come back, and only then is there an answer to write. `data-think` is
         how long that takes; the element it shows ships hidden, so a page
         without this file has the answer and no spinner. */
      var think = Number(step.getAttribute("data-think")) || 0;
      var thinking = $("[data-thinking]", step);

      // Chips land while it is still working, and go green as each returns.
      calls.forEach(function (call, i) {
        setTimeout(function () {
          call.classList.add("in");
          setTimeout(function () { call.classList.add("done"); }, 420 + i * 160);
        }, 260 + i * 150);
      });

      step.classList.add("in");

      function speak() {
        if (thinking) thinking.hidden = true;
        typeInto(body, function () {
          setTimeout(function () { next(index + 1); }, Number(step.getAttribute("data-pause")) || 480);
        });
      }

      if (think && thinking) {
        thinking.hidden = false;
        setTimeout(speak, think);
      } else {
        speak();
      }
    }

    next(0);
  }

  $$("[data-tape]").forEach(function (tape) {
    if (calm) {
      $$(".call", tape).forEach(function (c) { c.classList.add("in", "done"); });
      $$("[data-step]", tape).forEach(function (s) { s.classList.add("in"); });
      $$("[data-thinking]", tape).forEach(function (t) { t.hidden = true; });
      return;
    }
    /* Hide the answer text until its turn comes, without hiding the layout it
       occupies — the panel must not change height while it plays, or every
       section below it walks down the page a line at a time while somebody is
       reading. Measure the finished line, hold that height, then empty it.

       Measured again once the webfont has landed, because Inter is wider than
       the fallback and a height reserved against the wrong face is the wrong
       height. Only for a tape that has not started: re-measuring one mid-type
       would throw away what it had written. */
    var lines = $$("[data-type]", tape);

    function reserve() {
      lines.forEach(function (el) {
        var full = el.getAttribute("data-text");
        var showing = el.textContent;
        el.style.minHeight = "";
        el.textContent = full;
        el.style.minHeight = el.getBoundingClientRect().height + "px";
        el.textContent = showing;
      });
    }

    lines.forEach(function (el) { el.setAttribute("data-text", el.textContent); });
    reserve();
    lines.forEach(function (el) { el.textContent = ""; });

    var started = false;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (!started) reserve(); });
    }

    once(tape, function (target) {
      started = true;
      playTape(target);
    }, "0px 0px -20% 0px");
  });

  // -------------------------------------------------------------------------
  // Numbers that count up
  // -------------------------------------------------------------------------

  $$("[data-count]").forEach(function (el) {
    var target = Number(el.getAttribute("data-count"));
    if (!isFinite(target)) return;
    if (calm) return;
    once(el, function () {
      var start = performance.now();
      var duration = 900;
      (function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        // Same deceleration as --ease-enter: fast, then coasting.
        var eased = 1 - Math.pow(1 - t, 4);
        el.textContent = String(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(frame);
        else el.textContent = String(target);
      })(start);
    });
  });

  // -------------------------------------------------------------------------
  // The board: one card moves a stage, once, when the board is first seen.
  //
  // It is the same transition the real board runs on a drop — the card lands
  // where you put it before the server has replied.
  // -------------------------------------------------------------------------

  $$("[data-move]").forEach(function (board) {
    if (calm) return;
    once(board, function () {
      var card = $("[data-card]", board);
      var to = $('[data-drop="' + board.getAttribute("data-move") + '"]', board);
      if (!card || !to) return;

      setTimeout(function () {
        var from = card.getBoundingClientRect();
        to.classList.add("hot");
        var empty = $(".col-empty", to);
        if (empty) empty.remove();
        to.appendChild(card);
        var landed = card.getBoundingClientRect();

        card.animate(
          [
            {
              transform:
                "translate(" + (from.left - landed.left) + "px," + (from.top - landed.top) + "px) rotate(2deg)",
              boxShadow: "var(--shadow-overlay)",
            },
            { transform: "none", boxShadow: "var(--shadow-card)" },
          ],
          { duration: 620, easing: "cubic-bezier(0.16,1,0.3,1)" }
        );

        var chip = $("[data-chip]", card);
        if (chip) {
          chip.style.setProperty("--tone", "var(--stage-interview)");
          chip.textContent = "Interviewing";
        }
        card.style.setProperty("--tone", "var(--stage-interview)");

        setTimeout(function () {
          to.classList.remove("hot");
          fit();
        }, 700);
      }, 620);
    });
  });

  // -------------------------------------------------------------------------
  // Product shots, drawn at a real app width and scaled to fit
  //
  // Reflowing a screenshot into a narrow column stops it being a screenshot of
  // anything — the type goes big relative to the chrome and the columns you
  // are meant to see disappear. So each mock is laid out at the width the app
  // is actually used at and then scaled down as one object, which is what a
  // photograph of the screen would have done.
  // -------------------------------------------------------------------------

  var fitted = $$("[data-fit]");

  // Below this, the app's own 12.5px rows stop being legible and the shot
  // stops being worth showing. Past it we hold the scale and let the frame
  // scroll sideways instead, which is what a phone can honestly do with a
  // picture of a 1440px screen.
  var FLOOR = 0.72;

  function fit() {
    fitted.forEach(function (el) {
      var design = Number(el.getAttribute("data-fit")) || 1200;
      var host = el.parentElement;
      if (!host) return;
      el.style.width = design + "px";
      var scale = Math.max(FLOOR, Math.min(1, host.clientWidth / design));
      el.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
      // offsetHeight ignores the transform, which is exactly what we need to
      // work out how tall the scaled result is.
      host.style.height = Math.round(el.offsetHeight * scale) + "px";
      host.classList.toggle("pannable", design * scale > host.clientWidth + 1);
    });
  }

  if (fitted.length) {
    fit();
    // Fonts land after first paint and change every height in here.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener("load", fit);
    var refit;
    var again = function () {
      clearTimeout(refit);
      refit = setTimeout(fit, 100);
    };
    window.addEventListener("resize", again);
    // The board gets shorter when a card moves stage, and an image dropped into
    // a slot changes everything. Watch the drawings rather than guess when.
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(again);
      fitted.forEach(function (el) { ro.observe(el); });
    }
  }

  // -------------------------------------------------------------------------
  // The tour: which chapter is on screen
  // -------------------------------------------------------------------------

  var scenes = $$("[data-scene]");
  var chapters = $$("[data-chapter]");

  if (scenes.length && chapters.length && "IntersectionObserver" in window) {
    var visible = {};
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.getAttribute("data-scene")] = entry.isIntersecting
            ? entry.intersectionRatio
            : 0;
        });
        var best = null;
        var bestRatio = 0;
        Object.keys(visible).forEach(function (key) {
          if (visible[key] > bestRatio) { bestRatio = visible[key]; best = key; }
        });
        if (!best) return;
        chapters.forEach(function (chapter) {
          chapter.classList.toggle("on", chapter.getAttribute("data-chapter") === best);
        });
      },
      { rootMargin: "-20% 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    scenes.forEach(function (scene) { spy.observe(scene); });
  }

  chapters.forEach(function (chapter) {
    chapter.addEventListener("click", function () {
      var scene = $('[data-scene="' + chapter.getAttribute("data-chapter") + '"]');
      if (scene) scene.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    });
  });

  // -------------------------------------------------------------------------
  // The tool catalogue
  // -------------------------------------------------------------------------

  var catalogue = $("[data-catalogue]");
  if (catalogue) {
    var tools = $$(".tool", catalogue);
    var input = $(".search input", catalogue);
    var count = $("[data-tools-count]", catalogue);
    var empty = $(".tools-empty", catalogue);
    var filters = $$(".filter", catalogue);
    var group = "all";

    function apply() {
      var query = (input && input.value || "").trim().toLowerCase();
      var shown = 0;
      tools.forEach(function (tool) {
        var inGroup = group === "all" || tool.getAttribute("data-group") === group;
        var match = !query || tool.getAttribute("data-find").indexOf(query) > -1;
        var show = inGroup && match;
        tool.classList.toggle("gone", !show);
        if (show) shown++;
      });
      if (count) count.textContent = String(shown);
      if (empty) empty.classList.toggle("on", shown === 0);
    }

    filters.forEach(function (filter) {
      filter.addEventListener("click", function () {
        group = filter.getAttribute("data-group");
        filters.forEach(function (f) { f.classList.toggle("on", f === filter); });
        apply();
      });
    });
    if (input) input.addEventListener("input", apply);
    apply();
  }

  // -------------------------------------------------------------------------
  // Monthly or annual
  //
  // Both figures are in the markup and the annual one ships hidden, so the page
  // without this file is the monthly price and the control is not there to
  // press. All this does is swap which of the two pairs is showing.
  // -------------------------------------------------------------------------

  $$("[data-plans]").forEach(function (group) {
    var buttons = $$("button[data-period]", group);
    var swappable = $$("[data-when]");
    if (!buttons.length || !swappable.length) return;

    group.hidden = false;

    function show(period) {
      buttons.forEach(function (button) {
        var on = button.getAttribute("data-period") === period;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
      swappable.forEach(function (el) {
        el.hidden = el.getAttribute("data-when") !== period;
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        show(button.getAttribute("data-period"));
      });
    });
  });

  // -------------------------------------------------------------------------
  // Connection recipes
  // -------------------------------------------------------------------------

  $$("[data-tabs]").forEach(function (group) {
    var tabs = $$("[data-tab]", group);
    var panes = $$("[data-pane]", group);
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var id = tab.getAttribute("data-tab");
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("on", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        panes.forEach(function (pane) {
          pane.hidden = pane.getAttribute("data-pane") !== id;
        });
      });
    });
  });

  // Copy buttons on the code blocks that people actually run.
  $$("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () {
      var source = document.getElementById(button.getAttribute("data-copy"));
      if (!source || !navigator.clipboard) return;
      navigator.clipboard.writeText(source.innerText.trim()).then(function () {
        var was = button.textContent;
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = was; }, 1600);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Screenshot and video slots
  //
  // Every slot on this page already renders something real. This looks for a
  // file named after the slot and, only if it loads, puts it on top. So the
  // page is complete with an empty media/ folder, and adding art is dropping a
  // file in — no markup to edit. site/media/README.md has the list.
  // -------------------------------------------------------------------------

  $$("[data-shot]").forEach(function (slot) {
    var name = slot.getAttribute("data-shot");
    var kind = slot.getAttribute("data-media") || "image";

    if (kind === "video") {
      var video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = !calm;
      video.controls = calm;
      video.preload = "metadata";
      video.src = "media/" + name + ".mp4";
      video.addEventListener("loadeddata", function () {
        slot.replaceChildren(video);
      });
      return;
    }

    var image = new Image();
    image.decoding = "async";
    image.loading = "lazy";
    image.alt = slot.getAttribute("data-alt") || "";
    image.addEventListener("load", function () {
      if (image.naturalWidth < 2) return;
      image.srcset = "media/" + name + ".png 1x, media/" + name + "@2x.png 2x";
      slot.replaceChildren(image);
    });
    image.src = "media/" + name + ".png";
  });

  // Add ?slots to the URL to see where art goes and what each file is called.
  if (/[?&]slots\b/.test(location.search)) document.body.classList.add("show-slots");

  // -------------------------------------------------------------------------
  // The one live number on the page, in the footer beside the GitHub link. It
  // ships hidden and only appears if the count actually arrives, so a rate
  // limit or an offline visitor sees a plain link rather than an empty chip.
  // -------------------------------------------------------------------------

  var stars = $("#stars");
  if (stars) {
    fetch("https://api.github.com/repos/shifulaboratories/Hired")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (repo) {
        if (!repo || typeof repo.stargazers_count !== "number") return;
        stars.textContent =
          repo.stargazers_count >= 1000
            ? (repo.stargazers_count / 1000).toFixed(1) + "k"
            : String(repo.stargazers_count);
        stars.hidden = false;
      })
      .catch(function () {});
  }
})();
