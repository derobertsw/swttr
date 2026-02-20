import UIKit
import WebKit

private struct SWTTRShellConfig {
    let remoteURL: URL
    let appURL: URL
    let allowedHosts: Set<String>

    static func resolve() -> SWTTRShellConfig {
        let defaultRemoteURL = URL(string: "https://swttr.vercel.app")!
        let localDevURL = URL(string: "http://localhost:3000")!

        let remoteURL: URL
        if let plistValue = Bundle.main.object(forInfoDictionaryKey: "SWTTRWebURL") as? String,
           let parsed = URL(string: plistValue),
           !plistValue.isEmpty {
            remoteURL = parsed
        } else {
            remoteURL = defaultRemoteURL
        }

        let appURL: URL
        #if DEBUG
        if let debugValue = Bundle.main.object(forInfoDictionaryKey: "SWTTRWebURLDebug") as? String,
           let parsed = URL(string: debugValue),
           !debugValue.isEmpty {
            appURL = parsed
        } else {
            appURL = localDevURL
        }
        #else
        appURL = remoteURL
        #endif

        var hosts = Set<String>()
        if let host = appURL.host, !host.isEmpty {
            hosts.insert(host)
        }
        if let host = remoteURL.host, !host.isEmpty {
            hosts.insert(host)
        }

        return SWTTRShellConfig(remoteURL: remoteURL, appURL: appURL, allowedHosts: hosts)
    }
}

fileprivate protocol SWTTRWebTabEventDelegate: AnyObject {
    func webTab(
        _ controller: SWTTRWebTabViewController,
        didChangeActivity activityValue: String,
        iconPngDataUrl: String?,
        source: String,
        eventID: String?,
        userInitiated: Bool
    )
}

private final class SWTTRScriptMessageProxy: NSObject, WKScriptMessageHandler {
    weak var tabController: SWTTRWebTabViewController?

    init(tabController: SWTTRWebTabViewController) {
        self.tabController = tabController
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        tabController?.handleScriptMessage(message)
    }
}

final class SWTTRWebTabViewController: UIViewController, WKNavigationDelegate {
    private let shell: SWTTRShellConfig
    private let initialPath: String
    fileprivate weak var eventDelegate: SWTTRWebTabEventDelegate?

    private let activityChangeHandlerName = "swttrActivityChange"
    private var scriptMessageProxy: SWTTRScriptMessageProxy?
    private var webView: WKWebView!
    private var didFallbackFromLocalDev = false
    private var lastRequestedPath: String

    fileprivate init(shell: SWTTRShellConfig, initialPath: String) {
        self.shell = shell
        self.initialPath = initialPath
        self.lastRequestedPath = initialPath
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.118, green: 0.161, blue: 0.231, alpha: 1)

        let contentController = WKUserContentController()
        contentController.addUserScript(WKUserScript(
            source: activityBridgeScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: false
        ))

