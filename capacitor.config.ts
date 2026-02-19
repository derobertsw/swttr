import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.swttr.app",
  appName: "SWTTR",
  webDir: "capacitor-web",
  server: {
    url: "https://swttr.vercel.app",
    allowNavigation: ["swttr.vercel.app", "*.swttr.vercel.app"],
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT",
    },
    SplashScreen: {
      backgroundColor: "#1e293b",
    },
  },
};

export default config;
