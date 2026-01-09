"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { WebContainer } from "@webcontainer/api";
import { WebContainerManager } from "@/lib/webcontainer";
import { DevServerManager } from "@/lib/dev-server";
import { getPreviewStore, PreviewInfo } from "@/lib/preview-store";
import { useToast } from "@/components/ui/toast";
import { FileTree } from "./file-tree";
import { FileSearch } from "./file-search";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { CodeEditor } from "./code-editor";
import { TerminalTabs } from "./terminal-tabs";
import { Preview } from "./preview";
import { Button } from "@/components/ui/button";
import { Tabs, TabOption } from "@/components/ui/tabs";
import {
  PanelLeft,
  Save,
  RefreshCw,
  Play,
  Square,
  Loader2,
  ArrowUpRight,
  Monitor,
  Tablet,
  Smartphone,
  Github,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { SupabasePicker } from "@/components/supabase/SupabasePicker";
import { cn } from "@/lib/utils";
import "@/lib/debug-storage"; // Make debug utilities available in console

type WorkspaceView = "code" | "preview";

interface WorkspaceProps {
  projectId: string;
  initialPrompt?: string;
  platform?: "web" | "mobile";
}

export function Workspace({
  projectId,
  initialPrompt,
  platform: initialPlatform,
}: WorkspaceProps) {
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);
  const [files, setFiles] = useState<
    Record<string, { type: "file" | "folder" }>
  >({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"files" | "search">("files");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentView, setCurrentView] = useState<WorkspaceView>("preview");
  const [previews, setPreviews] = useState<PreviewInfo[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  // Preview UI state lifted to combine headers
  const [previewPath, setPreviewPath] = useState<string>("/");
  const [previewDevice, setPreviewDevice] = useState<
    "desktop" | "tablet" | "mobile"
  >("desktop");
  const [previewLandscape] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [isDevServerRunning, setIsDevServerRunning] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [expUrl, setExpUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"web" | "mobile">(
    initialPlatform ?? "web",
  );
  const [cloudSyncStatus, setCloudSyncStatus] = useState<{
    syncing: boolean;
    lastSyncAt: Date | null;
  }>({ syncing: false, lastSyncAt: null });
  const [htmlSnapshotUrl, setHtmlSnapshotUrl] = useState<string | null>(null);

  // Prevent concurrent initializations within same render
  const initializingRef = useRef(false);

  // Toast for notifications
  const { toast } = useToast();

  // Track if we've already captured HTML for this dev server session
  const htmlCapturedRef = useRef(false);

  // Fetch platform and htmlSnapshotUrl from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}`,
        );
        if (res.ok) {
          const proj = await res.json();
          if (!initialPlatform && (proj?.platform === "mobile" || proj?.platform === "web")) {
            setPlatform(proj.platform);
          }
          if (proj?.htmlSnapshotUrl) {
            setHtmlSnapshotUrl(proj.htmlSnapshotUrl);
          }
        }
      } catch (e) {
        console.warn("Failed to load project data", e);
      }
    })();
  }, [initialPlatform, projectId]);

  // Helper function definitions - moved to top
  const getFileStructure = useCallback(
    async (
      container: WebContainer,
    ): Promise<Record<string, { type: "file" | "folder" }>> => {
      const files: Record<string, { type: "file" | "folder" }> = {};

      async function processDirectory(path: string) {
        try {
          const entries = await container.fs.readdir(path, {
            withFileTypes: true,
          });

          for (const entry of entries) {
            const fullPath =
              path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;

            if (entry.isDirectory()) {
              files[fullPath] = { type: "folder" };
              await processDirectory(fullPath);
            } else {
              files[fullPath] = { type: "file" };
            }
          }
        } catch (error) {
          console.error(`Error reading directory ${path}:`, error);
        }
      }

      await processDirectory("/");
      return files;
    },
    [],
  );

  const refreshFileTree = useCallback(
    async (container: WebContainer) => {
      const fileList = await getFileStructure(container);
      setFiles(fileList);
    },
    [getFileStructure],
  );

  const handleSaveFile = useCallback(async () => {
    if (!webcontainer || !selectedFile) return;

    try {
      await webcontainer.fs.writeFile(selectedFile, fileContent);
      setHasUnsavedChanges(false);
      console.log("File saved:", selectedFile);

      // Save project state
      await WebContainerManager.saveProjectState(projectId);

      // Refresh file tree to ensure it's in sync
      await refreshFileTree(webcontainer);
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [webcontainer, selectedFile, fileContent, projectId, refreshFileTree]);

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!webcontainer || files[filePath]?.type !== "file") return;

      try {
        const content = await webcontainer.fs.readFile(filePath, "utf8");
        setSelectedFile(filePath);
        setFileContent(content);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("Failed to read file:", error);
      }
    },
    [webcontainer, files],
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setFileContent(newContent);
      setHasUnsavedChanges(fileContent !== newContent);
    },
    [fileContent],
  );

  // Removed unused handleRefreshFiles function

  const handleFileSystemChange = useCallback(
    async (event: Event) => {
      const { container } = (event as CustomEvent).detail;
      if (container) {
        await refreshFileTree(container);
        // Skip autosave while hydrating/init to avoid overwriting snapshots
        const { filename } = (event as CustomEvent).detail;
        if (
          !hydrating &&
          initializationComplete &&
          filename &&
          !filename.includes("node_modules") &&
          !filename.includes(".git")
        ) {
          console.log(
            `💾 Auto-saving project state (file changed: ${filename})...`,
          );
          await WebContainerManager.saveProjectState(projectId);
        } else {
          // Log why save was skipped
          if (hydrating) {
            console.log(
              `⏭️ Skipping auto-save: still hydrating (file: ${filename})`,
            );
          } else if (!initializationComplete) {
            console.log(
              `⏭️ Skipping auto-save: initialization not complete (file: ${filename})`,
            );
          } else if (!filename) {
            console.log(`⏭️ Skipping auto-save: no filename`);
          } else if (
            filename.includes("node_modules") ||
            filename.includes(".git")
          ) {
            console.log(`⏭️ Skipping auto-save: system file (${filename})`);
          }
        }
      }
    },
    [projectId, refreshFileTree, hydrating, initializationComplete],
  );

  const runInstall = useCallback(
    async (container: WebContainer) => {
      setIsInstalling(true);
      try {
        // Remove node_modules if it exists
        try {
          await container.fs.rm("/node_modules", {
            recursive: true,
            force: true,
          });
        } catch {
          // node_modules might not exist, that's ok
        }

        // Run installer based on platform
        const installProcess =
          platform === "mobile"
            ? await container.spawn("pnpm", ["install"])
            : await container.spawn("pnpm", ["install"]);
        const exitCode = await installProcess.exit;

        if (exitCode === 0) {
          setIsInstalled(true);
          console.log("install completed successfully");
        } else {
          console.error("install failed with exit code:", exitCode);
          setIsInstalled(false);
        }
      } catch (error) {
        console.error("Failed to run install:", error);
        setIsInstalled(false);
      } finally {
        setIsInstalling(false);
      }
    },
    [platform],
  );

  const startDevServer = useCallback(
    async (_container: WebContainer) => {
      // Keep UI flags similar, but delegate to DevServerManager
      if (!isInstalled) {
        await runInstall(_container);
      }
      setIsStartingServer(true);
      try {
        const res = await DevServerManager.start();
        console.log(res.message);
      } catch (error) {
        console.error("Failed to start dev server:", error);
      } finally {
        setIsStartingServer(false);
      }
    },
    [isInstalled, runInstall],
  );

  const stopDevServer = useCallback(async (_container?: WebContainer) => {
    try {
      console.log("🛑 Stopping dev server...");
      const res = await DevServerManager.stop();
      console.log(res.message);
      setExpUrl(null);
    } catch (error) {
      console.error("Failed to stop dev server:", error);
    }
  }, []);

  const handlePlayStopClick = useCallback(async () => {
    if (!webcontainer) return;

    if (isDevServerRunning) {
      await stopDevServer(webcontainer);
    } else {
      await startDevServer(webcontainer);
    }
  }, [webcontainer, isDevServerRunning, startDevServer, stopDevServer]);

  // REMOVED: Manual snapshot test button (no longer needed)

  useEffect(() => {
    async function initWebContainer() {
      // Prevent concurrent initializations within same mount
      if (initializingRef.current) {
        return;
      }
      initializingRef.current = true;

      setHydrating(true);
      try {
        const container = await WebContainerManager.getInstance();
        setWebcontainer(container);

        // Initialize preview store
        const previewStore = getPreviewStore();
        previewStore.setWebContainer(container);

        // Subscribe to preview updates
        const unsubscribe = previewStore.subscribe((newPreviews) => {
          setPreviews((prevPreviews) => {
            // Auto-switch to preview tab when first server starts
            if (newPreviews.length > 0 && prevPreviews.length === 0) {
              setCurrentView("preview");
            }
            return newPreviews;
          });

          // Track if dev server is running
          setIsDevServerRunning(newPreviews.length > 0);
        });

        // Always restore from saved state first; fall back to template if none (suppress autosave during init)
        console.log(`🔍 Loading project state for: ${projectId}`);
        const savedState =
          await WebContainerManager.loadProjectState(projectId);
        console.log(
          `📦 Saved state:`,
          savedState ? `${Object.keys(savedState).length} files` : "null",
        );

        if (savedState && Object.keys(savedState).length > 0) {
          console.log(
            `🔄 Restoring ${Object.keys(savedState).length} files from IndexedDB...`,
          );
          await WebContainerManager.restoreFiles(container, savedState);
          console.log(`✅ Files restored from IndexedDB`);
        } else {
          console.log(`📭 No local state found, trying cloud backup...`);

          // Try restoring from cloud (only for existing projects with backups)
          const { CloudBackupManager } = await import("@/lib/cloud-backup");
          const restored =
            await CloudBackupManager.getInstance().restoreFromCloud(
              projectId,
              container,
            );

          if (restored) {
            console.log("✅ Restored from cloud backup");
            await refreshFileTree(container);
            setIsLoading(false);
            setHydrating(false);

            // Wait for pending fs.watch events before enabling auto-save
            setTimeout(() => {
              setInitializationComplete(true);
            }, 1000);

            // Return cleanup function
            return unsubscribe;
          }

          // No backup found - mount template (normal for new projects)
          console.log(`📦 No backup found, mounting template...`);

          if (platform === "mobile") {
            // Populate Expo project files
            await container.mount({
              "package.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      name: "bolt-expo-template",
                      main: "expo-router/entry",
                      version: "1.0.0",
                      private: true,
                      scripts: {
                        dev: "EXPO_NO_TELEMETRY=1 expo start",
                        "build:web": "expo export --platform web",
                        lint: "expo lint",
                      },
                      dependencies: {
                        "@expo/vector-icons": "^14.1.0",
                        "@lucide/lab": "^0.1.2",
                        "@react-navigation/bottom-tabs": "^7.2.0",
                        "@react-navigation/native": "^7.0.14",
                        expo: "^53.0.0",
                        "expo-blur": "~14.1.3",
                        "expo-camera": "~16.1.5",
                        "expo-constants": "~17.1.3",
                        "expo-font": "~13.2.2",
                        "expo-haptics": "~14.1.3",
                        "expo-linear-gradient": "~14.1.3",
                        "expo-linking": "~7.1.3",
                        "expo-router": "~5.0.2",
                        "expo-splash-screen": "~0.30.6",
                        "expo-status-bar": "~2.2.2",
                        "expo-symbols": "~0.4.3",
                        "expo-system-ui": "~5.0.5",
                        "expo-web-browser": "~14.1.5",
                        "lucide-react-native": "^0.475.0",
                        react: "19.0.0",
                        "react-dom": "19.0.0",
                        "react-native": "0.79.1",
                        "react-native-gesture-handler": "~2.24.0",
                        "react-native-reanimated": "~3.17.4",
                        "react-native-safe-area-context": "5.3.0",
                        "react-native-screens": "~4.10.0",
                        "react-native-svg": "15.11.2",
                        "react-native-url-polyfill": "^2.0.0",
                        "react-native-web": "^0.20.0",
                        "react-native-webview": "13.13.5",
                      },
                      devDependencies: {
                        "@babel/core": "^7.25.2",
                        "@types/react": "~19.0.10",
                        typescript: "~5.8.3",
                      },
                    },
                    null,
                    2,
                  ),
                },
              },
              "app.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      expo: {
                        name: "bolt-diy-expo-nativewind",
                        slug: "bolt-diy-expo-nativewind",
                        version: "1.0.0",
                        orientation: "portrait",
                        icon: "./assets/images/icon.png",
                        scheme: "myapp",
                        userInterfaceStyle: "automatic",
                        newArchEnabled: true,
                        ios: { supportsTablet: true },
                        web: {
                          bundler: "metro",
                          output: "single",
                          favicon: "./assets/images/favicon.png",
                        },
                        plugins: [
                          "expo-router",
                          "expo-font",
                          "expo-web-browser",
                        ],
                        experiments: { typedRoutes: true },
                      },
                    },
                    null,
                    2,
                  ),
                },
              },
              "expo-env.d.ts": {
                file: { contents: '/// <reference types="expo/types" />\n' },
              },
              "tsconfig.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      extends: "expo/tsconfig.base",
                      compilerOptions: {
                        strict: true,
                        paths: { "@/*": ["./*"] },
                      },
                      include: [
                        "**/*.ts",
                        "**/*.tsx",
                        ".expo/types/**/*.ts",
                        "expo-env.d.ts",
                        "nativewind-env.d.ts",
                      ],
                    },
                    null,
                    2,
                  ),
                },
              },
              hooks: {
                directory: {
                  "useFrameworkReady.ts": {
                    file: {
                      contents: `import { useEffect } from 'react';

declare global {
  interface Window { frameworkReady?: () => void }
}

export function useFrameworkReady() {
  useEffect(() => {
    window.frameworkReady?.();
  });
}
`,
                    },
                  },
                },
              },
              app: {
                directory: {
                  "index.tsx": {
                    file: {
                      contents: `import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)" />;
}
`,
                    },
                  },
                  "(tabs)": {
                    directory: {
                      "index.tsx": {
                        file: {
                          contents: `import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>Start prompting now to make changes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  message: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
});
`,
                        },
                      },
                      "_layout.tsx": {
                        file: {
                          contents: `import { Tabs } from 'expo-router';
import { Home } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
    </Tabs>
  );
}
`,
                        },
                      },
                    },
                  },
                  "+not-found.tsx": {
                    file: {
                      contents: `import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.text}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  text: { fontSize: 20, fontWeight: '600' },
  link: { marginTop: 15, paddingVertical: 15 },
});
`,
                    },
                  },
                  "_layout.tsx": {
                    file: {
                      contents: `import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

export default function RootLayout() {
  useFrameworkReady();
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
`,
                    },
                  },
                },
              },
            });
            // No external fetch; files populated locally.
          } else {
            // Initialize with Vite + React + TypeScript + Tailwind structure
            await container.mount({
              "README.md": {
                file: { contents: "# React + TypeScript + Vite" },
              },
              "package.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      name: projectId.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                      private: true,
                      version: "0.0.0",
                      type: "module",
                      packageManager: "pnpm@9.0.0",
                      engines: {
                        node: ">=18.0.0",
                        pnpm: ">=8.0.0",
                      },
                      scripts: {
                        dev: "vite",
                        build: "tsc -b && vite build",
                        lint: "eslint .",
                        preview: "vite preview",
                      },
                      dependencies: {
                        react: "^18.3.1",
                        "react-dom": "^18.3.1",
                        clsx: "^2.1.1",
                        "tailwind-merge": "^2.5.4",
                      },
                      devDependencies: {
                        "@eslint/js": "^9.17.0",
                        "@tailwindcss/vite": "^4.0.0-beta.6",
                        "@types/node": "^22.10.2",
                        "@types/react": "^18.3.17",
                        "@types/react-dom": "^18.3.5",
                        "@vitejs/plugin-react": "^4.3.4",
                        eslint: "^9.17.0",
                        "eslint-plugin-react-hooks": "^5.0.0",
                        "eslint-plugin-react-refresh": "^0.4.16",
                        globals: "^15.13.0",
                        tailwindcss: "^4.0.0-beta.6",
                        typescript: "~5.6.2",
                        "typescript-eslint": "^8.18.2",
                        vite: "^6.0.5",
                      },
                    },
                    null,
                    2,
                  ),
                },
              },
              "index.html": {
                file: {
                  contents: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
                },
              },
              "vite.config.ts": {
                file: {
                  contents: `import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      usePolling: true,
      interval: 150,
      binaryInterval: 300,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**']
    },
    // Disable file watching optimizations that can cause issues in WebContainers
    fs: {
      strict: false
    },
    // Enable HMR error overlay
    hmr: {
      overlay: true
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Optimize for WebContainer environment
  define: {
    'process.env.VITE_WEBCONTAINER': 'true'
  },
  optimizeDeps: {
    // Reduce aggressive pre-bundling that can conflict with file saves
    include: ['react', 'react-dom'],
    force: false
  },
  // Reduce build optimizations that might interfere with file watching
  build: {
    rollupOptions: {
      watch: {
        buildDelay: 100
      }
    }
  }
})`,
                },
              },
              "tsconfig.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      compilerOptions: {
                        target: "ESNext",
                        useDefineForClassFields: true,
                        lib: ["ESNext", "DOM"],
                        module: "ESNext",
                        skipLibCheck: true,
                        moduleResolution: "bundler",
                        allowImportingTsExtensions: true,
                        resolveJsonModule: true,
                        isolatedModules: true,
                        noEmit: true,
                        jsx: "react-jsx",
                        baseUrl: ".",
                        paths: {
                          "@/*": ["./src/*"],
                        },
                      },
                      include: ["src"],
                      references: [
                        { path: "./tsconfig.app.json" },
                        { path: "./tsconfig.node.json" },
                      ],
                    },
                    null,
                    2,
                  ),
                },
              },
              "tsconfig.app.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      compilerOptions: {
                        tsBuildInfoFile:
                          "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
                        target: "ES2022",
                        useDefineForClassFields: true,
                        lib: ["ES2022", "DOM", "DOM.Iterable"],
                        module: "ESNext",
                        skipLibCheck: true,
                        moduleResolution: "bundler",
                        allowImportingTsExtensions: true,
                        verbatimModuleSyntax: true,
                        moduleDetection: "force",
                        noEmit: true,
                        jsx: "react-jsx",
                        strict: true,
                        noUnusedLocals: true,
                        noUnusedParameters: true,
                        erasableSyntaxOnly: true,
                        noFallthroughCasesInSwitch: true,
                        noUncheckedSideEffectImports: true,
                        baseUrl: ".",
                        paths: {
                          "@/*": ["./src/*"],
                        },
                      },
                      include: ["src"],
                    },
                    null,
                    2,
                  ),
                },
              },
              "tsconfig.node.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      compilerOptions: {
                        tsBuildInfoFile:
                          "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
                        target: "ES2023",
                        lib: ["ES2023"],
                        module: "ESNext",
                        skipLibCheck: true,
                        moduleResolution: "bundler",
                        allowImportingTsExtensions: true,
                        verbatimModuleSyntax: true,
                        moduleDetection: "force",
                        noEmit: true,
                        strict: true,
                        noUnusedLocals: true,
                        noUnusedParameters: true,
                        erasableSyntaxOnly: true,
                        noFallthroughCasesInSwitch: true,
                        noUncheckedSideEffectImports: true,
                      },
                      include: ["vite.config.ts"],
                    },
                    null,
                    2,
                  ),
                },
              },
              "components.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      $schema: "https://ui.shadcn.com/schema.json",
                      style: "new-york",
                      rsc: false,
                      tsx: true,
                      tailwind: {
                        config: "tailwind.config.js",
                        css: "src/index.css",
                        baseColor: "neutral",
                        cssVariables: true,
                      },
                      aliases: {
                        components: "@/components",
                        utils: "@/lib/utils",
                      },
                    },
                    null,
                    2,
                  ),
                },
              },
              "eslint.config.js": {
                file: {
                  contents: `import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])`,
                },
              },
              ".gitignore": {
                file: {
                  contents: `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`,
                },
              },
              src: {
                directory: {
                  "main.tsx": {
                    file: {
                      contents: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// ============================================================================
// Debug: Forward iframe console and Vite HMR status to parent window
// ============================================================================
if (typeof window !== 'undefined' && window.parent !== window) {
  // Forward console messages to parent
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const forwardToParent = (level: string, ...args: unknown[]) => {
    try {
      window.parent.postMessage({
        type: 'IFRAME_CONSOLE',
        level,
        message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
      }, '*');
    } catch {}
  };

  console.log = (...args) => { originalConsole.log(...args); forwardToParent('log', ...args); };
  console.warn = (...args) => { originalConsole.warn(...args); forwardToParent('warn', ...args); };
  console.error = (...args) => { originalConsole.error(...args); forwardToParent('error', ...args); };

  // Forward uncaught errors
  window.addEventListener('error', (e) => {
    window.parent.postMessage({
      type: 'IFRAME_ERROR',
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    }, '*');
  });

  // Forward unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    window.parent.postMessage({
      type: 'IFRAME_ERROR',
      message: 'Unhandled Promise Rejection: ' + String(e.reason),
    }, '*');
  });

  // Listen for Vite HMR events
  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
      window.parent.postMessage({ type: 'VITE_HMR', event: 'beforeUpdate' }, '*');
    });
    import.meta.hot.on('vite:afterUpdate', () => {
      window.parent.postMessage({ type: 'VITE_HMR', event: 'afterUpdate' }, '*');
    });
    import.meta.hot.on('vite:error', (err) => {
      window.parent.postMessage({ type: 'VITE_HMR', event: 'error', error: err }, '*');
    });
    import.meta.hot.on('vite:ws:connect', () => {
      window.parent.postMessage({ type: 'VITE_HMR', event: 'connected' }, '*');
    });
    import.meta.hot.on('vite:ws:disconnect', () => {
      window.parent.postMessage({ type: 'VITE_HMR', event: 'disconnected' }, '*');
    });
    // Signal that HMR module is loaded
    window.parent.postMessage({ type: 'VITE_HMR', event: 'hmrModuleLoaded' }, '*');
  } else {
    window.parent.postMessage({ type: 'VITE_HMR', event: 'hmrNotAvailable' }, '*');
  }
}

