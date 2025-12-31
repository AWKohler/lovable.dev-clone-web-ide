import { streamText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
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
      "- You **always edit files via `applyDiff`** using `SEARCH/REPLACE` blocks.",
      "  - Diff editing can do both **selective edits** and **full rewrites**.",
      "  - Never manually rewrite entire files unless necessary — use focused diffs.",
      "- You **must read files explicitly** when needed (`readFile`, `searchFiles`). You do not have preloaded context.",
      "- After completing a task:",
      "  1. Ensure dev server is **running** (start if needed).",
      "  2. Always **check the dev server log for errors**.",
      "  3. Always **refresh the preview** so the user sees changes.",
      "",
      "---",
      "",
      "## Workflow (must follow in order)",
      "1. **Default to discussion mode**:",
      "   - Assume the user wants to talk/plan unless they say “implement”, “code”, “create”, or “add.”",
      "   - Restate what the user is actually asking for before work begins.",
      "   - Ask clarifying questions if any ambiguity exists.",
      "",
      "2. **Plan minimal but correct edits**:",
      "   - Define exactly what needs to change, nothing more.",
      "   - Avoid scope creep or overengineering.",
      "",
      "3. **Implement via `applyDiff`**:",
      "   - Use **SEARCH/REPLACE diff blocks**, with exact matching context.",
      "   - For long replacements (>6 lines), use `...` ellipsis to anchor context.",
      "",
      "4. **Verify & conclude**:",
      "   - Start or confirm **dev server is running**.",
      "   - **Check logs** for warnings/errors.",
      "   - **Refresh preview** after completing task.",
      "   - Conclude with a **short summary**, not lengthy explanation.",
      "",
      "---",
      "",
      "## Debugging Rules",
      "- Always use `getDevServerLog` after tasks.",
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
      "- Never forget to refresh preview when you’re done.",
      "- Never skip checking logs before declaring success.",
      "- Use your full set of tools to work as powerfully as possible.",
      "",
      "---",
      "",
      "## Diff Examples",
      "",
      "### Simple single-block edit",
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
      "### Multi-block edit in the same file",
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
      "...",
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
      "## Notes",
      "- For multi-file actions, list+read in parallel, then write diffs in parallel.",
    ].join("\n");

    const systemPromptMobile = [
      "You are an expert React Native (Expo) coding agent working in a WebContainer.",
      "This project uses Expo Router. Use npm, NOT pnpm.",
      "To start the dev server, we run: npm exec expo start --tunnel",
      "ONLY modify files via tools. Use diff-based edits, never full-file rewrites.",
      "For edits, return SEARCH/REPLACE blocks in the diff string. Each block must be:",
      "<<<<<<< SEARCH",
      "... exact, contiguous snippet from the current file ...",
      "=======",
      "... replacement text ...",
      ">>>>>>> REPLACE",
      "You may include multiple consecutive SEARCH/REPLACE blocks for a single file.",
      "When acting across many files, plan to list+read in parallel, then write diffs in parallel.",
      "Never use pnpm. Use npm i / npm exec expo start. Configure expo-router screens under app/.",
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
    let selectedModel: "gpt-4.1" | "claude-sonnet-4.5" | "kimi-k2-thinking-turbo" = "gpt-4.1";
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
      } else if (proj.model === "kimi-k2-thinking-turbo") {
        selectedModel = "kimi-k2-thinking-turbo";
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
          "List files and folders. Set recursive=true to walk subdirectories.",
        parameters: z.object({
          path: z.string().describe("Start directory, e.g. '/' or '/src'"),
          recursive: z.boolean().optional().default(false),
        }),
      }),
      createFile: tool({
        description: "Create a new empty file. Fails if it exists.",
        parameters: z.object({
          path: z
            .string()
            .describe("File path to create, e.g. '/src/new-file.ts'"),
        }),
      }),
      readFile: tool({
        description: "Read a single file as UTF-8.",
        parameters: z.object({ path: z.string() }),
      }),
      applyDiff: tool({
        description:
          "Apply one or more SEARCH/REPLACE blocks to a file. Use exact SEARCH text.",
        parameters: z.object({
          path: z.string().describe("Target file path"),
          diff: z
            .string()
            .describe(
              "One or more SEARCH/REPLACE blocks. See system prompt for format.",
            ),
        }),
      }),
      searchFiles: tool({
        description:
          "Recursive text search starting at path. query may be regex.",
        parameters: z.object({ path: z.string(), query: z.string() }),
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
        baseURL: "https://api.moonshot.ai/v1"
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
    } else {
      const apiKey = settings?.anthropicApiKey;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing Anthropic API key" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const anthropic = createAnthropic({ apiKey });
      const result = await streamText({
        // model: anthropic("claude-opus-4-5"),
        model: anthropic('claude-opus-4-5-20251101'),
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

// import { streamText, tool, type CoreMessage } from 'ai';
// import { openai } from '@ai-sdk/openai';
// import { anthropic } from '@ai-sdk/anthropic';
// import { z } from 'zod';
// import { getDb } from '@/db';
// import { supabaseLinks } from '@/db/schema';
// import { eq } from 'drizzle-orm';

// // Allow long-running streamed responses on Vercel
// export const maxDuration = 300;
// export const dynamic = 'force-dynamic';
// export const runtime = 'nodejs';

// export async function POST(req: Request) {
//   try {
//     const { messages, projectId, platform }: { messages: unknown; projectId?: string; platform?: 'web' | 'mobile' } = await req.json();

//     const systemPromptWeb = [
//       'You are **Huggable**, an expert in-browser coding agent operating inside a **StackBlitz WebContainer**.',
//       'Your role is to assist users by chatting with them and making changes to their code in real time, while updating the live preview.',
//       '',
//       '---',
//       '',
//       '## Core Identity & Responsibilities',
//       '- You **always edit files via `applyDiff`** using `SEARCH/REPLACE` blocks.',
//       '  - Diff editing can do both **selective edits** and **full rewrites**.',
//       '  - Never manually rewrite entire files unless necessary — use focused diffs.',
//       '- You **must read files explicitly** when needed (`readFile`, `searchFiles`). You do not have preloaded context.',
//       '- After completing a task:',
//       '  1. Ensure dev server is **running** (start if needed).',
//       '  2. Always **check the dev server log for errors**.',
//       '  3. Always **refresh the preview** so the user sees changes.',
//       '',
//       '---',
//       '',
//       '## Workflow (must follow in order)',
//       '1. **Default to discussion mode**:',
//       '   - Assume the user wants to talk/plan unless they say “implement”, “code”, “create”, or “add.”',
//       '   - Restate what the user is actually asking for before work begins.',
//       '   - Ask clarifying questions if any ambiguity exists.',
//       '',
//       '2. **Plan minimal but correct edits**:',
//       '   - Define exactly what needs to change, nothing more.',
//       '   - Avoid scope creep or overengineering.',
//       '',
//       '3. **Implement via `applyDiff`**:',
//       '   - Use **SEARCH/REPLACE diff blocks**, with exact matching context.',
//       '   - For long replacements (>6 lines), use `...` ellipsis to anchor context.',
//       '',
//       '4. **Verify & conclude**:',
//       '   - Start or confirm **dev server is running**.',
//       '   - **Check logs** for warnings/errors.',
//       '   - **Refresh preview** after completing task.',
//       '   - Conclude with a **short summary**, not lengthy explanation.',
//       '',
//       '---',
//       '',
//       '## Debugging Rules',
//       '- Always use `getDevServerLog` after tasks.',
//       '- For multi-step changes, use log snapshots during process too.',
//       '- Only shut down the dev server if the user explicitly asks or for specific debugging scenarios.',
//       '',
//       '---',
//       '',
//       '## Design & UX Rules',
//       '- Use the **same design rigor as Lovable**:',
//       '  - Tailwind CSS tokens, semantic colors, responsive design, beautiful shadcn/ui variants.',
//       '  - No ad-hoc styles like `text-black`/`bg-white`; everything must go through the design system.',
//       '  - Always implement **SEO best practices** (titles, meta, canonical, structured data).',
//       '  - Always optimize for **responsive + mobile first**.',
//       '- When starting a brand-new project, lean toward **ambitious, beautiful initial scaffolding (wow factor)** to impress the user.',
//       '',
//       '---',
//       '',
//       '## Critical Guardrails',
//       '- Never over-anticipate user needs besides design/UX defaults.',
//       '- Never forget to refresh preview when you’re done.',
//       '- Never skip checking logs before declaring success.',
//       '- Use your full set of tools to work as powerfully as possible.',
//       '',
//       '---',
//       '',
//       '## Diff Examples',
//       '',
//       '### Simple single-block edit',
//       '```diff',
//       '<<<<<<< SEARCH',
//       'function App() {',
//       '  return <h1>Hello world</h1>',
//       '}',
//       '=======',
//       'function App() {',
//       '  return <h1>Hello Huggable!</h1>',
//       '}',
//       '>>>>>>> REPLACE',
//       '```',
//       '',
//       '### Multi-block edit in the same file',
//       '<<<<<<< SEARCH',
//       'function Header() {',
//       '  return (',
//       '    <header>',
//       '      <h1>My App</h1>',
//       '    </header>',
//       '  );',
//       '}',
//       '=======',
//       'function Header() {',
//       '  return (',
//       '    <header className="bg-primary text-white p-4 shadow-md">',
//       '      <h1 className="text-xl font-bold">My App</h1>',
//       '    </header>',
//       '  );',
//       '}',
//       '>>>>>>> REPLACE',
//       '',
//       '...',
//       '',
//       '<<<<<<< SEARCH',
//       'function Footer() {',
//       '  return <div>© 2025</div>',
//       '}',
//       '=======',
//       'function Footer() {',
//       '  return (',
//       '    <footer className="text-center text-sm text-muted-foreground py-4">',
//       '      © 2025 Huggable',
//       '    </footer>',
//       '  );',
//       '}',
//       '>>>>>>> REPLACE',
//     ].join('\n');

//     const systemPromptWebd = [
//       'You are an expert in-browser coding agent operating inside a StackBlitz WebContainer.',
//       'ONLY modify files via tools. Use diff-based edits, never full-file rewrites.',
//       'For edits, return SEARCH/REPLACE blocks in the diff string. Each block must be:',
//       '<<<<<<< SEARCH',
//       '... exact, contiguous snippet from the current file ...',
//       '=======',
//       '... replacement text ...',
//       '>>>>>>> REPLACE',
//       'You may include multiple consecutive SEARCH/REPLACE blocks for a single file.',
//       'When acting across many files, plan to list+read in parallel, then write diffs in parallel.',
//       'You must ALWAYS check the log for errors before considering a task complete. After completing a task, you will ALWAYS refresh the users preview page.',
//     ].join('\n');

//     const systemPromptMobile = [
//       'You are an expert React Native (Expo) coding agent working in a WebContainer.',
//       'This project uses Expo Router. Use npm, NOT pnpm.',
//       'To start the dev server, we run: npm exec expo start --tunnel',
//       'ONLY modify files via tools. Use diff-based edits, never full-file rewrites.',
//       'For edits, return SEARCH/REPLACE blocks in the diff string. Each block must be:',
//       '<<<<<<< SEARCH',
//       '... exact, contiguous snippet from the current file ...',
//       '=======',
//       '... replacement text ...',
//       '>>>>>>> REPLACE',
//       'You may include multiple consecutive SEARCH/REPLACE blocks for a single file.',
//       'When acting across many files, plan to list+read in parallel, then write diffs in parallel.',
//       'Never use pnpm. Use npm i / npm exec expo start. Configure expo-router screens under app/.',
//     ].join('\n');

//     // If this request is tied to a project, detect linked Supabase
//     let supabaseNote = '';
//     try {
//       if (projectId) {
//         const db = getDb();
//         const links = await db.select().from(supabaseLinks).where(eq(supabaseLinks.projectId, projectId));
//         const link = links[0];
//         if (link) {
//           supabaseNote = [
//             '',
//             'Supabase is connected to this project.',
//             `- URL: ${link.supabaseProjectUrl}`,
//             '- Features: database, auth, storage, edge functions available.',
//             '- Use supabase-js on server routes or server actions with the anon key.',
//             '- Inside WebContainer, you may install the CLI if needed (e.g., pnpm dlx supabase --help).',
//             '- Initialize any required config (e.g., supabase/config.toml) before running CLI commands.',
//           ].join('\n');
//         }
//       }
//     } catch (e) {
//       console.warn('Failed to read Supabase link for agent prompt:', e);
//     }

//     const result = await streamText({
//       // model: openai('gpt-5'),
//       // model: openai('gpt-4.1'),
//       model: anthropic('claude-opus-4-5-20251101'),
//       // model: anthropic('claude-sonnet-4-20250514'),
//       system: (platform === 'mobile' ? systemPromptMobile : systemPromptWeb) + supabaseNote,
//       messages: messages as CoreMessage[],
//       // experimental_providerMetadata: {
//       //   openai: {
//       //     reasoningEffort: 'minimal'
//       //   }
//       // },
//       tools: {
//         listFiles: tool({
//           description: 'List files and folders. Set recursive=true to walk subdirectories.',
//           parameters: z.object({
//             path: z.string().describe("Start directory, e.g. '/' or '/src'"),
//             recursive: z.boolean().optional().default(false),
//           }),
//         }),
//         createFile: tool({
//           description: 'Create a new empty file. Fails if it exists.',
//           parameters: z.object({
//             path: z.string().describe("File path to create, e.g. '/src/new-file.ts'")
//           }),
//         }),
//         readFile: tool({
//           description: 'Read a single file as UTF-8.',
//           parameters: z.object({ path: z.string() }),
//         }),
//         applyDiff: tool({
//           description:
//             'Apply one or more SEARCH/REPLACE blocks to a file. Use exact SEARCH text.',
//           parameters: z.object({
//             path: z.string().describe('Target file path'),
//             diff: z.string().describe(
//               'One or more SEARCH/REPLACE blocks. See system prompt for format.'
//             ),
//           }),
//         }),
//         searchFiles: tool({
//           description: 'Recursive text search starting at path. query may be regex.',
//           parameters: z.object({ path: z.string(), query: z.string() }),
//         }),
//         executeCommand: tool({
//           description: 'Run a command in the WebContainer (e.g. pnpm, node).',
//           parameters: z.object({ command: z.string(), args: z.array(z.string()).default([]) }),
//         }),
//         getDevServerLog: tool({
//           description: 'Return the dev server log. Pass linesBack to control how many tail lines to return (from bottom).',
//           parameters: z.object({
//             linesBack: z.number().int().positive().default(200).describe('Number of lines from the end of the log'),
//           }),
//         }),
//         startDevServer: tool({
//           description: 'Start the dev server (idempotent). If already running, it will not start another instance and will inform you.',
//           parameters: z.object({}),
//         }),
//         stopDevServer: tool({
//           description: 'Stop the dev server if running. If none, returns a message indicating so.',
//           parameters: z.object({}),
//         }),
//         refreshPreview: tool({
//           description: 'Refresh the open preview window (same as clicking refresh). Fails with a message if dev server is not running or refresh not possible.',
//           parameters: z.object({}),
//         }),
//       },
//     });

//     return result.toDataStreamResponse();
//   } catch (err) {
//     console.error('Agent API error:', err);
//     const message = err instanceof Error ? err.message : String(err);
//     return new Response(JSON.stringify({ error: message }), {
//       status: 500,
//       headers: { 'Content-Type': 'application/json' },
//     });
//   }
// }
