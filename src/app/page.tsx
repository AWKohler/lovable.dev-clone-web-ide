'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { ArrowUp, Heart, Plus, Smartphone, Laptop } from 'lucide-react';
import { SupabasePicker } from '@/components/supabase/SupabasePicker';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [platform, setPlatform] = useState<'web' | 'mobile'>('web');
  const [supabaseRef, setSupabaseRef] = useState<string | null>(null);

  const canSend = useMemo(() => prompt.trim().length > 0, [prompt]);

  const start = (authed: boolean) => {
    const params = new URLSearchParams();
    if (prompt.trim()) params.set('prompt', prompt.trim());
    params.set('visibility', 'public');
    params.set('platform', platform);
    if (supabaseRef) params.set('supabaseRef', supabaseRef);
    const target = `/start?${params.toString()}`;
    if (authed) {
      router.push(target);
    } else {
      const redirect = encodeURIComponent(target);
      router.push(`/sign-in?redirect_url=${redirect}`);
    }
  };

  return (
    <div className="antialiased text-neutral-900 bg-white min-h-screen">
      {/* Background gradients */}
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-1/3 -left-1/4 h-[80vh] w-[80vw] rounded-full bg-gradient-to-br from-indigo-300 via-sky-200 to-white blur-3xl opacity-80"></div>
          <div className="absolute top-1/3 left-1/2 h-[90vh] w-[80vw] -translate-x-1/2 rounded-full bg-gradient-to-tr from-purple-300 via-blue-200 to-rose-200 blur-3xl opacity-80"></div>
          <div className="absolute bottom-[-20%] left-1/2 h-[70vh] w-[90vw] -translate-x-1/2 rounded-full bg-gradient-to-tr from-orange-400 via-rose-300 to-transparent blur-3xl opacity-70"></div>
        </div>

        {/* Nav */}
        <header className="relative">
          <div className="mx-auto max-w-7xl px-6 py-5">
            <div className="flex items-center justify-between">
              <a className="flex items-center gap-2" href="#">
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-400 via-orange-400 to-violet-500 shadow-sm">
                  <Heart className="h-4 w-4 text-white" />
                </span>
                <span className="text-xl font-semibold tracking-tight">Huggable</span>
              </a>

              <nav className="hidden md:flex items-center gap-7 text-sm text-neutral-700">
                <a className="hover:text-black transition" href="#">Community</a>
                <a className="hover:text-black transition" href="#">Pricing</a>
                <a className="hover:text-black transition" href="#">Enterprise</a>
                <a className="hover:text-black transition" href="#">Learn</a>
                <a className="hover:text-black transition" href="#">Launched</a>
              </nav>

              <div className="flex items-center gap-2">
                <SignedOut>
                  <SignInButton>
                    <button className="hidden sm:inline-flex items-center rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 transition">
                      Log in
                    </button>
                  </SignInButton>
                  <button
                    onClick={() => start(false)}
                    className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_20px_-8px_rgba(0,0,0,0.5)] hover:opacity-95 transition"
                  >
                    Get started
                  </button>
                </SignedOut>
                <SignedIn>
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </div>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative">
          <div className="mx-auto max-w-4xl px-6 pt-10 pb-24 sm:pt-16">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-neutral-900 text-center">
              Build something
              <span className="inline-flex translate-y-1 align-middle">
                <span className="mx-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-400 via-orange-400 to-violet-500 shadow">
                  <Heart className="h-4 w-4 text-white" />
                </span>
              </span>
              {/* Huggable */}
            </h1>
            <p className="mt-4 text-center text-neutral-600 text-base sm:text-lg">
              Create apps and websites by chatting with AI
            </p>

            {/* Prompt box */}
            <div className="mx-auto mt-10 sm:mt-12">
              <div className="relative rounded-3xl border border-black/10 bg-neutral-50/70 backdrop-blur-sm shadow-[0_2px_0_rgba(0,0,0,0.02),0_20px_60px_-20px_rgba(0,0,0,0.2)]">
                <textarea
                  placeholder="Ask Huggable to create a web app that..."
                  className="w-full rounded-3xl bg-transparent px-5 py-4 pr-24 text-base text-neutral-800 placeholder-neutral-400 outline-none sm:text-lg resize-none"
                  aria-label="Generation prompt"
                  style={{ height: 140 }}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />

                {/* Bottom-left controls */}
                <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 sm:bottom-4 sm:left-4">
                  <div className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white shadow hover:bg-neutral-50 transition">
                    <Plus className="h-4 w-4 text-neutral-700" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlatform(platform === 'web' ? 'mobile' : 'web')}
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-neutral-50 transition"
                    title="Toggle platform"
                  >
                    {platform === 'web' ? (
                      <Laptop className="h-4 w-4" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
                    <span>{platform === 'web' ? 'Web' : 'Mobile App'}</span>
                  </button>
                  {/* Supabase connect picker */}
                  <div className="pointer-events-auto">
                    <SupabasePicker onSelected={(ref) => setSupabaseRef(ref)} />
                  </div>
                </div>

                {/* Send button */}
                <SignedIn>
                  <button
                    onClick={() => start(true)}
                    disabled={!canSend}
                    className={cn(
                      'absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition sm:bottom-4 sm:right-4',
                      !canSend ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                    )}
                  >
                    <ArrowUp className="h-5 w-5" />
                  </button>
                </SignedIn>
                <SignedOut>
                  <button
                    onClick={() => start(false)}
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md hover:opacity-90 transition sm:bottom-4 sm:right-4"
                  >
                    <ArrowUp className="h-5 w-5" />
                  </button>
                </SignedOut>
              </div>
            </div>
          </div>
        </section>

        {/* Community Section (placeholder) */}
        <section className="relative">
          <div className="mx-auto max-w-7xl px-6">
            <div className="rounded-3xl border border-black/10 bg-white shadow-sm">
              <div className="px-6 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">From the Community</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 transition">
                      Popular
                    </button>
                    <button className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">Discover</button>
                    <button className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">Internal Tools</button>
                    <button className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">Website</button>
                    <button className="hidden sm:inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">Personal</button>
                    <button className="hidden sm:inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">Consumer App</button>
                    <button className="hidden md:inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">B2B App</button>
                    <a href="#" className="ml-1 inline-flex items-center text-sm font-medium text-neutral-700 hover:text-black">View All</a>
                  </div>
                </div>
                <div className="mt-6 text-neutral-600 text-sm">No public projects yet.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative">
          <div className="mx-auto max-w-7xl px-6 py-12 text-sm text-neutral-600">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <p>© 2025 Huggable</p>
              <div className="flex items-center gap-6">
                <a className="hover:text-neutral-900" href="#">Privacy</a>
                <a className="hover:text-neutral-900" href="#">Terms</a>
                <a className="hover:text-neutral-900" href="#">Contact</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
