// swift-tools-version: 6.0
import PackageDescription

// Compile the same app sources with Command Line Tools; XcodeGen creates the
// sandboxed .app bundle used for device QA, signing and distribution.
let package = Package(
    name: "SWTTRMac",
    platforms: [.macOS(.v14)],
    dependencies: [.package(path: "../apple/SWTTRShellKit")],
    targets: [.executableTarget(
        name: "SWTTRMac",
        dependencies: [.product(name: "SWTTRShellKit", package: "SWTTRShellKit")],
        path: "SWTTR",
        exclude: ["Info.plist", "SWTTR.entitlements", "PrivacyInfo.xcprivacy"]
    )],
    swiftLanguageModes: [.v5]
)
