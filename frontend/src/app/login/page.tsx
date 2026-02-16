"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { hasAccessToken, setAccessToken } from "@/lib/auth";

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

const text = {
  en: {
    title: "AUTH TERMINAL",
    tagline: "Create account with mobile number or continue with Google.",
    signIn: "sign in",
    create: "create account",
    loginBtn: "[ sign in ]",
    createBtn: "[ create account ]",
    googleMissing: "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google login.",
    back: "[ back to index ]",
    lang: "नेपाली",
  },
  ne: {
    title: "AUTH TERMINAL",
    tagline: "मोबाइल नम्बर सहित खाता बनाउनुहोस् वा Google बाट जारी राख्नुहोस्।",
    signIn: "लगइन",
    create: "खाता बनाउनुहोस्",
    loginBtn: "[ लगइन ]",
    createBtn: "[ खाता बनाउनुहोस् ]",
    googleMissing: "Google लगइन सक्षम गर्न NEXT_PUBLIC_GOOGLE_CLIENT_ID राख्नुहोस्।",
    back: "[ index मा फर्कनुहोस् ]",
    lang: "English",
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
      width: 320,
    });
  }, [scriptLoaded, googleClientId, router]);

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

  const t = text[lang];

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} />
      <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-[#33ff00]">
        <div className="mx-auto max-w-3xl">
          <div className="terminal-pane sharp-corners overflow-hidden">
            <div className="terminal-titlebar flex items-center justify-between px-4 py-3 text-xs terminal-caps">
              <span>+-- {t.title} --+</span>
              <button type="button" onClick={() => setLang((v) => (v === "en" ? "ne" : "en"))} className="terminal-btn-secondary sharp-corners terminal-btn inline-flex min-h-[32px] items-center px-2 text-[10px]">
                {t.lang}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5">
              <aside className="border-b border-[#1f521f] p-5 lg:col-span-2 lg:border-r lg:border-b-0">
                <p className="terminal-caps text-[11px] text-[#ffb000]">session info</p>
                <h1 className="terminal-display mt-3 text-4xl uppercase leading-[0.9]">RING AI ACCESS</h1>
                <p className="mt-4 text-sm text-[#7bd96a]">{t.tagline}</p>
                <div className="terminal-line mt-5 border-t pt-4 text-xs text-[#7bd96a]">
                  <p>$ mode --{mode}</p>
                  <p className="mt-2">$ status --{loading ? "busy" : "ready"}</p>
                </div>
                <a href="/" className="terminal-btn terminal-btn-secondary sharp-corners mt-5 inline-flex min-h-[44px] items-center px-4 text-xs">
                  {t.back}
                </a>
              </aside>

              <section className="p-5 lg:col-span-3 lg:p-6">
                <div className="mb-5 flex gap-2">
                  <button type="button" onClick={() => setMode("login")} className={`sharp-corners min-h-[44px] px-4 text-xs terminal-caps border ${mode === "login" ? "border-[#33ff00] bg-[#33ff00] text-[#0a0a0a]" : "border-[#1f521f] text-[#33ff00] hover:border-[#33ff00]"}`}>
                    {t.signIn}
                  </button>
                  <button type="button" onClick={() => setMode("create")} className={`sharp-corners min-h-[44px] px-4 text-xs terminal-caps border ${mode === "create" ? "border-[#33ff00] bg-[#33ff00] text-[#0a0a0a]" : "border-[#1f521f] text-[#33ff00] hover:border-[#33ff00]"}`}>
                    {t.create}
                  </button>
                </div>

                {error && <div className="mb-4 border border-[#ff3333] bg-[#190909] px-3 py-2 text-xs terminal-caps text-[#ff3333]">[err] {error}</div>}

                {mode === "login" ? (
                  <form onSubmit={handleLogin} className="space-y-3">
                    <label className="block"><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">email</span><input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <label className="block"><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">password</span><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <button type="submit" disabled={loading} className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs disabled:opacity-60">{loading ? "[ signing in ]" : t.loginBtn}</button>
                  </form>
                ) : (
                  <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">first_name</span><input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <label><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">last_name</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <label><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">username</span><input value={username} onChange={(e) => setUsername(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <label><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">email</span><input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <label><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">mobile_number</span><input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+97798XXXXXXXX" className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <label><span className="terminal-caps block text-[11px] text-[#ffb000] mb-1">password</span><input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required className="terminal-input sharp-corners w-full px-3 py-2 text-sm" /></label>
                    <div className="md:col-span-2">
                      <button type="submit" disabled={loading || !canCreate} className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs disabled:opacity-60">{loading ? "[ creating ]" : t.createBtn}</button>
                    </div>
                  </form>
                )}

                <div className="terminal-line mt-6 border-t pt-4">
                  <p className="terminal-caps text-[11px] text-[#ffb000] mb-3">google_signin</p>
                  {googleClientId ? <div ref={googleButtonRef} className="min-h-[44px]" /> : <p className="text-xs text-[#7bd96a]">{t.googleMissing}</p>}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
