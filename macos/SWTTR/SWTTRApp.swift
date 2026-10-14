import SwiftUI
import WebKit
import SWTTRShellKit

@main
struct SWTTRApp: App {
    @StateObject private var browser = SWTTRBrowser()

    var body: some Scene {
        Window("SWTTR", id: "main") {
            SWTTRContentView(browser: browser)
                .frame(minWidth: 720, minHeight: 540)
        }
        .defaultSize(width: 1280, height: 820)
        .windowResizability(.contentMinSize)
        .commands { SWTTRCommands(browser: browser) }
    }
}

struct SWTTRContentView: View {
    @ObservedObject var browser: SWTTRBrowser

    var body: some View {
        NavigationSplitView {
            List {
                ForEach(SWTTRDestination.allCases) { destination in
                    Button { browser.navigate(to: destination.path) } label: {
                        Label(destination.title, systemImage: destination.symbol)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                            .padding(.horizontal, 8)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(browser.destination == destination ? Color.accentColor.opacity(0.2) : Color.clear)
                    .accessibilityAddTraits(browser.destination == destination ? [.isSelected] : [])
                }
            }
            .navigationTitle("SWTTR")
            .navigationSplitViewColumnWidth(min: 180, ideal: 224, max: 280)
        } detail: {
            ZStack {
                SWTTRWebView(browser: browser)
                if let failure = browser.failure {
                    ContentUnavailableView {
                        Label("Can't reach SWTTR", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(failure)
                    } actions: {
                        Button("Retry", action: browser.retry).buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(nsColor: SWTTRAppearance.canvas))
                } else if !browser.hasLoadedPage {
                    ProgressView("Loading SWTTR…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(nsColor: SWTTRAppearance.canvas))
                }
            }
            .navigationTitle(browser.destination?.title ?? "SWTTR")
            .toolbar {
                ToolbarItemGroup(placement: .navigation) {
                    Button(action: browser.goBack) { Label("Back", systemImage: "chevron.left") }
                        .disabled(!browser.canGoBack)
                    Button(action: browser.goForward) { Label("Forward", systemImage: "chevron.right") }
                        .disabled(!browser.canGoForward)
                }
                ToolbarItem {
                    if browser.isLoading { ProgressView().controlSize(.small).accessibilityLabel("Loading page") }
                }
            }
        }
    }
}

struct SWTTRWebView: NSViewRepresentable {
    let browser: SWTTRBrowser
    func makeNSView(context: Context) -> WKWebView { browser.webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
