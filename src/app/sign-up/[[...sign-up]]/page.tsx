import { SignUp } from "@clerk/nextjs";

export default function Page({ searchParams }: { searchParams: { redirect_url?: string } }) {
  const redirectUrl = searchParams?.redirect_url ?? '/';
  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-neutral-900 p-6">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white shadow-sm p-6">
        <div className="mb-4 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-400 via-orange-400 to-violet-500 shadow-sm"/>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-neutral-600">Join Huggable to start building</p>
        </div>
        <SignUp forceRedirectUrl={redirectUrl} routing="hash" />
      </div>
    </div>
  );
}
