import SwiftUI
import AppKit

struct SWTTRCommands: Commands {
    @ObservedObject var browser: SWTTRBrowser

    var body: some Commands {
        CommandGroup(replacing: .appSettings) {
            Button("Settings…", action: browser.openPreferences)
                .keyboardShortcut(",").disabled(!browser.canOpenPreferences)
        }
        CommandGroup(replacing: .newItem) {
            Button("New Trip") { browser.navigate(to: "/trips/new") }.keyboardShortcut("n")
        }
        CommandGroup(after: .toolbar) {
            Button("Reload", action: browser.reload).keyboardShortcut("r")
            Divider()
            Button("Actual Size") { browser.setZoom(1) }.keyboardShortcut("0")
            Button("Zoom In") { browser.setZoom(browser.webView.pageZoom + 0.1) }.keyboardShortcut("=")
            Button("Zoom Out") { browser.setZoom(browser.webView.pageZoom - 0.1) }.keyboardShortcut("-")
        }
        SidebarCommands()
        CommandMenu("Go") {
            Button("Gear up") { browser.navigate(to: "/") }.keyboardShortcut("1")
            Button("Trips") { browser.navigate(to: "/trips") }.keyboardShortcut("2")
            Button("Wardrobe") { browser.navigate(to: "/wardrobe") }.keyboardShortcut("3")
            Divider()
            Button("Back", action: browser.goBack).keyboardShortcut("[").disabled(!browser.canGoBack)
            Button("Forward", action: browser.goForward).keyboardShortcut("]").disabled(!browser.canGoForward)
        }
        CommandGroup(replacing: .help) {
            Button("SWTTR Help") { browser.navigate(to: "/faq") }
            Button("Send Feedback…") {
                browser.openFeedback()
            }
        }
    }
}
