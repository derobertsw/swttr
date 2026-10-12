// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SWTTRShellKit",
    platforms: [.iOS(.v15), .macOS(.v14)],
    products: [.library(name: "SWTTRShellKit", targets: ["SWTTRShellKit"])],
    targets: [
        .target(name: "SWTTRShellKit"),
        .testTarget(name: "SWTTRShellKitTests", dependencies: ["SWTTRShellKit"])
    ]
)
