// SWTTR native shells (#147): adds navigator.share and navigator.canShare when
// the web view doesn't have them, so Share and "Send invite" open the system
// share sheet. The shell injects this at document start in the main frame, and
// answers through the swttrShare handler for SWTTR's own pages only.
//
// Installed apps and the live site update independently, so never rename the
// handler or change the message shapes (docs/native-shell-contract.md):
//   request: { title?: string, text?: string, url?: absolute http(s) URL }
//   reply:   { outcome: "shared" | "cancelled" | "failed" | "notAllowed" | "busy" }
(function () {
  "use strict";

  var handlers = window.webkit && window.webkit.messageHandlers;
  var handler = handlers && handlers.swttrShare;
  if (!handler || typeof handler.postMessage !== "function") return;

  var hasShare = typeof navigator.share === "function";
  var hasCanShare = typeof navigator.canShare === "function";
  if (hasShare && hasCanShare) return;

  // The Web Share API's checks: title, text and url become strings, url is
  // resolved against the page and must be http(s), and at least one is given.
  // Files aren't supported.
  function shareData(data) {
    if (data === undefined || data === null) data = {};
    if (typeof data !== "object") throw new TypeError("Share data must be an object.");
    if (data.files !== undefined && data.files !== null && data.files.length > 0) {
      throw new TypeError("Sharing files isn't supported.");
    }
    var message = {};
    var hasMember = false;
    ["title", "text", "url"].forEach(function (key) {
      if (data[key] !== undefined) {
        message[key] = String(data[key]);
        hasMember = true;
      }
    });
    if (!hasMember) throw new TypeError("No known share data fields supplied.");
    if (message.url !== undefined) {
      var url = new URL(message.url, document.baseURI);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new TypeError("Only http and https URLs can be shared.");
      }
      message.url = url.href;
    }
    return message;
  }

  var ERRORS = {
    cancelled: ["Share canceled.", "AbortError"],
    busy: ["A share is already in progress.", "InvalidStateError"],
    notAllowed: ["Sharing isn't allowed on this page.", "NotAllowedError"],
    failed: ["Sharing failed.", "DataError"],
  };

  function rejection(outcome) {
    var error = ERRORS[outcome] || ERRORS.failed;
    return new DOMException(error[0], error[1]);
  }

  var sharing = false;
  function share(data) {
    var message;
    try {
      message = shareData(data);
    } catch (error) {
      return Promise.reject(error instanceof TypeError ? error : new TypeError(String(error)));
    }
    if (sharing) return Promise.reject(rejection("busy"));
    sharing = true;

    var reply;
    try {
      reply = handler.postMessage(message);
    } catch (error) {
      reply = Promise.reject(error);
    }
    return Promise.resolve(reply).then(
      function (value) {
        sharing = false;
        var outcome = value && value.outcome;
        if (outcome === "shared") return undefined;
        throw rejection(outcome);
      },
      function () {
        sharing = false;
        throw rejection("failed");
      }
    );
  }

  function canShare(data) {
    try {
      shareData(data);
      return true;
    } catch (_) {
      return false;
    }
  }

  try {
    if (!hasShare) {
      Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
    }
    if (!hasCanShare) {
      Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: canShare });
    }
  } catch (_) {
    // Pages keep their copy-link fallback.
  }
})();
