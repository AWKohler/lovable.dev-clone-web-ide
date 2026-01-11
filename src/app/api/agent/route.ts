import { streamText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createFireworks } from "@ai-sdk/fireworks";
import { z } from "zod";
import { getDb } from "@/db";
import { projects, supabaseLinks, userSettings } from "@/db/schema";
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
      "You are **Huggable**, an expert in-browser coding agent operating inside a **StackBlitz WebContainer**.",
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
      "## Critical Guardrails",
      "- Never over-anticipate user needs besides design/UX defaults.",
      "- Never forget to refresh preview when you're done.",
      "- Never skip checking BOTH dev server logs AND browser console logs before declaring success.",
      "- Use your full set of tools to work as powerfully as possible.",
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
      "  return <h1>Hello Huggable!</h1>",
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
      "      © 2025 Huggable",
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

    // If this request is tied to a project, detect linked Supabase
    const db = getDb();
    let supabaseNote = "";
    try {
      if (projectId) {
        const links = await db
          .select()
          .from(supabaseLinks)
          .where(eq(supabaseLinks.projectId, projectId));
        const link = links[0];
        if (link) {
          supabaseNote = [
            "",
            "Supabase is connected to this project.",
            `- URL: ${link.supabaseProjectUrl}`,
            "- Features: database, auth, storage, edge functions available.",
            "- Use supabase-js on server routes or server actions with the anon key.",
            "- Inside WebContainer, you may install the CLI if needed (e.g., pnpm dlx supabase --help).",
            "- Initialize any required config (e.g., supabase/config.toml) before running CLI commands.",
          ].join("\n");
        }
      }
    } catch (e) {
      console.warn("Failed to read Supabase link for agent prompt:", e);
    }

    // Determine selected model for project and ensure ownership
    let selectedModel:
      | "gpt-4.1"
      | "claude-sonnet-4.5"
      | "claude-haiku-4.5"
      | "claude-opus-4.5"
      | "kimi-k2-thinking-turbo"
      | "fireworks-minimax-m2p1" = "gpt-4.1";
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
      if (proj.model === "claude-sonnet-4.5") {
        selectedModel = "claude-sonnet-4.5";
      } else if (proj.model === "claude-haiku-4.5") {
        selectedModel = "claude-haiku-4.5";
      } else if (proj.model === "claude-opus-4.5") {
        selectedModel = "claude-opus-4.5";
      } else if (proj.model === "kimi-k2-thinking-turbo") {
        selectedModel = "kimi-k2-thinking-turbo";
      } else if (proj.model === "fireworks-minimax-m2p1") {
        selectedModel = "fireworks-minimax-m2p1";
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
          "Write content to a file. Creates the file if it doesn't exist, or overwrites it if it does. " +
          "Use this tool to create new files with content, or to completely replace file contents. " +
          "For partial edits to existing files, prefer applyDiff instead. " +
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
          (platform === "mobile" ? systemPromptMobile : systemPromptWeb) +
          supabaseNote,
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
          (platform === "mobile" ? systemPromptMobile : systemPromptWeb) +
          supabaseNote,
        messages: messages as CoreMessage[],
        tools,
      });
      return result.toDataStreamResponse();
    } else if (selectedModel === "fireworks-minimax-m2p1") {
      const apiKey = settings?.fireworksApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing Fireworks API key" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const fireworks = createFireworks({ apiKey });
      const result = await streamText({
        model: fireworks("accounts/fireworks/models/minimax-m2p1"),
        system:
          (platform === "mobile" ? systemPromptMobile : systemPromptWeb) +
          supabaseNote,
        messages: messages as CoreMessage[],
        tools,
      });
      return result.toDataStreamResponse();
    } else {
      const apiKey = settings?.anthropicApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing Anthropic API key" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const anthropic = createAnthropic({ apiKey });
      // Map UI model to Anthropic model identifier
      const anthropicModelId =
        selectedModel === "claude-haiku-4.5"
          ? "claude-haiku-4-5-20251001"
          : selectedModel === "claude-opus-4.5"
            ? "claude-opus-4-5-20251101"
            : "claude-sonnet-4-5-20250929";

      const result = await streamText({
        model: anthropic(anthropicModelId),
        system:
          (platform === "mobile" ? systemPromptMobile : systemPromptWeb) +
          supabaseNote,
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
