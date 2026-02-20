import UIKit
import WebKit

class SWTTRViewController: UIViewController, WKNavigationDelegate {

    private let defaultRemoteURL = URL(string: "https://swttr.vercel.app")!
    private let localDevURL = URL(string: "http://localhost:3000")!
    private var webView: WKWebView!
    private lazy var remoteURL: URL = resolveRemoteURL()
    private lazy var appURL: URL = resolveAppURL()
    private var didFallbackFromLocalDev = false
    private lazy var allowedHosts: [String] = {
        var hosts = Set<String>()
        if let host = appURL.host, !host.isEmpty {
            hosts.insert(host)
        }
        if let host = remoteURL.host, !host.isEmpty {
            hosts.insert(host)
        }
        return Array(hosts)
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.118, green: 0.161, blue: 0.231, alpha: 1) // #1e293b

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

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

        webView.load(URLRequest(url: appURL))
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let host = url.host else {
            decisionHandler(.allow)
            return
        }

        // Allow configured app host + subdomains
        if isAllowedHost(host) {
            decisionHandler(.allow)
            return
        }

        // Allow Clerk auth domains
        if host.hasSuffix(".clerk.accounts.dev") || host.hasSuffix(".clerk.dev") {
            decisionHandler(.allow)
            return
        }

        // Open everything else in Safari
        if navigationAction.targetFrame?.isMainFrame == true {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    private func resolveRemoteURL() -> URL {
        if let plistValue = Bundle.main.object(forInfoDictionaryKey: "SWTTRWebURL") as? String,
           let url = URL(string: plistValue),
           !plistValue.isEmpty {
            return url
        }
        return defaultRemoteURL
    }

    private func resolveAppURL() -> URL {
        #if DEBUG
        if let debugValue = Bundle.main.object(forInfoDictionaryKey: "SWTTRWebURLDebug") as? String,
           let debugURL = URL(string: debugValue),
           !debugValue.isEmpty {
            return debugURL
        }
        return localDevURL
        #else
        return remoteURL
        #endif
    }

    private func isAllowedHost(_ host: String) -> Bool {
        for allowed in allowedHosts where !allowed.isEmpty {
            if host == allowed || host.hasSuffix(".\(allowed)") {
                return true
            }
        }
        return false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleDebugLocalFallback(webView: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleDebugLocalFallback(webView: webView)
    }

    private func handleDebugLocalFallback(webView: WKWebView) {
        #if DEBUG
        guard !didFallbackFromLocalDev else { return }
        guard appURL.host == localDevURL.host else { return }
        didFallbackFromLocalDev = true
        webView.load(URLRequest(url: remoteURL))
        #endif
    }

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
