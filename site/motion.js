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
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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

      // Chips land while the sentence is still being written.
      calls.forEach(function (call, i) {
        setTimeout(function () {
          call.classList.add("in");
          setTimeout(function () { call.classList.add("done"); }, 420 + i * 160);
        }, 260 + i * 150);
      });

      step.classList.add("in");
      typeInto(body, function () {
        setTimeout(function () { next(index + 1); }, Number(step.getAttribute("data-pause")) || 480);
      });
    }

    next(0);
  }

  $$("[data-tape]").forEach(function (tape) {
    if (calm) {
      $$(".call", tape).forEach(function (c) { c.classList.add("in", "done"); });
      $$("[data-step]", tape).forEach(function (s) { s.classList.add("in"); });
      return;
    }
    // Hide the answer text until its turn comes, without hiding the layout it
    // occupies — the panel must not change height while it plays.
    $$("[data-type]", tape).forEach(function (el) {
      el.setAttribute("data-text", el.textContent);
      el.textContent = "";
    });
    once(tape, playTape, "0px 0px -20% 0px");
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
  // The one live number on the page. Fails silently to the word "GitHub".
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
      })
      .catch(function () {});
  }
})();
