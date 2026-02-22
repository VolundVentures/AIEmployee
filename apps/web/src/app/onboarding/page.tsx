"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Building2, User, MessageSquare } from "lucide-react";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleStep1Next() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName, industry }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create company");
        return;
      }
      setCompanyId(data.id);
      setStep(2);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!companyId) {
      setError("Company not found. Please go back and try again.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          name: employeeName,
          role: employeeRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create employee");
        return;
      }
      setStep(3);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                s <= step ? "bg-[var(--accent)]" : "bg-[var(--card-border)]"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="w-6 h-6 text-[var(--accent-light)]" />
              <h1 className="text-2xl font-bold">Tell us about your company</h1>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium mb-1.5">
                  Company name
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Volund Ventures"
                  className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-medium mb-1.5">
                  Industry
                </label>
                <select
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                >
                  <option value="">Select industry</option>
                  <option value="technology">Technology</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="services">Professional Services</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="finance">Finance</option>
                  <option value="education">Education</option>
                  <option value="real_estate">Real Estate</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <button
                onClick={handleStep1Next}
                disabled={!companyName || loading}
                className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? "Creating..." : <>Next <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-[var(--accent-light)]" />
              <h1 className="text-2xl font-bold">Create your first AI employee</h1>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="employeeName" className="block text-sm font-medium mb-1.5">
                  Employee name
                </label>
                <input
                  id="employeeName"
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="e.g., Atlas, Sara, Khalid"
                  className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label htmlFor="employeeRole" className="block text-sm font-medium mb-1.5">
                  Role
                </label>
                <select
                  id="employeeRole"
                  value={employeeRole}
                  onChange={(e) => setEmployeeRole(e.target.value)}
                  className="w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                >
                  <option value="">Select a role</option>
                  <option value="chief_of_staff">Chief of Staff</option>
                  <option value="customer_support">Customer Support</option>
                  <option value="operations">Operations Manager</option>
                  <option value="research">Research Analyst</option>
                  <option value="marketing">Marketing Manager</option>
                  <option value="sales">Sales Development Rep</option>
                  <option value="custom">Custom Role</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center justify-center gap-2 border border-[var(--card-border)] hover:border-[var(--muted)] text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleStep2Next}
                  disabled={!employeeName || !employeeRole || loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
                >
                  {loading ? "Creating..." : <>Next <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <MessageSquare className="w-6 h-6 text-[var(--accent-light)]" />
              <h1 className="text-2xl font-bold">Connect WhatsApp</h1>
            </div>

            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center mb-6">
              <div className="w-48 h-48 bg-[var(--background)] border border-[var(--card-border)] rounded-lg mx-auto mb-4 flex items-center justify-center text-[var(--muted)]">
                QR Code will appear here
              </div>
              <p className="text-sm text-[var(--muted)]">
                Scan this QR code with your WhatsApp app to connect {employeeName} to your
                WhatsApp.
              </p>
            </div>

            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4 mb-6">
              <h3 className="font-medium text-sm mb-2">Summary</h3>
              <div className="space-y-1 text-sm text-[var(--muted)]">
                <p>Company: <span className="text-white">{companyName}</span></p>
                <p>AI Employee: <span className="text-white">{employeeName}</span></p>
                <p>Role: <span className="text-white">{employeeRole.replace(/_/g, " ")}</span></p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex items-center justify-center gap-2 border border-[var(--card-border)] hover:border-[var(--muted)] text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white py-3 rounded-lg font-medium transition-colors"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