        let proxy = SWTTRScriptMessageProxy(tabController: self)
        contentController.add(proxy, name: activityChangeHandlerName)
        scriptMessageProxy = proxy

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "SWTTRNativeTabs"
        config.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        loadRelativePath(initialPath, animated: false)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: activityChangeHandlerName)
    }

    func handlePlanTabSelection(reselected: Bool) {
        if !isOnHomeRoute() {
            loadRelativePath("/?mode=planAhead")
            return
        }

        if reselected {
            dispatchCustomEvent("navigatePlanAhead", fallbackPath: "/?mode=planAhead")
        }
    }

    func triggerGearUpAction() {
        if isOnHomeRoute() {
            dispatchCustomEvent("gearUp", fallbackPath: "/?gearUp=1")
            return
        }
        loadRelativePath("/?gearUp=1")
    }

    private func dispatchCustomEvent(_ eventName: String, fallbackPath: String? = nil) {
        let script = "window.dispatchEvent(new CustomEvent('\(eventName)')); true;"
        webView.evaluateJavaScript(script) { [weak self] _, error in
            guard let self else { return }
            if error != nil, let fallbackPath {
                self.loadRelativePath(fallbackPath)
            }
        }
    }

    private func loadRelativePath(_ relativePath: String, animated: Bool = true) {
        lastRequestedPath = relativePath
        let url = resolveURL(relativePath: relativePath, baseURL: shell.appURL)
        webView.load(URLRequest(url: url))

        if animated {
            UIView.animate(withDuration: 0.16) {
                self.view.alpha = 1
            }
        }
    }

    private func resolveURL(relativePath: String, baseURL: URL) -> URL {
        if let url = URL(string: relativePath, relativeTo: baseURL)?.absoluteURL {
            return url
        }
        return baseURL
    }

    private var activityBridgeScript: String {
        """
        (function () {
          var changeCounter = 0;
          var lastUserIntentAt = 0;
          var retryTimers = [];

          function markUserIntent(event) {
            var target = event && event.target;
            if (!target || !(target instanceof Element)) {
              return;
            }
            var radio = target.closest('[role="radio"]');
            if (radio) {
              lastUserIntentAt = Date.now();
            }
          }

          function normalizeMetadata(metadata) {
            return {
              source: (metadata && metadata.source) ? String(metadata.source) : "sync",
              eventId: (metadata && metadata.eventId) ? String(metadata.eventId) : "",
              userInitiated: Boolean(metadata && metadata.userInitiated)
            };
          }

          function postActivity(value, iconPngDataUrl, metadata) {
            var meta = normalizeMetadata(metadata);
            try {
              window.webkit.messageHandlers.\(activityChangeHandlerName).postMessage({
                value: value || "",
                iconPngDataUrl: iconPngDataUrl || "",
                source: meta.source,
                eventId: meta.eventId,
                userInitiated: meta.userInitiated
              });
            } catch (_) {}
          }

          function inferValueFromSelectedRadio() {
            var selectedRadio = document.querySelector('[role="radio"][aria-checked="true"]');
            if (!selectedRadio) {
              return "";
            }

            var explicitValue =
              selectedRadio.getAttribute("data-activity-value") ||
              selectedRadio.getAttribute("data-value") ||
              "";
            if (explicitValue) {
              return String(explicitValue);
            }

            var label = (
              selectedRadio.getAttribute("aria-label") ||
              selectedRadio.textContent ||
              ""
            ).toLowerCase();
            if (!label) {
              return "";
            }
            if (label.indexOf("backcountry") !== -1) return "backcountry_skiing";
            if (label.indexOf("xc") !== -1 || label.indexOf("cross") !== -1) return "xc_skiing";
            if (label.indexOf("alpine") !== -1 || label.indexOf("downhill") !== -1) return "alpine_skiing";
            if (label.indexOf("snowshoe") !== -1 || label.indexOf("hiking") !== -1) return "hiking_snowshoeing";
            if (label.indexOf("bike") !== -1 || label.indexOf("cycl") !== -1) return "biking";
            if (label.indexOf("run") !== -1) return "running";
            return "";
          }

          function resolveActivityValue(preferred) {
            if (preferred) {
              return String(preferred);
            }
            var inferred = inferValueFromSelectedRadio();
            if (inferred) {
              return inferred;
            }
            try {
              var stored = window.localStorage ? window.localStorage.getItem("swttr-last-activity") : "";
              if (stored) {
                return String(stored);
              }
            } catch (_) {}
            return "";
          }

          function tryRenderSelectedIcon(value, metadata) {
            var selected = document.querySelector('[role="radio"][aria-checked="true"] svg');
            if (!selected) {
              return false;
            }

            var svgClone = selected.cloneNode(true);
            if (!svgClone.getAttribute("xmlns")) {
              svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            }
            svgClone.setAttribute("width", "96");
            svgClone.setAttribute("height", "96");
            svgClone.setAttribute("color", "#ffffff");
            svgClone.style.color = "#ffffff";

            var nodes = svgClone.querySelectorAll("*");
            nodes.forEach(function (node) {
              if (node.getAttribute("fill") === "currentColor") {
                node.setAttribute("fill", "#ffffff");
              }
              if (node.getAttribute("stroke") === "currentColor") {
                node.setAttribute("stroke", "#ffffff");
              }
            });

            var svgText = new XMLSerializer().serializeToString(svgClone);
            var encoded = encodeURIComponent(svgText)
              .replace(/'/g, "%27")
              .replace(/"/g, "%22");
            var img = new Image();
            img.onload = function () {
              try {
                var canvas = document.createElement("canvas");
                canvas.width = 96;
                canvas.height = 96;
                var ctx = canvas.getContext("2d");
                if (!ctx) {
                  postActivity(value, "", metadata);
                  return;
                }
                ctx.drawImage(img, 0, 0, 96, 96);
                var png = canvas.toDataURL("image/png");
                postActivity(value, png, metadata);
              } catch (_) {
                postActivity(value, "", metadata);
              }
            };
            img.onerror = function () {
              postActivity(value, "", metadata);
            };
            img.src = "data:image/svg+xml;charset=utf-8," + encoded;
            return true;
          }

          function publishActivity(value, metadata) {
            var resolvedValue = resolveActivityValue(value);
            if (!resolvedValue) {
              return;
            }

            var hasIcon = false;
            try {
              hasIcon = tryRenderSelectedIcon(resolvedValue, metadata);
            } catch (_) {
              hasIcon = false;
            }
            if (!hasIcon) {
              postActivity(resolvedValue, "", metadata);
            }
          }

          function publishActivityWithRetries(value, metadata) {
            retryTimers.forEach(function (t) { clearTimeout(t); });
            retryTimers = [];
            [0, 120, 320, 680, 1200].forEach(function (delay) {
              var t = setTimeout(function () {
                publishActivity(value, metadata);
              }, delay);
              retryTimers.push(t);
            });
          }

          function bootstrapSync() {
            [0, 280, 900, 1800].forEach(function (delay) {
              setTimeout(function () {
                publishActivity("", { source: "bootstrap", eventId: "" });
              }, delay);
            });
          }

          window.addEventListener("activityChange", function(event) {
            var next = "";
            try {
              next = (event && event.detail && event.detail.value) ? String(event.detail.value) : "";
            } catch (_) {}
            var eventId = "activity-" + String(++changeCounter) + "-" + String(Date.now());
            var userInitiated = (Date.now() - lastUserIntentAt) < 1600;
            var metadata = {
              source: "activityChange",
              eventId: eventId,
              userInitiated: userInitiated
            };
            requestAnimationFrame(function () {
              publishActivityWithRetries(next, metadata);
            });
          });

          document.addEventListener("pointerdown", markUserIntent, true);
          document.addEventListener("touchstart", markUserIntent, true);
          document.addEventListener("click", markUserIntent, true);
          document.addEventListener("keydown", function (event) {
            if (event && (event.key === "Enter" || event.key === " " || event.key === "ArrowLeft" || event.key === "ArrowRight")) {
              markUserIntent(event);
            }
          }, true);

          window.addEventListener("load", bootstrapSync);
          document.addEventListener("visibilitychange", function () {
            if (!document.hidden) {
              bootstrapSync();
            }
          });
          bootstrapSync();
        })();
        """
    }

    fileprivate func handleScriptMessage(_ message: WKScriptMessage) {
        guard message.name == activityChangeHandlerName else { return }

        if let body = message.body as? [String: Any],
           let value = body["value"] as? String,
           !value.isEmpty {
            let iconPngDataUrl = body["iconPngDataUrl"] as? String
            let source = body["source"] as? String ?? "sync"
            let eventID = body["eventId"] as? String
            let userInitiated = body["userInitiated"] as? Bool ?? false
            eventDelegate?.webTab(
                self,
                didChangeActivity: value,
                iconPngDataUrl: iconPngDataUrl,
                source: source,
                eventID: eventID,
                userInitiated: userInitiated
            )
            return
        }

        if let value = message.body as? String, !value.isEmpty {
            eventDelegate?.webTab(
                self,
                didChangeActivity: value,
                iconPngDataUrl: nil,
                source: "legacy",
                eventID: nil,
                userInitiated: false
            )
        }
    }

    private func isAllowedHost(_ host: String) -> Bool {
        for allowed in shell.allowedHosts where !allowed.isEmpty {
            if host == allowed || host.hasSuffix(".\(allowed)") {
                return true
            }
        }
        return false
    }

    private func isClerkHost(_ host: String) -> Bool {
        let lower = host.lowercased()
        return lower == "clerk.com"
            || lower.hasSuffix(".clerk.com")
            || lower == "clerk.dev"
            || lower.hasSuffix(".clerk.dev")
            || lower.hasSuffix(".clerk.accounts.dev")
    }

    private func isAuthFlowURL(_ url: URL) -> Bool {
        let path = url.path.lowercased()
        let query = (url.query ?? "").lowercased()
        let host = (url.host ?? "").lowercased()

        if isClerkHost(host) {
            return true
        }
        if path.contains("/sign-in")
            || path.contains("/sign-up")
            || path.contains("/sso-callback")
            || path.contains("/oauth")
            || path.contains("/authenticate") {
            return true
        }
        if query.contains("__clerk")
            || query.contains("clerk")
            || query.contains("sso")
            || query.contains("oauth")
            || query.contains("redirect_url") {
            return true
        }
        return false
    }

    private func isOnHomeRoute() -> Bool {
        guard let url = webView.url, let host = url.host else { return false }
        if !isAllowedHost(host) { return false }
        return url.path == "/"
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let host = url.host else {
            decisionHandler(.allow)
            return
        }

        let currentURLIsAuthFlow = webView.url.map(isAuthFlowURL) ?? false
        let targetURLIsAuthFlow = isAuthFlowURL(url)
        let hostIsClerk = isClerkHost(host)

        if isAllowedHost(host) || hostIsClerk || currentURLIsAuthFlow || targetURLIsAuthFlow {
            decisionHandler(.allow)
            return
        }

        if navigationAction.targetFrame?.isMainFrame == true {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleDebugLocalFallback()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleDebugLocalFallback()
    }

    private func handleDebugLocalFallback() {
        #if DEBUG
        guard !didFallbackFromLocalDev else { return }
        guard shell.appURL.host == "localhost" || shell.appURL.host == "127.0.0.1" else { return }
        didFallbackFromLocalDev = true
        let fallbackURL = resolveURL(relativePath: lastRequestedPath, baseURL: shell.remoteURL)
        webView.load(URLRequest(url: fallbackURL))
        #endif
    }
}

