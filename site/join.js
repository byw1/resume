/**
 * The request-access form, wherever it appears.
 *
 * This is its own file because the form is on two pages now — the landing page
 * and /coming-soon/ — and the second one loads nothing else. Duplicating twenty
 * lines of fetch into a generated template is exactly the kind of copy this
 * repo keeps getting burned by.
 *
 * The form works without this file: it is a real <form> with an action and a
 * method, so with scripting off the browser posts it and shows whatever JSON
 * comes back. Ugly, but it goes through, which is the part that matters. All
 * this adds is staying on the page.
 *
 * The endpoint is the app instance, not this static site. Self-hosters point it
 * at their own; there is nothing else to change.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://app.hired.tools/api/waitlist";

  // Inlined rather than <use href="#i-check">, because the sprite lives in the
  // landing page and this file has to work on a page that has no sprite.
  var CHECK =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';

  var forms = document.querySelectorAll("[data-join]");

  Array.prototype.forEach.call(forms, function (form) {
    form.setAttribute("action", ENDPOINT);
    form.setAttribute("method", "post");

    var said = form.querySelector(".joinform-said");
    var button = form.querySelector("button[type=submit]");
    var input = form.querySelector("input[type=email]");
    var busy = false;

    /* What to say once it has gone through. The one-line form on the landing
       page and the full signup on /coming-soon/ are answering different
       questions, so the sentence is the page's to write, not this file's. */
    var thanks =
      form.getAttribute("data-said") ||
      "You're on the list. I'll email you an invite from this address — it comes from a person, not a drip campaign.";

    function say(message, bad) {
      if (!said) return;
      said.textContent = message;
      said.classList.toggle("bad", !!bad);
    }

    /** One optional field's value, trimmed, or "" if the form hasn't got it. */
    function field(name) {
      var el = form.elements.namedItem(name);
      return el && typeof el.value === "string" ? el.value.trim() : "";
    }

    function done(message) {
      form.classList.add("done");
      if (!said) return;
      said.innerHTML = CHECK + "<span></span>";
      said.querySelector("span").textContent = message;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;

      var email = input ? input.value.trim() : "";
      if (!email || email.indexOf("@") < 1 || email.indexOf(".") < 0) {
        say("That doesn't look like an email address.", true);
        if (input) input.focus();
        return;
      }

      busy = true;
      if (button) button.disabled = true;
      say("Sending…");

      /* Name and "what you're chasing" are optional everywhere and absent from
         the short form entirely. The endpoint takes both, trims both, and an
         address on its own has always been a complete signup.

         `form.elements.namedItem` rather than `form.name`: a <form> has its own
         `name` property — the name attribute, a string — which shadows the
         field of the same name. `form.website` below is only safe because no
         such property exists. */
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          name: field("name"),
          context: field("context"),
          website: form.website ? form.website.value : "",
        }),
      })
        .then(function (response) {
          return response.json().catch(function () { return { ok: response.ok }; });
        })
        .then(function (body) {
          if (body && body.ok) {
            done(thanks.replace("{email}", email));
          } else {
            say((body && body.error) || "That didn't go through. Try again in a moment.", true);
            busy = false;
            if (button) button.disabled = false;
          }
        })
        .catch(function () {
          say("Couldn't reach the server. Try again in a moment.", true);
          busy = false;
          if (button) button.disabled = false;
        });
    });
  });
})();
