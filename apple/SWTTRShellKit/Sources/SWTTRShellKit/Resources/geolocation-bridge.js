// SWTTR native shells (#147): replaces navigator.geolocation so "use my
// location" shows only the system prompt, not a second WebKit prompt that names
// the site. The shell injects this at document start in the main frame, and
// answers through the swttrGeolocation handler for SWTTR's own pages only.
//
// Installed apps and the live site update independently, so never rename the
// handler or change the message shapes (docs/native-shell-contract.md):
//   request: { enableHighAccuracy: boolean, timeout: ms | null, maximumAge: ms | null }
//            (null means no limit)
//   reply:   { coords: { latitude, longitude, accuracy, altitude, altitudeAccuracy,
//                        heading, speed }, timestamp }
//         or { error: { code: 1 | 2 | 3, message } }
(function () {
  "use strict";

  var handlers = window.webkit && window.webkit.messageHandlers;
  var handler = handlers && handlers.swttrGeolocation;
  if (!handler || typeof handler.postMessage !== "function") return;

  var PERMISSION_DENIED = 1;
  var POSITION_UNAVAILABLE = 2;
  var TIMEOUT = 3;
  var MESSAGES = {
    1: "User denied Geolocation",
    2: "Position unavailable",
    3: "Timeout expired",
  };

  // Shaped like GeolocationPositionError, constants included.
  function positionError(code, message) {
    if (code !== PERMISSION_DENIED && code !== TIMEOUT) code = POSITION_UNAVAILABLE;
    return Object.freeze({
      code: code,
      message: typeof message === "string" && message ? message : MESSAGES[code],
      PERMISSION_DENIED: PERMISSION_DENIED,
      POSITION_UNAVAILABLE: POSITION_UNAVAILABLE,
      TIMEOUT: TIMEOUT,
    });
  }

  function numberOrNull(value) {
    return typeof value === "number" && isFinite(value) ? value : null;
  }

  // Shaped like GeolocationPosition, including toJSON().
  function position(reply) {
    var c = reply.coords;
    var coords = {
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy: c.accuracy,
      altitude: numberOrNull(c.altitude),
      altitudeAccuracy: numberOrNull(c.altitudeAccuracy),
      heading: numberOrNull(c.heading),
      speed: numberOrNull(c.speed),
    };
    var plainCoords = Object.assign({}, coords);
    coords.toJSON = function () { return Object.assign({}, plainCoords); };
    var timestamp = numberOrNull(reply.timestamp);
    if (timestamp === null) timestamp = Date.now();
    return Object.freeze({
      coords: Object.freeze(coords),
      timestamp: timestamp,
      toJSON: function () { return { coords: Object.assign({}, plainCoords), timestamp: timestamp }; },
    });
  }

  // PositionOptions in milliseconds. Infinity, the timeout's default, means no
  // limit (null); NaN and negative values clamp to 0, as WebIDL does.
  function milliseconds(value, fallback) {
    if (value === undefined) return fallback;
    var number = Number(value);
    if (number === Infinity) return null;
    if (!(number > 0)) return 0;
    return Math.min(number, 4294967295);
  }

  // Callbacks run outside the reply's promise chain, so an exception in one is
  // reported like any other and can't turn into a second callback.
  function deliver(callback, value) {
    if (typeof callback !== "function") return;
    try {
      callback(value);
    } catch (error) {
      setTimeout(function () { throw error; }, 0);
    }
  }

  function locate(options, onPosition, onError) {
    var o = options || {};
    var reply;
    try {
      reply = handler.postMessage({
        enableHighAccuracy: Boolean(o.enableHighAccuracy),
        timeout: milliseconds(o.timeout, null),
        maximumAge: milliseconds(o.maximumAge, 0),
      });
    } catch (error) {
      reply = Promise.reject(error);
    }
    Promise.resolve(reply).then(
      function (value) {
        if (value && value.coords) {
          onPosition(position(value));
        } else {
          var error = (value && value.error) || {};
          onError(positionError(error.code, error.message));
        }
      },
      function () { onError(positionError(POSITION_UNAVAILABLE)); }
    );
  }

  function requireCallback(callback, method) {
    if (typeof callback !== "function") {
      throw new TypeError("Failed to execute '" + method + "' on 'Geolocation': parameter 1 is not a function.");
    }
  }

  function getCurrentPosition(success, error, options) {
    requireCallback(success, "getCurrentPosition");
    locate(
      options,
      function (value) { deliver(success, value); },
      function (value) { deliver(error, value); }
    );
  }

  // Reports one position, like getCurrentPosition. Clearing the watch before
  // it arrives drops it.
  var nextWatchId = 0;
  var watches = {};
  function watchPosition(success, error, options) {
    requireCallback(success, "watchPosition");
    var id = ++nextWatchId;
    watches[id] = true;
    function settle(callback) {
      return function (value) {
        if (!watches[id]) return;
        delete watches[id];
        deliver(callback, value);
      };
    }
    locate(options, settle(success), settle(error));
    return id;
  }

  function clearWatch(id) {
    delete watches[id];
  }

  var geolocation = Object.freeze({
    getCurrentPosition: getCurrentPosition,
    watchPosition: watchPosition,
    clearWatch: clearWatch,
  });

  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      enumerable: true,
      get: function () { return geolocation; },
    });
  } catch (_) {
    // Leave WebKit's own geolocation in place.
  }
})();
