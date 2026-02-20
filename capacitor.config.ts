import type { CapacitorConfig } from "@capacitor/cli";

function resolveServerConfig(): CapacitorConfig["server"] | undefined {
  const url = process.env.CAP_SERVER_URL?.trim();
  if (!url) return undefined;

  try {
    const hostname = new URL(url).hostname;
    return {
      url,
      allowNavigation: [hostname, `*.${hostname}`],
    };
  } catch {
    return { url };
  }
}

const server = resolveServerConfig();

const config: CapacitorConfig = {
  appId: "com.swttr.app",
  appName: "SWTTR",
  webDir: "capacitor-web",
  ...(server ? { server } : {}),
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
    },
    SplashScreen: {
      backgroundColor: "#1e293b",
    },
  },
};

export default config;
