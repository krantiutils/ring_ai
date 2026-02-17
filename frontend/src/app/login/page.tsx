"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { hasAccessToken, setAccessToken } from "@/lib/auth";
import ThemeToggle from "@/components/ui/ThemeToggle";

type AuthMode = "login" | "create";
type Lang = "en" | "ne";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_black" | "filled_blue";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

const copy = {
  en: {
    title: "Access AgentShakti",
    subtitle: "Create account with mobile number or continue with Google.",
    login: "Sign In",
    create: "Create Account",
    loginBtn: "Sign In",
    createBtn: "Create Account",
    back: "Back to Home",
    language: "नेपाली",
  },
  ne: {
    title: "AgentShakti पहुँच",
    subtitle: "मोबाइल नम्बर सहित खाता बनाउनुहोस् वा Google बाट जारी राख्नुहोस्।",
    login: "लगइन",
    create: "खाता बनाउनुहोस्",
    loginBtn: "लगइन",
    createBtn: "खाता बनाउनुहोस्",
    back: "होममा फर्कनुहोस्",
    language: "English",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  const [lang, setLang] = useState<Lang>("en");
  const [mode, setMode] = useState<AuthMode>("login");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  const canCreate = useMemo(
    () =>
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      username.trim().length >= 3 &&
      createEmail.trim().length > 0 &&
      phone.trim().length > 0 &&
      createPassword.length >= 8,
    [firstName, lastName, username, createEmail, phone, createPassword],
  );

  useEffect(() => {
    if (hasAccessToken()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (!scriptLoaded || !googleClientId || !googleButtonRef.current || !window.google?.accounts?.id) return;
    const callback = async (response: { credential?: string }) => {
      if (!response.credential) {
        setError("Google login failed.");
        return;
      }
      setError("");
      setLoading(true);
      try {
        const data = await api.googleLogin(response.credential);
        setAccessToken(data.access_token);
        router.push("/dashboard");
      } catch {
        setError("Google login failed.");
      } finally {
        setLoading(false);
      }
    };
    window.google.accounts.id.initialize({ client_id: googleClientId, callback });
    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      width: 360,
    });
  }, [googleClientId, router, scriptLoaded]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(loginEmail.trim(), loginPassword);
      setAccessToken(data.access_token);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) setError(err.status === 401 ? "Invalid email or password." : "Login failed.");
      else setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setError("");
    setLoading(true);
    try {
      await api.register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim(),
        email: createEmail.trim(),
        phone: phone.trim(),
        password: createPassword,
      });
      const data = await api.login(createEmail.trim(), createPassword);
      setAccessToken(data.access_token);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError("Email or username already exists.");
        else if (err.status === 422) setError("Please check form fields.");
        else setError("Create account failed.");
      } else {
        setError("Network error.");
      }
    } finally {
      setLoading(false);
    }
  };

  const t = copy[lang];

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} />
      <main className="min-h-screen bg-[var(--background)] px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
            <div className="soft-glow -right-20 top-10 h-72 w-72 bg-[#4D7CFF]/25" />
            <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
              <aside className="border-b border-[var(--border)] bg-[var(--muted)] p-8 lg:border-r lg:border-b-0">
                <div className="label-badge">
                  <span className="pulse-dot" />
                  Auth
                </div>
                <h1 className="font-display mt-5 text-5xl leading-tight text-[var(--foreground)]">{t.title}</h1>
                <p className="mt-4 text-[var(--muted-foreground)]">{t.subtitle}</p>
                <div className="mt-6 flex gap-2">
                  <ThemeToggle />
                  <button
                    onClick={() => setLang((v) => (v === "en" ? "ne" : "en"))}
                    className="btn-outline-modern inline-flex h-10 items-center border px-4 font-mono-label text-[11px] font-medium uppercase tracking-[0.12em]"
                  >
                    {t.language}
                  </button>
                  <a href="/" className="btn-outline-modern inline-flex h-10 items-center border px-4 text-sm font-medium">
                    {t.back}
                  </a>
                </div>
              </aside>

              <section className="p-8">
                <div className="mb-5 inline-flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-1">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${mode === "login" ? "btn-primary-modern border-transparent" : "btn-outline-modern"}`}
                  >
                    {t.login}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("create")}
                    className={`inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${mode === "create" ? "btn-primary-modern border-transparent" : "btn-outline-modern"}`}
                  >
                    {t.create}
                  </button>
                </div>

                {error && <div className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">{error}</div>}

                {mode === "login" ? (
                  <form onSubmit={handleLogin} className="space-y-3">
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      placeholder="Email"
                      className="input-modern h-12 w-full px-4 text-sm"
                    />
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      placeholder="Password"
                      className="input-modern h-12 w-full px-4 text-sm"
                    />
                    <button type="submit" disabled={loading} className="btn-primary-modern inline-flex h-12 items-center border border-transparent px-6 text-sm font-semibold disabled:opacity-60">
                      {loading ? "Signing in..." : t.loginBtn}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="First Name" className="input-modern h-12 px-4 text-sm" />
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Last Name" className="input-modern h-12 px-4 text-sm" />
                    <input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Username" className="input-modern h-12 px-4 text-sm" />
                    <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required placeholder="Email" className="input-modern h-12 px-4 text-sm" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+97798XXXXXXXX" className="input-modern h-12 px-4 text-sm" />
                    <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required placeholder="Password" className="input-modern h-12 px-4 text-sm" />
                    <div className="md:col-span-2">
                      <button type="submit" disabled={loading || !canCreate} className="btn-primary-modern inline-flex h-12 items-center border border-transparent px-6 text-sm font-semibold disabled:opacity-60">
                        {loading ? "Creating..." : t.createBtn}
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[#0052FF]">Continue with Google</p>
                  {googleClientId ? (
                    <div ref={googleButtonRef} className="mt-3 min-h-[44px]" />
                  ) : (
                    <p className="mt-3 text-sm text-[var(--muted-foreground)]">Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to enable Google login.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
