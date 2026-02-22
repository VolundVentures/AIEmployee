import { ArrowRight } from "lucide-react";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[var(--accent)] rounded-xl flex items-center justify-center font-bold text-xl mx-auto mb-4">
            J
          </div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-[var(--muted)] mt-2">
            Hire your first AI employee in minutes
          </p>
        </div>

        <form className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white py-3 rounded-lg font-medium transition-colors"
          >
            Create account <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-[var(--accent-light)] hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
