// setup-vite-shadcn.js
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const appName = process.argv[2] || "my-app";

function run(cmd, opts = {}) {
  console.log(`\n▶️ Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

// 1. Create project
run(`npm create vite@latest ${appName} -- --template react-ts`, {
  stdio: "inherit",
});

// Move into project
process.chdir(appName);

// 2. Install Tailwind
run(`npm install tailwindcss @tailwindcss/vite`);

// 3. Configure Tailwind in index.css
writeFileSync("src/index.css", `@import "tailwindcss";\n`);

// 4. Overwrite tsconfig.json
writeFileSync(
  "tsconfig.json",
  JSON.stringify(
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
    2
  )
);

// 5. Overwrite tsconfig.app.json
writeFileSync(
  "tsconfig.app.json",
  JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
        },
      },
      include: ["src"],
      exclude: ["node_modules"],
    },
    null,
    2
  )
);

// 6. Install Node types
run(`npm install -D @types/node`);

// 7. Update vite.config.ts
writeFileSync(
  "vite.config.ts",
  `import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
`
);

// 8. Pre-seed components.json (skip shadcn init)
writeFileSync(
  "components.json",
  JSON.stringify(
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
    2
  )
);

// 9. Add utils.ts (needed for shadcn components later)
mkdirSync("src/lib", { recursive: true });
writeFileSync(
  "src/lib/utils.ts",
  `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`
);

// 10. Install clsx + tailwind-merge
run(`npm install clsx tailwind-merge`);

// 11. Replace App.tsx with a placeholder
writeFileSync(
  "src/App.tsx",
  `function App() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <h1 className="text-2xl font-bold">Vite + shadcn/ui setup complete ✅</h1>
    </div>
  )
}

export default App
`
);

// 12. Run npm install to finalize
run(`npm install`);

console.log("\n✅ Setup complete!");
console.log(`👉 cd ${appName} && npm run dev`);
