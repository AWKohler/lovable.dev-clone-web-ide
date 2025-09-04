import { streamText, tool, type CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getDb } from '@/db';
import { supabaseLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Allow long-running streamed responses on Vercel
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { messages, projectId, platform }: { messages: unknown; projectId?: string; platform?: 'web' | 'mobile' } = await req.json();

    const systemPromptWeb = [
      'You are an expert in-browser coding agent operating inside a StackBlitz WebContainer.',
      'ONLY modify files via tools. Use diff-based edits, never full-file rewrites.',
      'For edits, return SEARCH/REPLACE blocks in the diff string. Each block must be:',
      '<<<<<<< SEARCH',
      '... exact, contiguous snippet from the current file ...',
      '=======',
      '... replacement text ...',
      '>>>>>>> REPLACE',
      'You may include multiple consecutive SEARCH/REPLACE blocks for a single file.',
      'When acting across many files, plan to list+read in parallel, then write diffs in parallel.',
    ].join('\n');

    const systemPromptMobile = [
      'You are an expert React Native (Expo) coding agent working in a WebContainer.',
      'This project uses Expo Router. Use npm, NOT pnpm.',
      'To start the dev server, we run: npm exec expo start --tunnel',
      'ONLY modify files via tools. Use diff-based edits, never full-file rewrites.',
      'For edits, return SEARCH/REPLACE blocks in the diff string. Each block must be:',
      '<<<<<<< SEARCH',
      '... exact, contiguous snippet from the current file ...',
      '=======',
      '... replacement text ...',
      '>>>>>>> REPLACE',
      'You may include multiple consecutive SEARCH/REPLACE blocks for a single file.',
      'When acting across many files, plan to list+read in parallel, then write diffs in parallel.',
      'Never use pnpm. Use npm i / npm exec expo start. Configure expo-router screens under app/.',
    ].join('\n');

    // If this request is tied to a project, detect linked Supabase
    let supabaseNote = '';
    try {
      if (projectId) {
        const db = getDb();
        const links = await db.select().from(supabaseLinks).where(eq(supabaseLinks.projectId, projectId));
        const link = links[0];
        if (link) {
          supabaseNote = [
            '',
            'Supabase is connected to this project.',
            `- URL: ${link.supabaseProjectUrl}`,
            '- Features: database, auth, storage, edge functions available.',
            '- Use supabase-js on server routes or server actions with the anon key.',
            '- Inside WebContainer, you may install the CLI if needed (e.g., pnpm dlx supabase --help).',
            '- Initialize any required config (e.g., supabase/config.toml) before running CLI commands.',
          ].join('\n');
        }
      }
    } catch (e) {
      console.warn('Failed to read Supabase link for agent prompt:', e);
    }

    const result = await streamText({
      model: openai('gpt-4.1'),
      system: (platform === 'mobile' ? systemPromptMobile : systemPromptWeb) + supabaseNote,
      messages: messages as CoreMessage[],
      tools: {
        listFiles: tool({
          description: 'List files and folders. Set recursive=true to walk subdirectories.',
          parameters: z.object({
            path: z.string().describe("Start directory, e.g. '/' or '/src'"),
            recursive: z.boolean().optional().default(false),
          }),
        }),
        readFile: tool({
          description: 'Read a single file as UTF-8.',
          parameters: z.object({ path: z.string() }),
        }),
        applyDiff: tool({
          description:
            'Apply one or more SEARCH/REPLACE blocks to a file. Use exact SEARCH text.',
          parameters: z.object({
            path: z.string().describe('Target file path'),
            diff: z.string().describe(
              'One or more SEARCH/REPLACE blocks. See system prompt for format.'
            ),
          }),
        }),
        searchFiles: tool({
          description: 'Recursive text search starting at path. query may be regex.',
          parameters: z.object({ path: z.string(), query: z.string() }),
        }),
        executeCommand: tool({
          description: 'Run a command in the WebContainer (e.g. pnpm, node).',
          parameters: z.object({ command: z.string(), args: z.array(z.string()).default([]) }),
        }),
      },
    });

    return result.toDataStreamResponse();
  } catch (err) {
    console.error('Agent API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