// HTML Snapshot Capture for Project Thumbnails
// DO NOT REMOVE: This code enables automatic thumbnail generation
// It sends the rendered HTML to the parent window for snapshot capture
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    console.log('📸 Page loaded, will send HTML snapshot in 500ms...');
    setTimeout(() => {
      try {
        const html = document.documentElement.outerHTML;
        console.log('📸 Sending HTML snapshot to parent...', html.length, 'bytes');
        window.parent.postMessage(
          {
            type: 'HTML_SNAPSHOT',
            html: html,
          },
          '*'
        );
        console.log('✅ HTML snapshot sent!');
      } catch (e) {
        console.error('❌ Could not send HTML snapshot:', e);
      }
    }, 500); // Wait 500ms after load for rendering to complete
  });
}`,
                    },
                  },
                  "App.tsx": {
                    file: {
                      contents: `function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800">
        ✅ Setup successful! You can now start building with Vite + Tailwind +
        shadcn/ui.
      </h1>
    </div>
  )
}

export default App`,
                    },
                  },
                  "index.css": {
                    file: {
                      contents: '@import "tailwindcss";',
                    },
                  },
                  "vite-env.d.ts": {
                    file: {
                      contents: '/// <reference types="vite/client" />',
                    },
                  },
                  "ErrorBoundary.tsx": {
                    file: {
                      contents: `import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Forward error to parent window
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage({
        type: 'REACT_ERROR',
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }, '*');
    }

    console.error('React Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: '#ff6b6b',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '14px',
          padding: '20px',
          overflow: 'auto',
          zIndex: 99999,
        }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ color: '#ff6b6b', fontSize: '24px', marginBottom: '16px' }}>
              ❌ Runtime Error
            </h1>
            <div style={{
              backgroundColor: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid #ff6b6b',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                {error?.message || 'Unknown error'}
              </div>
              {error?.stack && (
                <pre style={{
                  color: '#aaa',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                }}>
                  {error.stack}
                </pre>
              )}
            </div>
            {errorInfo?.componentStack && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '16px',
              }}>
                <div style={{ color: '#888', marginBottom: '8px' }}>Component Stack:</div>
                <pre style={{
                  color: '#666',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}>
                  {errorInfo.componentStack}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#ff6b6b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;`,
                    },
                  },
                  lib: {
                    directory: {
                      "utils.ts": {
                        file: {
                          contents: `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`,
                        },
                      },
                    },
                  },
                },
              },
            });
          }
        }

        // Get initial file list
        await refreshFileTree(container);

        setIsLoading(false);
        setHydrating(false);

        // Wait for any pending fs.watch events to complete before enabling auto-save
        // This prevents the initial template mount from triggering auto-save
        setTimeout(() => {
          setInitializationComplete(true);
        }, 1000);

        // Return cleanup function for preview subscription
        return unsubscribe;
      } catch (error) {
        console.error("Failed to initialize WebContainer:", error);
        setIsLoading(false);
        setHydrating(false);
        setTimeout(() => {
          setInitializationComplete(true);
        }, 1000);
        return () => {}; // Empty cleanup function
      }
    }

    let cleanupPreview: (() => void) | undefined;

    initWebContainer().then((cleanup) => {
      cleanupPreview = cleanup;
    });

    // Listen for file system changes
    window.addEventListener("webcontainer-fs-change", handleFileSystemChange);

    return () => {
      // Reset initialization guard so component can re-initialize on remount
      initializingRef.current = false;

      window.removeEventListener(
        "webcontainer-fs-change",
        handleFileSystemChange,
      );
      if (cleanupPreview) {
        cleanupPreview();
      }
    };
  }, [
    projectId,
    platform,
    refreshFileTree,
    handleFileSystemChange,
    runInstall,
  ]);

  // React to preview refresh requests from tools
  useEffect(() => {
    const onRefresh = () => setPreviewReloadKey((k) => k + 1);
    const onExpoUrl = (e: Event) => {
      try {
        const url = (e as CustomEvent).detail?.url as string | undefined;
        if (url) setExpUrl(url);
      } catch {}
    };
    if (typeof window !== "undefined") {
      window.addEventListener("preview-refresh", onRefresh as EventListener);
      window.addEventListener("devserver-exp-url", onExpoUrl as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "preview-refresh",
          onRefresh as EventListener,
        );
        window.removeEventListener(
          "devserver-exp-url",
          onExpoUrl as EventListener,
        );
      }
    };
  }, []);

  // Listen for HTML snapshot messages from iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security: Only accept messages from StackBlitz/WebContainer domains
      if (
        !event.origin.includes("stackblitz") &&
        !event.origin.includes("webcontainer")
      ) {
        return; // Silently ignore untrusted origins
      }

      // Forward iframe console messages to parent console
      if (event.data?.type === "IFRAME_CONSOLE") {
        const { level, message } = event.data;
        const prefix = "[iframe]";
        if (level === "error") {
          console.error(prefix, message);
        } else if (level === "warn") {
          console.warn(prefix, message);
        } else {
          console.log(prefix, message);
        }
        return;
      }

      // Forward iframe errors to parent console
      if (event.data?.type === "IFRAME_ERROR") {
        console.error("[iframe error]", event.data.message, event.data.filename ? `at ${event.data.filename}:${event.data.lineno}:${event.data.colno}` : "");
        return;
      }

      // Handle Vite HMR events
      if (event.data?.type === "VITE_HMR") {
        const { event: hmrEvent, error } = event.data;
        if (hmrEvent === "connected") {
          console.log("🔌 [Vite HMR] Connected");
        } else if (hmrEvent === "disconnected") {
          console.warn("⚠️ [Vite HMR] Disconnected");
        } else if (hmrEvent === "error") {
          console.error("❌ [Vite HMR] Error:", error);
        } else if (hmrEvent === "beforeUpdate") {
          console.log("🔄 [Vite HMR] Updating...");
        } else if (hmrEvent === "afterUpdate") {
          console.log("✅ [Vite HMR] Updated");
        } else if (hmrEvent === "hmrModuleLoaded") {
          console.log("✅ [Vite HMR] Module loaded - HMR is available");
        } else if (hmrEvent === "hmrNotAvailable") {
          console.warn("⚠️ [Vite HMR] Not available (import.meta.hot is undefined)");
        }
        return;
      }

      // Handle React Error Boundary errors
      if (event.data?.type === "REACT_ERROR") {
        console.error("❌ [React Error]", event.data.message);
        if (event.data.stack) {
          console.error("Stack:", event.data.stack);
        }
        if (event.data.componentStack) {
          console.error("Component Stack:", event.data.componentStack);
        }
        return;
      }

      if (event.data?.type === "HTML_SNAPSHOT" && event.data?.html) {
        // Only capture once per dev server session
        if (htmlCapturedRef.current) {
          return; // Already captured, silently skip
        }

        try {
          console.log("📄 Received HTML snapshot from iframe!");
          const html = event.data.html;
          console.log(`📄 HTML size: ${html.length} bytes`);

          // Upload to UploadThing
          const response = await fetch(
            `/api/projects/${projectId}/html-snapshot`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html }),
            },
          );

          if (!response.ok) {
            const error = await response.json();
            console.error("Failed to save HTML snapshot:", error);
            return;
          }

          const result = await response.json();
          console.log("✅ HTML snapshot saved:", result.htmlSnapshotUrl);

          // Generate thumbnail from HTML
          console.log("🖼️  Generating thumbnail from HTML...");
          const thumbnailResponse = await fetch(
            `/api/projects/${projectId}/generate-thumbnail-html`,
            {
              method: "POST",
            },
          );

          if (thumbnailResponse.ok) {
            const thumbnailResult = await thumbnailResponse.json();
            console.log(
              "✅ Thumbnail generated:",
              thumbnailResult.thumbnailUrl,
            );

            // Show toast notification
            toast({
              title: "Thumbnail saved",
              description: "Project snapshot captured successfully",
            });
          } else {
            console.error("Failed to generate thumbnail");
            // Still show toast for HTML snapshot
            toast({
              title: "Snapshot saved",
              description: "Thumbnail generation failed",
            });
          }

          htmlCapturedRef.current = true;
        } catch (error) {
          console.error("Failed to save HTML snapshot:", error);
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [projectId, toast]);

  // Reset capture flag when dev server stops
  useEffect(() => {
    if (previews.length === 0) {
      htmlCapturedRef.current = false;
    }
  }, [previews]);

  // Listen for cloud sync events
  useEffect(() => {
    const handleSyncStart = () =>
      setCloudSyncStatus({ syncing: true, lastSyncAt: null });
    const handleSyncComplete = () =>
      setCloudSyncStatus({ syncing: false, lastSyncAt: new Date() });
    const handleSyncError = () =>
      setCloudSyncStatus((prev) => ({
        syncing: false,
        lastSyncAt: prev.lastSyncAt,
      }));

    if (typeof window !== "undefined") {
      window.addEventListener("cloud-sync-start", handleSyncStart);
      window.addEventListener("cloud-sync-complete", handleSyncComplete);
      window.addEventListener("cloud-sync-error", handleSyncError);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("cloud-sync-start", handleSyncStart);
        window.removeEventListener("cloud-sync-complete", handleSyncComplete);
        window.removeEventListener("cloud-sync-error", handleSyncError);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (selectedFile && hasUnsavedChanges) {
          handleSaveFile();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFile, hasUnsavedChanges, handleSaveFile]);

  // Auto-save on page unload
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
        await handleSaveFile();
      }

      // Save project state on exit
      await WebContainerManager.saveProjectState(projectId);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, projectId, handleSaveFile]);

  // Auto-save when switching files
  useEffect(() => {
    return () => {
      // This cleanup runs when selectedFile is about to change
      if (hasUnsavedChanges && webcontainer && selectedFile) {
        webcontainer.fs
          .writeFile(selectedFile, fileContent)
          .catch(console.error);
        WebContainerManager.saveProjectState(projectId).catch(console.error);
      }
    };
  }, [selectedFile, hasUnsavedChanges, webcontainer, projectId, fileContent]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        {/* <div className="text-muted">Loading WebContainer...</div> */}
        <div className="text-muted">There is no moat...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bolt-bg text-fg">
      {/* Agent sidebar - persistent on the far left */}
      <div className="w-96 flex flex-col bg-elevated/70 backdrop-blur-sm">
        <AgentPanel
          className="h-full"
          projectId={projectId}
          initialPrompt={initialPrompt}
          platform={platform}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-12 flex items-center pr-2.5 gap-4 bg-surface backdrop-blur-sm">
          {/* Tabs */}
          <Tabs
            options={
              [
                {
                  value: "preview",
                  text: `Preview${
                    previews.length > 0 ? ` (${previews.length})` : ""
                  }`,
                },
                { value: "code", text: "Code" },
              ] as TabOption<WorkspaceView>[]
            }
            selected={currentView}
            onSelect={setCurrentView}
          />

          {/* Play/Stop Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePlayStopClick}
            disabled={isInstalling || isStartingServer}
            className={cn(
              "flex items-center gap-2 font-bold text-md",
              isDevServerRunning
                ? "text-red-400 hover:text-red-300 hover:bg-red-400/10"
                : "text-green-400 hover:text-green-300 hover:bg-green-400/10",
            )}
          >
            {isInstalling || isStartingServer ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isDevServerRunning ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            <span>
              {isInstalling
                ? "Installing..."
                : isStartingServer
                  ? "Starting..."
                  : isDevServerRunning
                    ? "Stop"
                    : "Start"}
            </span>
          </Button>

          {/* File explorer toggle - on the right side of Tabs and after Start/Stop */}
          {currentView === "code" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-muted hover:text-fg bolt-hover"
              title={showSidebar ? "Hide explorer" : "Show explorer"}
            >
              <PanelLeft size={16} />
            </Button>
          )}

          {currentView === "code" && selectedFile && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">/</span>
              <span className="text-fg font-medium bg-elevated/70 px-2 py-1 rounded flex items-center gap-2">
                {selectedFile.split("/").pop()}
                {hasUnsavedChanges && (
                  <span
                    className="w-2 h-2 rounded-full bg-orange-500"
                    title="Unsaved changes"
                  />
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveFile}
                className="text-muted hover:text-fg bolt-hover"
                title="Save file"
              >
                <Save size={16} />
                <span className="ml-1">Save</span>
              </Button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {currentView === "code" ? (
              <></>
            ) : (
              <>
                {previews.length > 1 && (
                  <select
                    className="text-sm bg-elevated border border-border rounded-md px-2 py-1 text-muted"
                    value={activePreviewIndex}
                    onChange={(e) =>
                      setActivePreviewIndex(Number(e.target.value))
                    }
                    title="Select preview port"
                  >
                    {previews.map((p, i) => (
                      <option key={p.port} value={i}>
                        Port {p.port}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-2 border border-border rounded-full px-3 py-1 min-w-[220px]">
                  {/* Device toggle: cycles desktop → tablet → mobile */}
                  <button
                    onClick={() =>
                      setPreviewDevice((prev) =>
                        prev === "desktop"
                          ? "tablet"
                          : prev === "tablet"
                            ? "mobile"
                            : "desktop",
                      )
                    }
                    className="text-muted hover:text-fg"
                    title={`Device: ${previewDevice}`}
                  >
                    {previewDevice === "desktop" && <Monitor size={16} />}
                    {previewDevice === "tablet" && <Tablet size={16} />}
                    {previewDevice === "mobile" && <Smartphone size={16} />}
                  </button>
                  <span className="text-muted text-sm select-none">/</span>
                  <input
                    type="text"
                    value={previewPath.replace(/^\//, "")}
                    onChange={(e) =>
                      setPreviewPath("/" + e.target.value.replace(/^\//, ""))
                    }
                    placeholder=""
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    onClick={() => {
                      const p = previews[activePreviewIndex];
                      if (p)
                        window.open(p.baseUrl + (previewPath || "/"), "_blank");
                    }}
                    className="text-muted hover:text-fg"
                    title="Open in new tab"
                  >
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    onClick={() => setPreviewReloadKey((k) => k + 1)}
                    className="text-muted hover:text-fg"
                    title="Reload preview"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </>
            )}

            {/* Cloud Sync Status Indicator */}
            <div className="text-xs text-muted flex items-center gap-1.5 px-2 py-1 rounded-md bg-elevated">
              {cloudSyncStatus.syncing ? (
                <>
                  <Loader2 size={12} className="animate-spin text-blue-500" />
                  <span>Syncing...</span>
                </>
              ) : cloudSyncStatus.lastSyncAt ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Synced {timeAgo(cloudSyncStatus.lastSyncAt)}</span>
                </>
              ) : null}
            </div>

            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }}
            />
            <SupabasePicker projectId={projectId} />
            <Button
              variant="outline"
              size="sm"
              className="w-8 p-0 aspect-square"
              onClick={() => {
                /* TODO: connect GitHub */
              }}
              title="GitHub"
            >
              <Github size={16} />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="font-bold text-sm"
              onClick={() => {
                // TODO: implement publish flow
              }}
            >
              Publish
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 relative bg-surface">
          {/* Code View - Always mounted but conditionally visible */}
          <div
            className={cn(
              "absolute inset-0",
              currentView === "code" ? "flex flex-col" : "hidden",
              "rounded-xl border border-border overflow-hidden",
            )}
          >
            <div className="flex-1 min-h-0 flex">
              {showSidebar && (
                <div className="w-80 bolt-border border-r flex flex-col backdrop-blur-sm">
                  <div className="p-2 bolt-border border-b">
                    <Tabs
                      options={
                        [
                          { value: "files", text: "Files" },
                          { value: "search", text: "Search" },
                        ] as TabOption<"files" | "search">[]
                      }
                      selected={sidebarTab}
                      onSelect={(v) => setSidebarTab(v as "files" | "search")}
                    />
                  </div>
                  <div className="flex-1 overflow-auto modern-scrollbar">
                    {sidebarTab === "files" ? (
                      <FileTree
                        files={files}
                        selectedFile={selectedFile}
                        onFileSelect={handleFileSelect}
                      />
                    ) : (
                      <FileSearch
                        files={files}
                        webcontainer={webcontainer}
                        onOpenFile={(path) => {
                          setCurrentView("code");
                          handleFileSelect(path);
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-0 bg-elevated/90 backdrop-blur-sm">
                  <CodeEditor
                    value={fileContent}
                    onChange={handleContentChange}
                    language={getLanguageFromFilename(selectedFile || "")}
                    filename={selectedFile}
                  />
                </div>
              </div>
            </div>

            {/* Terminal - Always mounted, persists across tab switches */}
            <div className="h-64 bolt-border border-t bg-elevated backdrop-blur-sm">
              <TerminalTabs webcontainer={webcontainer} />
            </div>
          </div>
          {/* Preview View - Always mounted but conditionally visible */}
          <div
            className={cn(
              "absolute inset-0 pb-2.5 pr-2.5",
              currentView === "preview" ? "block" : "hidden",
            )}
          >
            <Preview
              previews={previews}
              activePreviewIndex={activePreviewIndex}
              onActivePreviewChange={setActivePreviewIndex}
              showHeader={false}
              currentPath={previewPath}
              selectedDevice={previewDevice}
              isLandscape={previewLandscape}
              reloadKey={previewReloadKey}
              isDevServerRunning={isDevServerRunning}
              isInstalling={isInstalling}
              isStartingServer={isStartingServer}
              onToggleDevServer={handlePlayStopClick}
              platform={platform}
              expUrl={expUrl}
              htmlSnapshotUrl={htmlSnapshotUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    scss: "scss",
    py: "python",
    rb: "ruby",
    php: "php",
    java: "java",
    cpp: "cpp",
    c: "c",
    go: "go",
    rs: "rust",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
    sql: "sql",
  };

  return languageMap[ext || ""] || "plaintext";
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
