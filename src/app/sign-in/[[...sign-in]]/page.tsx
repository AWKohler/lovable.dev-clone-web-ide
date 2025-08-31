import { SignIn } from "@clerk/nextjs";

export default function Page({ searchParams }: { searchParams: { redirect_url?: string } }) {
  const redirectUrl = searchParams?.redirect_url ?? '/';
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-neutral-900 p-6 scale-125">
      {/* <div className="w-full max-w-md rounded-2xl border border-black/10 bg-surface shadow-sm p-6">
        <div className="mb-4 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-rose-400 via-orange-400 to-violet-500 shadow-sm"/>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-neutral-600">Sign in to continue</p>
        </div>
        
      </div> */}

      <SignIn forceRedirectUrl={redirectUrl} routing="hash" 
        // elements: {
            //   socialButtons: {
            //     backgroundColor: "#f8f4ed",
            //     borderRadius: "10px",
            //   }
            // },
          appearance={{
            elements: {
              // socialButtons: {
              //   // backgroundColor: "#f8f4ed",
              //   display: "flex",
              //   flexDirection: "column",
              //   gap: "0.75rem", // 12px gap between buttons
              //   alignItems: "stretch", // Make buttons span container
              // },
              // socialButton: {
              //   width: "100%", // Full width
              //   borderRadius: "10px",
              //   backgroundColor: "#f8f4ed",
              //   // color: "#ee9d11ff",
              //   fontWeight: "600",
              //   padding: "0.75rem 1rem",
              // },

              // socialButton: "!!bg-red-500",
              // button: "!!bg-yellow-500"


              socialButtons: {
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                alignItems: "stretch",
              },
              socialButton: {
                width: "100%",
                borderRadius: "10px",
                backgroundColor: "#f8f4ed",
                color: "#222",
                fontWeight: "600",
                padding: "0.75rem 1rem",
                boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
                border: "1px solid #e5e7eb",
              },
              
              formFieldInputShowPasswordButton: "!bg-transparent"

              




            },
            variables: {
              // colorBorder: "transparent",
              // colorShadow: "transparent",
              colorMuted: '#fcfbf8',
              // colorPrimary: '#7979ecff',
              // colorDanger: '#0c0bf8',
            },            
          }}
          
        
        />
    </div>
  );
}