class SWTTRViewController: UITabBarController, UITabBarControllerDelegate, SWTTRWebTabEventDelegate {
    private let shell = SWTTRShellConfig.resolve()
    private lazy var planController = SWTTRWebTabViewController(shell: shell, initialPath: "/?mode=planAhead")
    private lazy var wardrobeController = SWTTRWebTabViewController(shell: shell, initialPath: "/wardrobe")
    private lazy var gearActionController = UIViewController()
    private lazy var gearFabButton: UIButton = makeGearFabButton()
    private lazy var gearFabLabel: UILabel = makeGearFabLabel()

    private var previousSelectedIndex = 0
    private var currentActivityValue = "alpine_skiing"
    private var activityIconCache: [String: UIImage] = [:]
    private var pendingNonUserActivityValue: String?
    private var pendingNonUserApply: DispatchWorkItem?
    private var lastPulsedActivityValue: String?
    private var lastPulsedEventID: String?
    private var lastPulseTimestamp: CFTimeInterval = 0
    private let selectionFeedback = UISelectionFeedbackGenerator()
    private let impactFeedback = UIImpactFeedbackGenerator(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        delegate = self
        configureTabBarAppearance()
        configureTabs()
        configureGearFab()
        selectedIndex = 0
        previousSelectedIndex = selectedIndex
        selectionFeedback.prepare()
        impactFeedback.prepare()
    }

