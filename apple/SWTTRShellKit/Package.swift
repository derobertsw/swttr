// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SWTTRShellKit",
    platforms: [.iOS(.v15), .macOS(.v14)],
    products: [.library(name: "SWTTRShellKit", targets: ["SWTTRShellKit"])],
    targets: [
        // The bridge scripts (#147) are injected into the web view at document start.
        .target(name: "SWTTRShellKit", resources: [.process("Resources")]),
        .testTarget(name: "SWTTRShellKitTests", dependencies: ["SWTTRShellKit"])
    ]
)
