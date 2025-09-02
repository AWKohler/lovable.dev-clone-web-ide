import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

export default function Page({ searchParams }: { searchParams: { redirect_url?: string } }) {
  const redirectUrl = searchParams?.redirect_url ?? "/";

  return (
    <div className="min-h-screen flex">
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 bg-surface text-neutral-900">
        {/* <div className="w-full max-w-md mx-auto scale-120 mt-20 ml-25"> */}
        <div className="w-full max-w-md mx-auto mt-20">

          <SignIn
            forceRedirectUrl={redirectUrl}
            routing="hash"
            appearance={{
              elements: {
                socialButtons: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  alignItems: "stretch",
                },
                socialButton: {
                  // height: "h-6",
                  width: "100%",
                  borderRadius: "10px",
                  backgroundColor: "var(--color-elevated)",
                  color: "#222",
                  fontWeight: "600",
                  // padding: "0.75rem 1rem",
                  boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
                  border: "1px solid #e5e7eb",
                },
                
                formFieldInputShowPasswordButton: "!bg-transparent",
              },
              variables: {
                colorMuted: 'var(--color-surface)',
                colorForeground: 'var(--color-text)'
              },
            }}
          />
        </div>
      </div>

      <div className="hidden md:flex md:w-1/2 items-center justify-center p-4 bg-surface">
        <div className="relative w-full h-full rounded-xl overflow-hidden">
          <Image
            src="/light-login-background.webp"
            alt="Login Banner"
            fill
            priority
            className="object-cover pointer-events-none select-none"
          />


            
          {/* Centered overlay card on top of the image */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <div className="flex w-[450px] items-center gap-4 rounded-2xl bg-[#FCFBF8D9]/85 px-4 py-4 shadow-xl">
              <div className="flex-1">
                <p className="text-base text-black">
                  <span className="relative inline-block min-w-[80px] text-base">
                    {/* <span className="invisible">&ZeroWidthSpace;</span> */}
                    Ask Huggable to build your project
                    {/* <span
                      className="absolute top-1/2 ml-[2px] inline-block h-[1.4em] w-[2px] -translate-y-1/2 bg-[#1F68DB] opacity-100"
                      aria-hidden="true"
                    /> */}
                  </span>
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M12 19V5M5 12l7-7 7 7"></path>
                </svg>
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}