    private func configureTabs() {
        planController.eventDelegate = self

        planController.tabBarItem = UITabBarItem(
            title: "Plan",
            image: symbol("calendar", fallback: "square.grid.2x2"),
            selectedImage: symbol("calendar.circle.fill", fallback: "square.grid.2x2.fill")
        )

        gearActionController.view.backgroundColor = .clear
        gearActionController.tabBarItem = UITabBarItem(title: nil, image: nil, selectedImage: nil)
        gearActionController.tabBarItem.isEnabled = false

        wardrobeController.tabBarItem = UITabBarItem(
            title: "Wardrobe",
            image: symbol("tshirt", fallback: "archivebox"),
            selectedImage: symbol("tshirt.fill", fallback: "archivebox.fill")
        )

        viewControllers = [planController, gearActionController, wardrobeController]
    }

    private func configureGearFab() {
        view.addSubview(gearFabButton)
        view.addSubview(gearFabLabel)

        NSLayoutConstraint.activate([
            gearFabButton.widthAnchor.constraint(equalToConstant: 64),
            gearFabButton.heightAnchor.constraint(equalToConstant: 64),
            gearFabButton.centerXAnchor.constraint(equalTo: tabBar.centerXAnchor),
            gearFabButton.centerYAnchor.constraint(equalTo: tabBar.topAnchor, constant: 1),

            gearFabLabel.centerXAnchor.constraint(equalTo: gearFabButton.centerXAnchor),
            gearFabLabel.topAnchor.constraint(equalTo: gearFabButton.bottomAnchor, constant: 4),
        ])
    }

