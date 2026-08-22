import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { ThemeControl } from "@/components/theme-control";

export default function SignUpPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-20">
      <div className="absolute inset-x-0 top-0 flex h-16 items-center justify-between px-5 sm:px-8"><Link href="/" className="flex items-center gap-2 font-bold text-slate-950"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white"><Icon name="sparkles" className="h-5 w-5" /></span>RestroPilot AI</Link><ThemeControl compact /></div>
      <div className="w-full max-w-md"><SignUp fallbackRedirectUrl="/overview" signInUrl="/sign-in" /></div>
    </main>
  );
}
