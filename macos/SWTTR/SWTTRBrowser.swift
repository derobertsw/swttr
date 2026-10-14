import AppKit
import Combine
import WebKit
import SWTTRShellKit

@MainActor
final class SWTTRBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published private(set) var destination: SWTTRDestination?
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isLoading = true
    @Published private(set) var hasLoadedPage = false
    @Published private(set) var failure: String?
    @Published private(set) var canOpenPreferences = false

    let webView: WKWebView
    private let config: SWTTRShellConfig
    private let policy: SWTTRNavigationPolicy
    private var baseURL: URL
    private var retryURL: URL
    private var observations: [NSKeyValueObservation] = []
    private var didFallbackFromLocalDev = false
    private var processRecovery = SWTTRProcessRecovery()
    private let lastPageKey = "swttr-mac-last-page"

    override init() {
        #if DEBUG
        let isDebug = true
        #else
        let isDebug = false
        #endif
        let shell = SWTTRShellConfig.resolve(info: Bundle.main.infoDictionary ?? [:], isDebug: isDebug)
        config = shell
        policy = SWTTRNavigationPolicy(allowedHosts: shell.allowedHosts)
        baseURL = shell.appURL
        retryURL = shell.appURL

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // WebKit appends this to its real UA, including the very first request.
        configuration.applicationNameForUserAgent = "SWTTRNativeMac/1"
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.underPageBackgroundColor = SWTTRAppearance.canvas
        #if DEBUG
        webView.isInspectable = true
        #endif

        observations = [
            webView.observe(\.url, options: [.new]) { [weak self] _, _ in self?.scheduleSync() },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in self?.scheduleSync() },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] _, _ in self?.scheduleSync() },
            webView.observe(\.isLoading, options: [.new]) { [weak self] _, _ in self?.scheduleSync() }
        ]
        let restored = SWTTRLastPage.restorableURL(UserDefaults.standard.string(forKey: lastPageKey), baseURL: baseURL)
        if restored == nil { UserDefaults.standard.removeObject(forKey: lastPageKey) }
        load(restored ?? baseURL)
    }

    // KVO can arrive while a delegate call is updating WebKit's properties.
    private nonisolated func scheduleSync() {
        Task { @MainActor [weak self] in self?.syncState() }
    }

    private func syncState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        isLoading = webView.isLoading
        let url = webView.url
        let isOnSite = url.map { SWTTRLastPage.sameOrigin($0, baseURL) } ?? false
        let path = url?.path.lowercased() ?? ""
        let isAuthPage = ["/sign-in", "/sign-up", "/sso-callback", "/oauth", "/authenticate"].contains {
            path == $0 || path.hasPrefix($0 + "/")
        }
        destination = isOnSite ? url.flatMap { SWTTRDestination.matching(path: $0.path) } : nil
        // Invite pages render Header even though their bearer URL is never saved.
        canOpenPreferences = isOnSite && hasLoadedPage && !isLoading && failure == nil && !isAuthPage
        // Includes History API route changes, not just document loads.
        if !isLoading, hasLoadedPage, failure == nil, let url,
           SWTTRLastPage.restorableURL(url.absoluteString, baseURL: baseURL) != nil {
            UserDefaults.standard.set(url.absoluteString, forKey: lastPageKey)
        }
    }

    private func load(_ url: URL) {
        retryURL = url
        failure = nil
        isLoading = true
        canOpenPreferences = false
        webView.load(URLRequest(url: url))
    }

    func navigate(to path: String) {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              SWTTRLastPage.sameOrigin(url, baseURL) else { return }
        load(url)
    }

    func goBack() { failure = nil; webView.goBack() }
    func goForward() { failure = nil; webView.goForward() }
    func reload() {
        if failure != nil { retry() }
        else { load(webView.url ?? retryURL) }
    }
    func retry() { processRecovery.reset(); load(retryURL) }
    func setZoom(_ zoom: Double) { webView.pageZoom = min(2, max(0.5, (zoom * 10).rounded() / 10)) }

    func openFeedback() {
        guard let url = URL(string: "/feedback", relativeTo: baseURL)?.absoluteURL else { return }
        NSWorkspace.shared.open(url)
    }

    func openPreferences() {
        guard canOpenPreferences else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('openPreferences'))", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let isNewWindow = action.targetFrame == nil
        switch policy.decide(targetURL: url, isMainFrame: action.targetFrame?.isMainFrame ?? true,
                             opensNewWindow: isNewWindow, userInitiated: action.navigationType == .linkActivated,
                             sourceIsMainFrame: action.sourceFrame.isMainFrame) {
        case .allow:
            // WKUIDelegate creates no extra web view: trusted new windows load here.
            if isNewWindow { decisionHandler(.cancel); load(url) }
            else {
                if action.targetFrame?.isMainFrame == true { retryURL = url }
                decisionHandler(.allow)
            }
        case .openExternal:
            decisionHandler(.cancel)
            NSWorkspace.shared.open(url)
        case .cancel:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Also handle WebKit versions that deliver new windows straight here.
        guard let url = action.request.url else { return nil }
        switch policy.decide(targetURL: url, isMainFrame: true, opensNewWindow: true,
                             userInitiated: action.navigationType == .linkActivated,
                             sourceIsMainFrame: action.sourceFrame.isMainFrame) {
        case .allow: load(url)
        case .openExternal: NSWorkspace.shared.open(url)
        case .cancel: break
        }
        return nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        failure = nil
        canOpenPreferences = false
        syncState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoadedPage = true
        failure = nil
        syncState()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    private func handleFailure(_ error: Error) {
        let error = error as NSError
        let kind = SWTTRLoadFailure.classify(error)
        if kind == .cancelled { return }
        #if DEBUG
        let loopback = SWTTRShellConfig.isLoopback(host: baseURL.host)
        if loopback, !didFallbackFromLocalDev, kind == .network {
            didFallbackFromLocalDev = true
            let previous = SWTTRLastPage.restorableURL(retryURL.absoluteString, baseURL: baseURL)
            baseURL = config.remoteURL
            var target = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
            if let previous, let components = URLComponents(url: previous, resolvingAgainstBaseURL: false) {
                target.percentEncodedPath = components.percentEncodedPath
                target.percentEncodedQuery = components.percentEncodedQuery
                target.percentEncodedFragment = components.percentEncodedFragment
            }
            load(target.url ?? baseURL)
            return
        }
        #endif
        failure = "Check your internet connection and try again."
        isLoading = false
        canOpenPreferences = false
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if processRecovery.shouldReload(now: ProcessInfo.processInfo.systemUptime) { reload() }
        else {
            failure = "This page stopped responding. Try again or choose another page."
            isLoading = false
            canOpenPreferences = false
        }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard frame.isMainFrame, policy.isAllowedHost(frame.securityOrigin.host) || policy.isClerkHost(frame.securityOrigin.host),
              let window = webView.window else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    private func show(_ alert: NSAlert, frame: WKFrameInfo, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        guard policy.isAllowedHost(frame.securityOrigin.host), let window = webView.window else {
            completion(.cancel)
            return
        }
        alert.beginSheetModal(for: window, completionHandler: completion)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "SWTTR"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        show(alert, frame: frame) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "SWTTR"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        show(alert, frame: frame) { response in completionHandler(response == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "SWTTR"
        alert.informativeText = prompt
        let field = NSTextField(string: defaultText ?? "")
        field.frame = NSRect(x: 0, y: 0, width: 420, height: 24)
        field.setAccessibilityLabel(prompt)
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        show(alert, frame: frame) { response in
            completionHandler(response == .alertFirstButtonReturn ? field.stringValue : nil)
        }
    }
}