    private func makeGearFabButton() -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setPreferredSymbolConfiguration(UIImage.SymbolConfiguration(pointSize: 24, weight: .semibold), forImageIn: .normal)
        button.contentEdgeInsets = UIEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
        button.imageView?.contentMode = .scaleAspectFit
        button.tintColor = .white
        button.backgroundColor = UIColor(white: 0.03, alpha: 0.94)
        button.layer.cornerRadius = 32
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.36
        button.layer.shadowRadius = 14
        button.layer.shadowOffset = CGSize(width: 0, height: 9)
        button.accessibilityLabel = "Gear Up"
        button.addTarget(self, action: #selector(handleGearFabTap), for: .touchUpInside)
        return button
    }

    private func makeGearFabLabel() -> UILabel {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Gear Up"
        label.textAlignment = .center
        label.textColor = UIColor(white: 0.97, alpha: 0.94)
        label.font = .systemFont(ofSize: 11, weight: .semibold)
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.9
        label.isUserInteractionEnabled = false
        return label
    }

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        appearance.backgroundColor = UIColor(red: 0.067, green: 0.176, blue: 0.243, alpha: 0.74)
        appearance.shadowColor = UIColor(white: 1.0, alpha: 0.18)

        let normal = appearance.stackedLayoutAppearance.normal
        normal.iconColor = UIColor(white: 0.92, alpha: 0.65)
        normal.titleTextAttributes = [.foregroundColor: UIColor(white: 0.92, alpha: 0.65)]

        let selected = appearance.stackedLayoutAppearance.selected
        selected.iconColor = UIColor(white: 0.98, alpha: 1.0)
        selected.titleTextAttributes = [.foregroundColor: UIColor(white: 0.98, alpha: 1.0)]

