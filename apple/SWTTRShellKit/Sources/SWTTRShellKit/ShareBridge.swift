#if os(iOS)
import UIKit

/// Answers `navigator.share` with the iOS share sheet (#147): the URL, or the
/// text when there's no URL. Messages, Mail and Copy come from the system.
@MainActor
public final class SWTTRShareBridge {
    private let anchor: @MainActor () -> UIView?
    private let present: @MainActor (UIViewController) -> Bool
    private var isSharing = false

    /// - Parameters:
    ///   - anchor: the view the sheet's popover points at when the app runs
    ///     on an iPad in compatibility mode.
    ///   - present: presents the sheet over whatever is on screen, returning
    ///     false when it can't.
    public init(anchor: @escaping @MainActor () -> UIView?, present: @escaping @MainActor (UIViewController) -> Bool) {
        self.anchor = anchor
        self.present = present
    }

    public func share(_ request: SWTTRShareRequest, completion: @escaping @MainActor (SWTTRShareOutcome) -> Void) {
        guard !isSharing else { completion(.busy); return }
        guard let anchor = anchor() else { completion(.failed); return }

        let item: Any
        switch request.item {
        case .url(let url): item = url
        case .text(let text): item = text
        }
        let sheet = UIActivityViewController(activityItems: [item], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = anchor
            popover.sourceRect = CGRect(x: anchor.bounds.midX, y: anchor.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
            // Closing the sheet without choosing anything is a cancel, not a failure.
            let outcome: SWTTRShareOutcome = completed ? .shared : error == nil ? .cancelled : .failed
            Task { @MainActor in
                self?.isSharing = false
                completion(outcome)
            }
        }

        isSharing = true
        guard present(sheet) else {
            isSharing = false
            completion(.failed)
            return
        }
    }
}
#endif
