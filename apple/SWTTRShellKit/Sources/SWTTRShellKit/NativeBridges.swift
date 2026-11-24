import Foundation
@preconcurrency import WebKit

/// Installs the bridge scripts and answers their messages (#147): location on
/// every platform, sharing where the shell supplies a share sheet. Messages from
/// embedded frames, or from pages outside SWTTR's own hosts, get the rejection
/// reply without touching location or the share sheet.
@MainActor
public final class SWTTRNativeBridges: NSObject {
    /// Shows the platform's share sheet and reports how it ended.
    public typealias ShareHandler = @MainActor (
        _ request: SWTTRShareRequest, _ done: @escaping @MainActor (SWTTRShareOutcome) -> Void
    ) -> Void

    private let policy: SWTTRNavigationPolicy
    private let share: ShareHandler?
    private lazy var location = SWTTRLocationBridge()

    /// Without `share`, `navigator.share` is left to WebKit.
    public init(policy: SWTTRNavigationPolicy, share: ShareHandler?) {
        self.policy = policy
        self.share = share
    }

    public var handlers: [SWTTRBridgeHandler] {
        share == nil ? [.geolocation] : [.geolocation, .share]
    }

    /// Adds each script at document start in the main frame and the page's
    /// content world, with its reply handler. A script missing from the bundle
    /// is skipped with its handler, so the web keeps its own fallback.
    public func install(in controller: WKUserContentController) {
        for handler in handlers {
            guard let source = SWTTRBridgeScripts.source(for: handler) else { continue }
            controller.addScriptMessageHandler(self, contentWorld: .page, name: handler.rawValue)
            controller.addUserScript(WKUserScript(
                source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page
            ))
        }
    }

    fileprivate func receive(_ message: WKScriptMessage, reply: @escaping @MainActor ([String: Any]) -> Void) {
        guard let handler = SWTTRBridgeHandler(rawValue: message.name) else { return }
        let frame = message.frameInfo
        let origin = frame.securityOrigin
        guard policy.acceptsBridgeMessage(isMainFrame: frame.isMainFrame, scheme: origin.protocol, host: origin.host) else {
            reply(handler.rejectionReply)
            return
        }
        switch handler {
        case .geolocation:
            location.locate(SWTTRGeolocationRequest(body: message.body)) { result in
                reply(SWTTRGeolocationReply.reply(for: result))
            }
        case .share:
            guard let share, let request = SWTTRShareRequest(body: message.body) else {
                reply(SWTTRShareOutcome.failed.reply)
                return
            }
            share(request) { outcome in reply(outcome.reply) }
        }
    }
}

extension SWTTRNativeBridges: WKScriptMessageHandlerWithReply {
    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        receive(message) { replyHandler($0, nil) }
    }
}