        tabBar.standardAppearance = appearance
        if #available(iOS 15.0, *) {
            tabBar.scrollEdgeAppearance = appearance
        }

        tabBar.tintColor = UIColor(white: 0.98, alpha: 1.0)
        tabBar.unselectedItemTintColor = UIColor(white: 0.92, alpha: 0.65)
    }

    private func symbol(_ primary: String, fallback: String) -> UIImage? {
        UIImage(systemName: primary) ?? UIImage(systemName: fallback)
    }

    private func activitySymbol(for activityValue: String) -> UIImage? {
        switch activityValue {
        case "running":
            return symbol("figure.run", fallback: "bolt.fill")
        case "biking":
            return symbol("bicycle", fallback: "bolt.fill")
        case "hiking_snowshoeing":
            return symbol("figure.walk", fallback: "bolt.fill")
        case "backcountry_skiing":
            return symbol("mountain.2", fallback: "bolt.fill")
        case "xc_skiing":
            return symbol("figure.skiing.crosscountry", fallback: "figure.skiing.downhill")
        case "alpine_skiing":
            return symbol("figure.skiing.downhill", fallback: "bolt.fill")
        default:
            return symbol("bolt.fill", fallback: "bolt")
        }
    }

    private func decodeActivityPng(from dataURL: String?) -> UIImage? {
        guard let dataURL, !dataURL.isEmpty else { return nil }
        guard let commaIndex = dataURL.firstIndex(of: ",") else { return nil }
        let base64 = String(dataURL[dataURL.index(after: commaIndex)...])
        guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else { return nil }
        guard let image = UIImage(data: data) else { return nil }
        return image.withRenderingMode(.alwaysOriginal)
    }

    private func imageForActivity(_ activityValue: String) -> UIImage? {
        return activityIconCache[activityValue]
    }

    @discardableResult
    private func applyActivityVisualState(_ activityValue: String, animated: Bool) -> Bool {
        let didChange = currentActivityValue != activityValue
        currentActivityValue = activityValue

        let nextIcon = imageForActivity(activityValue)
        if animated {
            UIView.transition(with: gearFabButton, duration: 0.14, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                self.gearFabButton.setImage(nextIcon, for: .normal)
            }
        } else {
            UIView.performWithoutAnimation {
                self.gearFabButton.setImage(nextIcon, for: .normal)
                self.gearFabButton.layoutIfNeeded()
            }
        }

        return didChange
    }

    private func queueNonUserActivityVisualState(_ activityValue: String) {
        pendingNonUserActivityValue = activityValue
        pendingNonUserApply?.cancel()

        let work = DispatchWorkItem { [weak self] in
            guard let self, let value = self.pendingNonUserActivityValue else { return }
            self.pendingNonUserActivityValue = nil
            self.applyActivityVisualState(value, animated: false)
        }

        pendingNonUserApply = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: work)
    }

    private func shouldPulseForActivityChange(activityValue: String, source: String, eventID: String?, userInitiated: Bool) -> Bool {
        guard source == "activityChange" else { return false }
        guard userInitiated else { return false }

        let normalizedEventID: String? = {
            guard let eventID, !eventID.isEmpty else { return nil }
            return eventID
        }()

        let now = CACurrentMediaTime()
        if let normalizedEventID, normalizedEventID == lastPulsedEventID {
            return false
        }

        // Prevent double pulses when duplicated change messages arrive in a short burst.
        if activityValue == lastPulsedActivityValue, now - lastPulseTimestamp < 1.1 {
            return false
        }

        lastPulsedActivityValue = activityValue
        lastPulsedEventID = normalizedEventID
        lastPulseTimestamp = now
        return true
    }

    @objc private func handleGearFabTap() {
        performGearUpAction()
    }

    private func performGearUpAction() {
        impactFeedback.impactOccurred()
        impactFeedback.prepare()

        if selectedIndex != 0 {
            selectedIndex = 0
        }
        planController.triggerGearUpAction()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.bringSubviewToFront(gearFabButton)
        view.bringSubviewToFront(gearFabLabel)
    }

    // MARK: - SWTTRWebTabEventDelegate

    func webTab(
        _ controller: SWTTRWebTabViewController,
        didChangeActivity activityValue: String,
        iconPngDataUrl: String?,
        source: String,
        eventID: String?,
        userInitiated: Bool
    ) {
        guard controller === planController else { return }
        guard !activityValue.isEmpty else { return }

        if let iconImage = decodeActivityPng(from: iconPngDataUrl) {
            activityIconCache[activityValue] = iconImage
        }

        let didChange: Bool
        if source == "activityChange", userInitiated {
            pendingNonUserApply?.cancel()
            pendingNonUserApply = nil
            pendingNonUserActivityValue = nil
            didChange = applyActivityVisualState(activityValue, animated: true)
        } else {
            didChange = currentActivityValue != activityValue
            queueNonUserActivityVisualState(activityValue)
        }

        if didChange && shouldPulseForActivityChange(
            activityValue: activityValue,
            source: source,
            eventID: eventID,
            userInitiated: userInitiated
        ) {
            selectionFeedback.selectionChanged()
            selectionFeedback.prepare()
            animateFabPulse()
        }
    }

    private func animateFabPulse() {
        gearFabButton.layer.removeAllAnimations()
        UIView.animate(withDuration: 0.12, delay: 0, options: [.allowUserInteraction], animations: {
            self.gearFabButton.transform = CGAffineTransform(scaleX: 1.12, y: 1.12)
        }) { _ in
            UIView.animate(
                withDuration: 0.22,
                delay: 0,
                usingSpringWithDamping: 0.62,
                initialSpringVelocity: 0.45,
                options: [.allowUserInteraction],
                animations: {
                    self.gearFabButton.transform = .identity
                }
            )
        }
    }

    // MARK: - UITabBarControllerDelegate

    func tabBarController(_ tabBarController: UITabBarController, shouldSelect viewController: UIViewController) -> Bool {
        if viewController === gearActionController {
            performGearUpAction()
            return false
        }
        return true
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        let reselected = previousSelectedIndex == selectedIndex

        if viewController === planController {
            planController.handlePlanTabSelection(reselected: reselected)
        }

        selectionFeedback.selectionChanged()
        selectionFeedback.prepare()
        previousSelectedIndex = selectedIndex
    }

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
