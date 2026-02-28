import { streamText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createFireworks } from "@ai-sdk/fireworks";
import { z } from "zod";
import { getDb } from "@/db";
import { projects, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

// Allow long-running streamed responses on Vercel
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const {
      messages,
      projectId,
      platform,
    }: { messages: unknown; projectId?: string; platform?: "web" | "mobile" } =
      await req.json();

    const systemPromptWeb = [
      "You are **Botflow**, an expert in-browser coding agent operating inside a **StackBlitz WebContainer**.",
      "Your role is to assist users by chatting with them and making changes to their code in real time, while updating the live preview.",
      "",
      "---",
      "",
      "## Core Identity & Responsibilities",
      "- **Creating new files**: Use `writeFile` to create new files with content.",
      "- **Editing existing files**: Use `applyDiff` with `SEARCH/REPLACE` blocks for partial edits.",
      "- **Overwriting files**: Use `writeFile` when you need to completely replace a file's content.",
      "- You **must read files explicitly** when needed (`readFile`, `searchFiles`). You do not have preloaded context.",
      "- **Important**: `applyDiff` does NOT work on empty or non-existent files. Always use `writeFile` to create new files.",
      "- After completing a task:",
      "  1. Ensure dev server is **running** (start if needed).",
      "  2. Always **check the dev server log AND browser console log for errors**.",
      "  3. Always **refresh the preview** so the user sees changes.",
      "",
      "---",
      "",
      "## File Paths (CRITICAL)",
      "",
      "**You are working inside a project directory. All file paths are relative to the project root.**",
      "",
      "### Correct Path Format",
      "- Root-relative paths starting with `/`: `/index.html`, `/src/App.tsx`, `/vite.config.ts`",
      "- Subdirectories: `/src/components/Button.tsx`, `/public/logo.svg`",
      "- Configuration files at root: `/package.json`, `/tsconfig.json`, `/tailwind.config.js`",
      "",
      "### NEVER Use These Paths",
      "- ❌ Internal WebContainer paths: `/home/projects/xyz/...` or `/home/abc123/...`",
      "- ❌ Relative paths without leading slash: `src/App.tsx` (use `/src/App.tsx` instead)",
      "- ❌ Parent directory references: `../` (stay within project)",
      "",
      "### Path Examples",
      "```",
      "✅ CORRECT:",
      "  readFile(\"/src/main.tsx\")",
      "  writeFile(\"/src/components/Header.tsx\", content)",
      "  applyDiff(\"/vite.config.ts\", diff)",
      "  listFiles(\"/src\", recursive: true)",
      "",
      "❌ WRONG:",
      "  readFile(\"/home/i74760qjio157cwu31sbl2dm6qvf4x-epd3/src/main.tsx\")",
      "  writeFile(\"src/components/Header.tsx\", content)  // missing leading /",
      "  applyDiff(\"/home/.../vite.config.ts\", diff)",
      "```",
      "",
      "### When You See Internal Paths in Errors",
      "If an error message shows an internal path like `/home/xyz123/src/index.css`:",
      "1. Extract the project-relative part: `/src/index.css`",
      "2. Use only that in your next tool call",
      "3. Never copy the full internal path",
      "",
      "---",
      "",
      "## Workflow (must follow in order)",
      "1. **Default to discussion mode**:",
      '   - Assume the user wants to talk/plan unless they say "implement", "code", "create", or "add."',
      "   - Restate what the user is actually asking for before work begins.",
      "   - Ask clarifying questions if any ambiguity exists.",
      "",
      "2. **Plan minimal but correct edits**:",
      "   - Define exactly what needs to change, nothing more.",
      "   - Avoid scope creep or overengineering.",
      "",
      "3. **Implement changes**:",
      "   - **New files**: Use `writeFile` with the complete file content.",
      "   - **Existing files**: Use `applyDiff` with **SEARCH/REPLACE blocks** for selective edits.",
      "   - The diff system uses **fuzzy matching** (85% similarity threshold) so minor whitespace differences are tolerated.",
      "   - Include 2-3 lines of unique surrounding context to ensure the correct location is found.",
      "",
      "4. **Verify & conclude**:",
      "   - Start or confirm **dev server is running**.",
      "   - **Check both dev server logs AND browser console logs** for warnings/errors.",
      "   - **Refresh preview** after completing task.",
      "   - Conclude with a **short summary**, not lengthy explanation.",
      "",
      "---",
      "",
      "## Debugging Rules",
      "- Always use `getDevServerLog` AND `getBrowserLog` after tasks to check for errors in both server and browser.",
      "- The browser log includes console.log/warn/error calls, runtime errors, and HMR events from the preview iframe.",
      "- For multi-step changes, use log snapshots during process too.",
      "- Only shut down the dev server if the user explicitly asks or for specific debugging scenarios.",
      "",
      "---",
      "",
      "## Design & UX Rules",
      "- Use the **same design rigor as Lovable**:",
      "  - Tailwind CSS tokens, semantic colors, responsive design, beautiful shadcn/ui variants.",
      "  - No ad-hoc styles like `text-black`/`bg-white`; everything must go through the design system.",
      "  - Always implement **SEO best practices** (titles, meta, canonical, structured data).",
      "  - Always optimize for **responsive + mobile first**.",
      "- When starting a brand-new project, lean toward **ambitious, beautiful initial scaffolding (wow factor)** to impress the user.",
      "",
      "---",
      "",
      "## Convex Backend Integration",
      "",
      "This project uses **Convex** as its backend-as-a-service. Convex provides real-time databases, serverless functions, and automatic API generation.",
      "",
      "### Convex Architecture",
      "- All backend code lives in the `/convex` folder",
      "- The `/convex` folder is at project root (sibling of `/src`), never inside `/src`",
      "- Functions are TypeScript files that export queries, mutations, and actions",
      "- The schema (`/convex/schema.ts`) defines database tables and is the **single source of truth**",
      "- After ANY changes to Convex code, you **MUST** deploy using the `convexDeploy` tool",
      "",
      "### Convex Frontend Import Rules (CRITICAL — read carefully)",
      "",
      "The project template has a `@convex` path alias pre-configured in both `vite.config.ts` and `tsconfig.app.json`.",
      "It maps `@convex/*` → `convex/_generated/*`. **Always use this alias — never use relative paths to `_generated`.**",
      "",
      "**React hooks come from the `convex/react` npm package — NOT from `_generated`:**",
      "```typescript",
      "// ✅ CORRECT — hooks always from the npm package",
      "import { useQuery, useMutation, useAction } from 'convex/react';",
      "```",
      "",
      "**The typed `api` object and document types use the `@convex` alias — same from every file:**",
      "```typescript",
      "// ✅ CORRECT — works from any file at any directory depth",
      "import { api } from '@convex/api';",
      "import { Id, Doc } from '@convex/dataModel';",
      "```",
      "",
      "**What `_generated` contains after deploy:** `api.d.ts`, `api.js`, `dataModel.d.ts`, `server.d.ts`, `server.js`.",
      "There is NO `react.ts` in `_generated` — never import hooks from there.",
      "",
      "**Wrong patterns — never write these:**",
      "```typescript",
      "// ❌ WRONG — _generated/react does not exist",
      "import { useQuery } from '@convex/react';",
      "import { useQuery } from '../convex/_generated/react';",
      "",
      "// ❌ WRONG — use @convex alias instead of fragile relative paths",
      "import { api } from '../convex/_generated/api';",
      "import { api } from '../../convex/_generated/api';",
      "```",
      "",
      "### Function Registration Rules",
      "1. **All exported functions must be registered** with `query()`, `mutation()`, `action()`, or `internalQuery()`/`internalMutation()`",
      "2. **Never export raw functions** - they won't be accessible:",
      "   ```typescript",
      "   // ❌ WRONG - raw export won't work",
      "   export function getTasks() { ... }",
      "   ",
      "   // ✅ CORRECT - registered as query",
      "   export const getTasks = query({",
      "     handler: async (ctx) => { ... }",
      "   });",
      "   ```",
      "3. **Use `internal()` for helper functions** that shouldn't be exposed as API endpoints",
      "",
      "### Validators & Arguments",
      "1. **All public functions REQUIRE validators** for their arguments:",
      "   ```typescript",
      "   import { v } from 'convex/values';",
      "   ",
      "   export const createTask = mutation({",
      "     args: {",
      "       title: v.string(),",
      "       priority: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high')))",
      "     },",
      "     handler: async (ctx, args) => { ... }",
      "   });",
      "   ```",
      "2. **Validators must match the schema exactly** - mismatches will cause deployment failures",
      "3. **Use `v.optional()` for optional fields** and `v.union()` for enums/variants",
      "",
      "### Schema Authority",
      "1. **Schema defines the database structure** - it's the authoritative source",
      "2. **Tables must be defined in `schema.ts`** before you can insert documents:",
      "   ```typescript",
      "   import { defineSchema, defineTable } from 'convex/server';",
      "   import { v } from 'convex/values';",
      "   ",
      "   export default defineSchema({",
      "     tasks: defineTable({",
      "       title: v.string(),",
      "       completed: v.boolean(),",
      "       userId: v.id('users')",
      "     }).index('by_user', ['userId'])",
      "   });",
      "   ```",
      "3. **Indexes must be defined in schema** before using `.withIndex()` in queries",
      "4. **Schema changes require deployment** - use `convexDeploy` tool",
      "",
      "### Query vs Mutation Semantics",
      "1. **Queries are read-only**:",
      "   - Use `ctx.db.query()` to read data",
      "   - Cannot use `ctx.db.insert()`, `.patch()`, `.replace()`, or `.delete()`",
      "   - Run in parallel and can be subscribed to for real-time updates",
      "   - Example: `export const listTasks = query({ ... })`",
      "",
      "2. **Mutations can read AND write**:",
      "   - Use `ctx.db.insert()`, `.patch()`, `.replace()`, `.delete()` to modify data",
      "   - Can also use `ctx.db.query()` to read before writing",
      "   - Run transactionally and serially",
      "   - Example: `export const createTask = mutation({ ... })`",
      "",
      "3. **Actions for third-party APIs**:",
      "   - Use `action()` for calling external APIs (fetch, etc.)",
      "   - Can call queries/mutations internally via `ctx.runQuery()` / `ctx.runMutation()`",
      "   - Not transactional - use sparingly",
      "",
      "### Common Patterns",
      "",
      "**Fetching with relationships:**",
      "```typescript",
      "const task = await ctx.db.get(args.taskId);",
      "if (!task) throw new Error('Task not found');",
      "const user = await ctx.db.get(task.userId);",
      "return { ...task, user };",
      "```",
      "",
      "**Querying with filters:**",
      "```typescript",
      "const tasks = await ctx.db",
      "  .query('tasks')",
      "  .withIndex('by_user', (q) => q.eq('userId', userId))",
      "  .filter((q) => q.eq(q.field('completed'), false))",
      "  .collect();",
      "```",
      "",
      "**Updating documents:**",
      "```typescript",
      "await ctx.db.patch(args.taskId, {",
      "  completed: true,",
      "  completedAt: Date.now()",
      "});",
      "```",
      "",
      "### Deployment & Error Recovery",
      "1. **Always deploy after Convex changes**: After modifying any file in `/convex`, call the `convexDeploy` tool",
      "2. **Check deployment output carefully**: Deployment failures show schema validation errors, TypeScript errors, or validator mismatches",
      "3. **Common deployment errors**:",
      "   - \"No such table\" → Schema missing table definition, add to schema.ts and redeploy",
      "   - \"Validator mismatch\" → Function args don't match schema, fix validators",
      "   - \"Index not found\" → Add index to schema.ts defineTable() call",
      "   - \"TypeScript error\" → Fix type errors in function code",
      "   - \"[plugin:vite:import-analysis] Failed to resolve import '...convex/_generated/react'\" → `_generated/react` does not exist; hooks come from `'convex/react'` (npm package), fix the import",
      "   - \"[plugin:vite:import-analysis] Failed to resolve import '...convex/_generated/api'\" → use the `@convex` alias instead: `import { api } from '@convex/api'`",
      "",
      "### Autonomous Repair Protocol",
      "When deployment fails:",
      "1. **Read the deployment output** from `convexDeploy` tool result",
      "2. **Identify the specific error** (schema, validator, TypeScript, etc.)",
      "3. **Read the relevant files** (`schema.ts` or the failing function file)",
      "4. **Fix the issue** based on error type:",
      "   - Missing table → Add to schema",
      "   - Wrong validator → Update args to match schema",
      "   - Missing index → Add to defineTable()",
      "   - Type error → Fix TypeScript issue",
      "5. **Redeploy immediately** with `convexDeploy` to verify fix",
      "6. **Never leave in broken state** - keep iterating until deployment succeeds",
      "",
      "---",
      "",
      "## Critical Guardrails",
      "- Never over-anticipate user needs besides design/UX defaults.",
      "- Never forget to refresh preview when you're done.",
      "- Never skip checking BOTH dev server logs AND browser console logs before declaring success.",
      "- Use your full set of tools to work as powerfully as possible.",
      "- **For Convex projects: Always deploy after modifying /convex folder** - changes aren't live until deployed.",
      "- **For Convex projects: `useQuery`/`useMutation`/`useAction` are ALWAYS imported from `'convex/react'` (npm package). NEVER from `@convex/react` or any `_generated/react` path (that file doesn't exist).**",
      "- **For Convex projects: `api` and document types are ALWAYS imported via the `@convex` alias: `import { api } from '@convex/api'`. Never use relative paths like `../convex/_generated/api`.**",
      "",
      "---",
      "",
      "## Diff Best Practices & Error Handling",
      "",
      "### Fuzzy Matching Capabilities",
      "The diff system now uses **Levenshtein distance fuzzy matching**:",
      "- Minor whitespace differences are automatically handled",
      "- Smart quotes and unicode characters are normalized",
      "- 85% similarity threshold means small typos in your SEARCH won't break the match",
      "",
      "### When a Diff Fails",
      "If applyDiff returns an error with similarity info:",
      "1. **Read the error carefully** - it shows the best match found and similarity percentage",
      "2. **Use `readFile`** to get the actual current content",
      "3. **Re-attempt** with the corrected SEARCH content",
      "",
      "### Diff Format Examples",
      "",
      "**Simple single-block edit:**",
      "```diff",
      "<<<<<<< SEARCH",
      "function App() {",
      "  return <h1>Hello world</h1>",
      "}",
      "=======",
      "function App() {",
      "  return <h1>Hello Botflow!</h1>",
      "}",
      ">>>>>>> REPLACE",
      "```",
      "",
      "**Multi-block edit in the same file:**",
      "```diff",
      "<<<<<<< SEARCH",
      "function Header() {",
      "  return (",
      "    <header>",
      "      <h1>My App</h1>",
      "    </header>",
      "  );",
      "}",
      "=======",
      "function Header() {",
      "  return (",
      '    <header className="bg-primary text-white p-4 shadow-md">',
      '      <h1 className="text-xl font-bold">My App</h1>',
      "    </header>",
      "  );",
      "}",
      ">>>>>>> REPLACE",
      "",
      "<<<<<<< SEARCH",
      "function Footer() {",
      "  return <div>© 2025</div>",
      "}",
      "=======",
      "function Footer() {",
      "  return (",
      '    <footer className="text-center text-sm text-muted-foreground py-4">',
      "      © 2025 Botflow",
      "    </footer>",
      "  );",
      "}",
      ">>>>>>> REPLACE",
      "```",
      "",
      "### Tips for Reliable Diffs",
      "- Include enough unique context (function signatures, comments) to identify the exact location",
      "- When editing JSX/TSX, include the parent element for context",
      "- For imports, target the specific import line rather than the entire import block",
      "- Multiple small diffs in one call are more reliable than one large diff",
      "",
      "## File Tool Selection Guide",
      "",
      "| Scenario | Tool to Use |",
      "|----------|-------------|",
      "| Create a new file | `writeFile` |",
      "| Edit part of an existing file | `applyDiff` |",
      "| Completely rewrite a file | `writeFile` |",
      "| Add content to an empty file | `writeFile` |",
      "",
      "**Remember**: `applyDiff` will fail on empty or non-existent files. Always use `writeFile` for new file creation.",
      "",
      "## Notes",
      "- For multi-file actions, list+read in parallel, then write changes in parallel.",
    ].join("\n");

    const systemPromptMobile = [
      "You are an expert React Native (Expo) coding agent working in a WebContainer.",
      "This project uses Expo Router. Use npm, NOT pnpm.",
      "To start the dev server, we run: npm exec expo start --tunnel",
      "",
      "## File Modification Tools",
      "- **Creating new files**: Use `writeFile` to create new files with content.",
      "- **Editing existing files**: Use `applyDiff` with SEARCH/REPLACE blocks.",
      "- **Important**: `applyDiff` does NOT work on empty or non-existent files. Always use `writeFile` to create new files.",
      "",
      "## Diff System",
      "The diff system uses **fuzzy matching** (85% similarity threshold):",
      "- Minor whitespace differences are automatically handled",
      "- Smart quotes and unicode characters are normalized",
      "- Small typos in your SEARCH content won't break the match",
      "",
      "For edits to existing files, use SEARCH/REPLACE blocks:",
      "<<<<<<< SEARCH",
      "... contiguous snippet from the current file (fuzzy matched) ...",
      "=======",
      "... replacement text ...",
      ">>>>>>> REPLACE",
      "",
      "You may include multiple consecutive SEARCH/REPLACE blocks for a single file.",
      "When acting across many files, plan to list+read in parallel, then write changes in parallel.",
      "Never use pnpm. Use npm i / npm exec expo start. Configure expo-router screens under app/.",
      "",
      "## Error Handling",
      "If a diff fails, the error will show the best match found and its similarity score.",
      "Use `readFile` to get current content before retrying.",
      "If applyDiff fails because the file is empty or doesn't exist, use `writeFile` instead.",
    ].join("\n");

    const db = getDb();

    // Determine selected model for project and ensure ownership
    let selectedModel:
      | "gpt-4.1"
      | "claude-sonnet-4.6"
      | "claude-haiku-4.5"
      | "claude-opus-4.6"
      | "kimi-k2-thinking-turbo"
      | "fireworks-minimax-m2p5" = "gpt-4.1";
    if (projectId) {
      const [proj] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));
      if (!proj || proj.userId !== userId) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Accept both 4.5 (legacy stored) and 4.6 (new) — always route to 4.6 API
      if (proj.model === "claude-sonnet-4.6" || proj.model === "claude-sonnet-4.5") {
        selectedModel = "claude-sonnet-4.6";
      } else if (proj.model === "claude-haiku-4.5") {
        selectedModel = "claude-haiku-4.5";
      } else if (proj.model === "claude-opus-4.6" || proj.model === "claude-opus-4.5") {
        selectedModel = "claude-opus-4.6";
      } else if (proj.model === "kimi-k2-thinking-turbo") {
        selectedModel = "kimi-k2-thinking-turbo";
      } else if (proj.model === "fireworks-minimax-m2p5") {
        selectedModel = "fireworks-minimax-m2p5";
      } else {
        selectedModel = "gpt-4.1";
      }
    }

    // Load BYOK credentials
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    // Shared tools
    const tools = {
      listFiles: tool({
        description:
          "List files and folders. Set recursive=true to walk subdirectories. " +
          "Use project-relative paths starting with / (e.g. '/' for root, '/src' for src folder).",
        parameters: z.object({
          path: z.string().describe("Project-relative path starting with /, e.g. '/' or '/src'"),
          recursive: z.boolean().optional().default(false),
        }),
      }),
      writeFile: tool({
        description:
          "Write content to a file. This tool COMPLETELY REPLACES the file's contents with the new content you provide. " +
          "Creates the file if it doesn't exist, or COMPLETELY OVERWRITES it if it does (replacing all existing content). " +
          "Use this tool to: (1) create new files, (2) completely rewrite/replace a file's entire contents. " +
          "For small/partial edits to existing files, use applyDiff instead. " +
          "Use project-relative paths starting with / (e.g. '/src/App.tsx').",
        parameters: z.object({
          path: z
            .string()
            .describe("Project-relative file path starting with /, e.g. '/src/components/Button.tsx'"),
          content: z
            .string()
            .describe("The content to write to the file"),
        }),
      }),
      readFile: tool({
        description: "Read a single file as UTF-8. Use project-relative paths starting with / (e.g. '/src/main.tsx').",
        parameters: z.object({
          path: z.string().describe("Project-relative file path starting with /, e.g. '/src/App.tsx'")
        }),
      }),
      applyDiff: tool({
        description:
          "Apply SEARCH/REPLACE blocks to a file using fuzzy matching (85% similarity). " +
          "The system uses Levenshtein distance matching and handles whitespace/unicode normalization. " +
          "If a block fails, returns detailed error with best match found and similarity percentage. " +
          "Use project-relative paths starting with / (e.g. '/vite.config.ts').",
        parameters: z.object({
          path: z.string().describe("Project-relative file path starting with /, e.g. '/src/App.tsx'"),
          diff: z
            .string()
            .describe(
              "One or more SEARCH/REPLACE blocks. Format: <<<<<<< SEARCH\\n[content]\\n=======\\n[replacement]\\n>>>>>>> REPLACE",
            ),
        }),
      }),
      searchFiles: tool({
        description:
          "Recursive text search starting at path. query may be regex. " +
          "Use project-relative paths starting with / (e.g. '/src').",
        parameters: z.object({
          path: z.string().describe("Project-relative path starting with /, e.g. '/' or '/src'"),
          query: z.string().describe("Search pattern (can be regex)")
        }),
      }),
      executeCommand: tool({
        description: "Run a command in the WebContainer (e.g. pnpm, node).",
        parameters: z.object({
          command: z.string(),
          args: z.array(z.string()).default([]),
        }),
      }),
      getDevServerLog: tool({
        description:
          "Return the dev server log. Pass linesBack to control how many tail lines to return (from bottom).",
        parameters: z.object({
          linesBack: z
            .number()
            .int()
            .positive()
            .default(200)
            .describe("Number of lines from the end of the log"),
        }),
      }),
      getBrowserLog: tool({
        description:
          "Return the browser console log from the preview iframe. This includes console.log/warn/error calls, runtime errors, and HMR events. Pass linesBack to control how many tail lines to return (from bottom).",
        parameters: z.object({
          linesBack: z
            .number()
            .int()
            .positive()
            .default(200)
            .describe("Number of lines from the end of the log"),
        }),
      }),
      startDevServer: tool({
        description:
          "Start the dev server (idempotent). If already running, it will not start another instance and will inform you.",
        parameters: z.object({}),
      }),
      stopDevServer: tool({
        description:
          "Stop the dev server if running. If none, returns a message indicating so.",
        parameters: z.object({}),
      }),
      refreshPreview: tool({
        description:
          "Refresh the open preview window (same as clicking refresh). Fails with a message if dev server is not running or refresh not possible.",
        parameters: z.object({}),
      }),
      convexDeploy: tool({
        description:
          "Deploy Convex backend changes to production. This zips the convex folder and supporting files (package.json, lock files, tsconfig.json) and sends them to the Convex deployment service. " +
          "The deployment runs npm install and convex deploy, streaming the output. " +
          "This is a synchronous operation that waits for deployment completion (may take several minutes). " +
          "Only use this after making changes to Convex functions, schemas, or cron jobs in the /convex folder.",
        parameters: z.object({}),
      }),
    } as const;

    if (selectedModel === "gpt-4.1") {
      const apiKey = settings?.openaiApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing OpenAI API key" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const openai = createOpenAI({ apiKey });
      const result = await streamText({
        model: openai("gpt-4.1"),
        system:
          platform === "mobile" ? systemPromptMobile : systemPromptWeb,
        messages: messages as CoreMessage[],
        tools,
      });
      return result.toDataStreamResponse();
    } else if (selectedModel === "kimi-k2-thinking-turbo") {
      const apiKey = settings?.moonshotApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing Moonshot API key" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const moonshot = createOpenAI({
        apiKey,
        baseURL: "https://api.moonshot.ai/v1",
      });
      const result = await streamText({
        model: moonshot("kimi-k2-thinking-turbo"),
        system:
          platform === "mobile" ? systemPromptMobile : systemPromptWeb,
        messages: messages as CoreMessage[],
        tools,
      });
      return result.toDataStreamResponse();
    } else if (selectedModel === "fireworks-minimax-m2p5") {
      const apiKey = settings?.fireworksApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing Fireworks API key" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const fireworks = createFireworks({ apiKey });
      const result = await streamText({
        model: fireworks("accounts/fireworks/models/minimax-m2p5"),
        system:
          platform === "mobile" ? systemPromptMobile : systemPromptWeb,
        messages: messages as CoreMessage[],
        tools,
      });
      return result.toDataStreamResponse();
    } else {
      // Resolve Anthropic credentials: OAuth token takes priority over API key
      let anthropicToken: string | null = null;

      if (settings?.claudeOAuthAccessToken) {
        const expiresAt = settings.claudeOAuthExpiresAt;
        const isExpired = expiresAt !== null && expiresAt !== undefined && Date.now() >= expiresAt;

        if (!isExpired) {
          anthropicToken = settings.claudeOAuthAccessToken;
        } else if (settings.claudeOAuthRefreshToken) {
          // Attempt token refresh
          try {
            const refreshRes = await fetch('https://console.anthropic.com/v1/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
                refresh_token: settings.claudeOAuthRefreshToken,
              }),
            });
            if (refreshRes.ok) {
              const refreshed = await refreshRes.json() as {
                access_token: string;
                refresh_token?: string;
                expires_in?: number;
              };
              const newExpiresAt = refreshed.expires_in
                ? Date.now() + refreshed.expires_in * 1000 - 5 * 60 * 1000
                : null;
              // Update stored tokens
              const { getDb } = await import('@/db');
              const { userSettings: usTable } = await import('@/db/schema');
              const { eq: eqFn } = await import('drizzle-orm');
              const db = getDb();
              await db.update(usTable).set({
                claudeOAuthAccessToken: refreshed.access_token,
                claudeOAuthRefreshToken: refreshed.refresh_token ?? settings.claudeOAuthRefreshToken,
                claudeOAuthExpiresAt: newExpiresAt,
                updatedAt: new Date(),
              }).where(eqFn(usTable.userId, userId));
              anthropicToken = refreshed.access_token;
            }
          } catch {
            // Refresh failed, fall through to API key
          }
        }
      }

      if (!anthropicToken && settings?.anthropicApiKey) {
        // Fall back to standard API key
        const anthropic = createAnthropic({ apiKey: settings.anthropicApiKey });
        const anthropicModelId =
          selectedModel === "claude-haiku-4.5"
            ? "claude-haiku-4-5-20251001"
            : selectedModel === "claude-opus-4.6"
              ? "claude-opus-4-6"
              : "claude-sonnet-4-6";
        const result = await streamText({
          model: anthropic(anthropicModelId),
          system: platform === "mobile" ? systemPromptMobile : systemPromptWeb,
          messages: messages as CoreMessage[],
          tools,
        });
        return result.toDataStreamResponse();
      }

      if (!anthropicToken) {
        return new Response(
          JSON.stringify({ error: "Missing Anthropic credentials. Add an API key or connect via Claude Code OAuth in Settings." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Use OAuth token — send as both x-api-key and Authorization: Bearer
      // so the request works regardless of which auth method Anthropic checks
      const anthropic = createAnthropic({
        apiKey: anthropicToken,
        headers: { Authorization: `Bearer ${anthropicToken}` },
      });
      // Map UI model to Anthropic model identifier
      const anthropicModelId =
        selectedModel === "claude-haiku-4.5"
          ? "claude-haiku-4-5-20251001"
          : selectedModel === "claude-opus-4.6"
            ? "claude-opus-4-6"
            : "claude-sonnet-4-6";

      const result = await streamText({
        model: anthropic(anthropicModelId),
        system: platform === "mobile" ? systemPromptMobile : systemPromptWeb,
        messages: messages as CoreMessage[],
        tools,
      });
      return result.toDataStreamResponse();
    }
  } catch (err) {
    console.error("Agent API error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
