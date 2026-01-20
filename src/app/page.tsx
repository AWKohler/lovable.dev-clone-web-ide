"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { ArrowUp, Heart, Plus, Smartphone, Laptop, Cog } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function Home() {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState<"web" | "mobile">("web");
  const [model, setModel] = useState<
    | "gpt-4.1"
    | "claude-sonnet-4.5"
    | "claude-haiku-4.5"
    | "claude-opus-4.5"
    | "kimi-k2-thinking-turbo"
    | "fireworks-minimax-m2p1"
  >("gpt-4.1");
  const { toast } = useToast();
  const [hasOpenAIKey, setHasOpenAIKey] = useState<boolean | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean | null>(null);
  const [hasMoonshotKey, setHasMoonshotKey] = useState<boolean | null>(null);
  const [hasFireworksKey, setHasFireworksKey] = useState<boolean | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [pendingParams, setPendingParams] = useState<URLSearchParams | null>(
    null,
  );
  const PENDING_PARAMS_KEY = "huggable_pending_start_params";
  const PENDING_NAME_KEY = "huggable_pending_project_name";
  const allowedModels = new Set([
    "gpt-4.1",
    "claude-sonnet-4.5",
    "claude-haiku-4.5",
    "claude-opus-4.5",
    "kimi-k2-thinking-turbo",
    "fireworks-minimax-m2p1",
  ]);

  const canSend = useMemo(() => prompt.trim().length > 0, [prompt]);

  const ensureModelKeyPresent = () => {
    const keyChecks = {
      "gpt-4.1": { hasKey: hasOpenAIKey, provider: "OpenAI" },
      "claude-sonnet-4.5": { hasKey: hasAnthropicKey, provider: "Anthropic" },
      "claude-haiku-4.5": { hasKey: hasAnthropicKey, provider: "Anthropic" },
      "claude-opus-4.5": { hasKey: hasAnthropicKey, provider: "Anthropic" },
      "kimi-k2-thinking-turbo": {
        hasKey: hasMoonshotKey,
        provider: "Moonshot",
      },
      "fireworks-minimax-m2p1": {
        hasKey: hasFireworksKey,
        provider: "Fireworks AI",
      },
    } as const;
    const check = keyChecks[model];
    if (check.hasKey === false) {
      toast({
        title: "Missing API key",
        description: `Please add your ${check.provider} API key in Settings.`,
      });
      return false;
    }
    return true;
  };

  const start = (authed: boolean) => {
    const params = new URLSearchParams();
    if (prompt.trim()) params.set("prompt", prompt.trim());
    params.set("visibility", "public");
    params.set("platform", platform);
    params.set("model", model);
    const defaultName = prompt.trim()
      ? prompt.trim().slice(0, 48)
      : "New Project";
    params.set("name", defaultName);
    const target = `/start?${params.toString()}`;
    if (authed) {
      setPendingParams(params);
      setProjectName(defaultName);
      if (typeof window !== "undefined") {
        localStorage.setItem(PENDING_PARAMS_KEY, params.toString());
        localStorage.setItem(PENDING_NAME_KEY, defaultName);
      }
      setShowNameDialog(true);
    } else {
      setPendingParams(params);
      setProjectName(defaultName);
      if (typeof window !== "undefined") {
        localStorage.setItem(PENDING_PARAMS_KEY, params.toString());
        localStorage.setItem(PENDING_NAME_KEY, defaultName);
      }
      setShowAuthDialog(true);
    }
  };

  const handleCreateProject = () => {
    if (!pendingParams) return;
    if (!ensureModelKeyPresent()) return;
    const params = new URLSearchParams(pendingParams);
    const chosenName = projectName.trim()
      ? projectName.trim().slice(0, 48)
      : "New Project";
    params.set("name", chosenName);
    setShowNameDialog(false);
    setPendingParams(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(PENDING_PARAMS_KEY);
      localStorage.removeItem(PENDING_NAME_KEY);
    }
    router.push(`/start?${params.toString()}`);
  };

  const closeAuthDialog = () => {
    setShowAuthDialog(false);
    setPendingParams(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(PENDING_PARAMS_KEY);
      localStorage.removeItem(PENDING_NAME_KEY);
    }
  };

  const closeNameDialog = () => {
    setShowNameDialog(false);
    setPendingParams(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(PENDING_PARAMS_KEY);
      localStorage.removeItem(PENDING_NAME_KEY);
    }
  };

  useEffect(() => {
    if (!isSignedIn) {
      setHasOpenAIKey(null);
      setHasAnthropicKey(null);
      setHasMoonshotKey(null);
      setHasFireworksKey(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/user-settings");
        if (res.ok) {
          const data = await res.json();
          setHasOpenAIKey(Boolean(data?.hasOpenAIKey));
          setHasAnthropicKey(Boolean(data?.hasAnthropicKey));
          setHasMoonshotKey(Boolean(data?.hasMoonshotKey));
          setHasFireworksKey(Boolean(data?.hasFireworksKey));
        }
      } catch {}
    })();
  }, [isSignedIn]);

  useEffect(() => {
    if (!pendingParams && typeof window !== "undefined") {
      const storedParams = localStorage.getItem(PENDING_PARAMS_KEY);
      const storedName = localStorage.getItem(PENDING_NAME_KEY);
      if (storedParams) {
        setPendingParams(new URLSearchParams(storedParams));
        const storedParamsObj = new URLSearchParams(storedParams);
        const storedModel = storedParamsObj.get("model");
        const storedPlatform = storedParamsObj.get("platform");
        if (storedModel && allowedModels.has(storedModel)) {
          setModel(storedModel as typeof model);
        }
        if (storedPlatform === "mobile" || storedPlatform === "web") {
          setPlatform(storedPlatform);
        }
        if (storedName) setProjectName(storedName);
      }
    }
    if (isSignedIn && pendingParams) {
      setShowAuthDialog(false);
      setShowNameDialog(true);
    }
  }, [isSignedIn, pendingParams]);

  return (
    <>
      <div className="antialiased text-[var(--sand-text)] bg-elevated min-h-screen">
        {/* Background gradients */}
        <div className="relative isolate overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-1/3 -left-1/4 h-[80vh] w-[80vw] rounded-full bg-gradient-to-br from-indigo-300 via-sky-200 to-white blur-3xl opacity-80"></div>
            <div className="absolute top-1/3 left-1/2 h-[90vh] w-[80vw] -translate-x-1/2 rounded-full bg-gradient-to-tr from-purple-300 via-blue-200 to-rose-200 blur-3xl opacity-80"></div>
            <div className="absolute bottom-[-20%] left-1/2 h-[70vh] w-[90vw] -translate-x-1/2 rounded-full bg-gradient-to-tr from-orange-400 via-rose-300 to-transparent blur-3xl opacity-70"></div>
            {/* Grain overlay */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: 'url("/grain.1ccdda41.png")',
                backgroundSize: "100px 100px",
                backgroundRepeat: "repeat",
                backgroundPosition: "left top",
                backgroundBlendMode: "overlay",
                mixBlendMode: "overlay",
              }}
            ></div>
          </div>

          {/* Nav */}
          <header className="relative">
            <div className="mx-auto max-w-7xl px-6 py-5">
              <div className="flex items-center justify-between">
                <a className="flex items-center gap-2" href="#">
                  <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-400 via-orange-400 to-violet-500 shadow-sm">
                    <Heart className="h-4 w-4 text-white" />
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-black">
                    Huggable
                  </span>
                </a>

                <nav className="hidden md:flex items-center gap-7 text-sm text-[var(--sand-text)]">
                  <SignedIn>
                    <a
                      className="font-medium hover:text-[var(--sand-text)] transition"
                      href="/projects"
                    >
                      My Projects
                    </a>
                  </SignedIn>
                  <a
                    className="hover:text-[var(--sand-text)] transition"
                    href="#"
                  >
                    Community
                  </a>
                  <a
                    className="hover:text-[var(--sand-text)] transition"
                    href="#"
                  >
                    Pricing
                  </a>
                  <a
                    className="hover:text-[var(--sand-text)] transition"
                    href="#"
                  >
                    Enterprise
                  </a>
                  <a
                    className="hover:text-[var(--sand-text)] transition"
                    href="#"
                  >
                    Learn
                  </a>
                  <a
                    className="hover:text-[var(--sand-text)] transition"
                    href="#"
                  >
                    Launched
                  </a>
                </nav>

                <div className="flex items-center gap-2">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="hidden sm:inline-flex items-center rounded-xl border border-border bg-elevated px-3.5 py-2 text-sm font-medium text-[var(--sand-text)] shadow-sm hover:bg-neutral-50 transition">
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
                    <a
                      href="/settings"
                      className="inline-flex items-center justify-center rounded-xl border border-border bg-elevated px-2.5 py-2 text-sm text-[var(--sand-text)] shadow-sm hover:bg-neutral-50 transition"
                      title="Settings"
                      aria-label="Settings"
                    >
                      <Cog className="h-4 w-4" />
                    </a>
                    <UserButton afterSignOutUrl="/" />
                  </SignedIn>
                </div>
              </div>
            </div>
          </header>

          {/* Hero */}
          <section className="relative">
            <div className="mx-auto max-w-4xl px-6 pt-10 pb-24 sm:pt-16">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[var(--sand-text)] text-center">
                Build something
                <span className="inline-flex translate-y-1 align-middle">
                  <span className="mx-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-400 via-orange-400 to-violet-500 shadow">
                    <Heart className="h-4 w-4 text-white" />
                  </span>
                </span>
                {/* Huggable */}
              </h1>
              <p className="mt-4 text-center text-[var(--sand-text)] sm:text-lg">
                Create apps and websites by chatting with AI
              </p>

              {/* Prompt box */}
              <div className="mx-auto mt-10 sm:mt-12">
                <div className="relative rounded-3xl border border-border bg-elevated transition backdrop-blur-sm shadow-[0_2px_0_rgba(0,0,0,0.02),0_20px_60px_-20px_rgba(0,0,0,0.2)]">
                  <textarea
                    placeholder="Ask Huggable to create a web app that..."
                    className="w-full rounded-5xl bg-transparent px-5 py-4 pr-24 text-base text-[var(--sand-text)] placeholder-neutral-400 outline-none sm:text-lg resize-none"
                    aria-label="Generation prompt"
                    style={{ height: 140 }}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />

                  {/* Bottom-left controls */}
                  <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 sm:bottom-3 sm:left-3">
                    <div className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-elevated shadow-sm shadow-soft hover:border-transparent hover:bg-accent/15 transition">
                      <Plus className="h-4 w-4 text-[var(--sand-text)]" />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPlatform(platform === "web" ? "mobile" : "web")
                      }
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium text-[var(--sand-text)] shadow-sm shadow-soft hover:border-transparent hover:bg-accent/15 transition"
                      title="Toggle platform"
                    >
                      {platform === "web" ? (
                        <Laptop className="h-4 w-4" />
                      ) : (
                        <Smartphone className="h-4 w-4" />
                      )}
                      <span>
                        {platform === "web"
                          ? "Web"
                          : "Mobile App (Experimental)"}
                      </span>
                    </button>

                    {/* Model Selector */}
                    <select
                      className="pointer-events-auto inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium text-[var(--sand-text)] shadow-sm shadow-soft hover:border-transparent hover:bg-accent/15 transition"
                      value={model}
                      onChange={(e) =>
                        setModel(
                          e.target.value as
                            | "gpt-4.1"
                            | "claude-sonnet-4.5"
                            | "claude-haiku-4.5"
                            | "claude-opus-4.5"
                            | "kimi-k2-thinking-turbo"
                            | "fireworks-minimax-m2p1",
                        )
                      }
                      title="Select model"
                    >
                      <option value="gpt-4.1">GPT-4.1</option>
                      <option value="claude-sonnet-4.5">
                        Claude Sonnet 4.5
                      </option>
                      <option value="claude-haiku-4.5">Claude Haiku 4.5</option>
                      <option value="claude-opus-4.5">Claude Opus 4.5</option>
                      <option value="kimi-k2-thinking-turbo">
                        Kimi K2 Thinking Turbo
                      </option>
                      <option value="fireworks-minimax-m2p1">
                        Fireworks MiniMax M2P1
                      </option>
                    </select>
                  </div>

                  {/* Send button */}
                  <SignedIn>
                    <button
                      onClick={() => start(true)}
                      disabled={!canSend}
                      className={cn(
                        "absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition sm:bottom-4 sm:right-4",
                        !canSend
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:opacity-90",
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
          <section className="relative mt-96">
            <div className="mx-auto max-w-7xl px-6">
              <div className="rounded-3xl border border-border bg-elevated shadow-sm">
                <div className="px-6 py-6 sm:px-8 sm:py-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                      From the Community
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-neutral-50 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 transition">
                        Popular
                      </button>
                      <button className="inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">
                        Discover
                      </button>
                      <button className="inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">
                        Internal Tools
                      </button>
                      <button className="inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">
                        Website
                      </button>
                      <button className="hidden sm:inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">
                        Personal
                      </button>
                      <button className="hidden sm:inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">
                        Consumer App
                      </button>
                      <button className="hidden md:inline-flex items-center rounded-full border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 transition">
                        B2B App
                      </button>
                      <a
                        href="#"
                        className="ml-1 inline-flex items-center text-sm font-medium text-[var(--sand-text)] hover:text-[var(--sand-text)]"
                      >
                        View All
                      </a>
                    </div>
                  </div>
                  <div className="mt-6 text-[var(--sand-text)] text-sm">
                    No public projects yet.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="relative">
            <div className="mx-auto max-w-7xl px-6 py-12 text-sm text-[var(--sand-text)]">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <p>© 2025 Huggable</p>
                <div className="flex items-center gap-6">
                  <a className="hover:text-[var(--sand-text)]" href="#">
                    Privacy
                  </a>
                  <a className="hover:text-[var(--sand-text)]" href="#">
                    Terms
                  </a>
                  <a className="hover:text-[var(--sand-text)]" href="#">
                    Contact
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {showAuthDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-neutral-900">
              Sign in to start building
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Sign in or sign up to create your project workspace. You&apos;ll
              be able to name it on the next step.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <SignInButton
                mode="modal"
                appearance={{
                  elements: {
                    card: "!h-[25rem] !rounded-b-none",
                    footerActionLink: "!-mt-24",
                    footer: "!bg-surface",
                    // cardBox: "!h-[80rem]",
                    // card: "max-h-[190vh] overflow-y-auto",
                    // headerTitle: "text-lg leading-tight",
                    // headerSubtitle: "text-sm leading-normal",
                    // formFieldLabel: "whitespace-normal",
                    // footerActionText: "whitespace-normal",
                  },
                }}
              >
                <button className="inline-flex flex-1 items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow hover:opacity-90 transition">
                  Sign in / Sign up
                </button>
              </SignInButton>
              <button
                onClick={closeAuthDialog}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-[var(--sand-text)] shadow-sm hover:bg-neutral-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-neutral-900">
              Name your project
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Give your project a short name so it&apos;s easy to find later.
            </p>
            <div className="mt-4">
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject();
                }}
                placeholder="My new project"
                className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-neutral-900 shadow-sm outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCreateProject}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow hover:opacity-90 transition"
              >
                Continue to workspace
              </button>
              <button
                onClick={closeNameDialog}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-[var(--sand-text)] shadow-sm hover:bg-neutral-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
