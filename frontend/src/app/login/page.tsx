"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { hasAccessToken, setAccessToken } from "@/lib/auth";
import ThemeToggle from "@/components/ui/ThemeToggle";

type AuthMode = "login" | "create" | "mobile";
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
    mobile: "Mobile OTP",
    loginBtn: "Sign In",
    createBtn: "Create Account",
    sendOtpBtn: "Send OTP",
    verifyOtpBtn: "Verify OTP",
    completeBtn: "Complete Signup",
    back: "Back to Home",
    language: "नेपाली",
  },
  ne: {
    title: "AgentShakti पहुँच",
    subtitle: "मोबाइल नम्बर सहित खाता बनाउनुहोस् वा Google बाट जारी राख्नुहोस्।",
    login: "लगइन",
    create: "खाता बनाउनुहोस्",
    mobile: "मोबाइल OTP",
    loginBtn: "लगइन",
    createBtn: "खाता बनाउनुहोस्",
    sendOtpBtn: "OTP पठाउनुहोस्",
    verifyOtpBtn: "OTP पुष्टि गर्नुहोस्",
    completeBtn: "साइनअप पूरा गर्नुहोस्",
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
  const [mobilePhone, setMobilePhone] = useState("");
  const [mobileOtp, setMobileOtp] = useState("");
  const [mobileRequestId, setMobileRequestId] = useState<string | null>(null);
  const [mobileOtpVerified, setMobileOtpVerified] = useState(false);
  const [mobileFirstName, setMobileFirstName] = useState("");
  const [mobileLastName, setMobileLastName] = useState("");
  const [mobileUsername, setMobileUsername] = useState("");
  const [mobileEmail, setMobileEmail] = useState("");
  const [mobilePassword, setMobilePassword] = useState("");

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
  const canSendMobileOtp = useMemo(() => mobilePhone.trim().length > 0, [mobilePhone]);
  const canVerifyMobileOtp = useMemo(() => (mobileRequestId ? mobileOtp.trim().length >= 4 : false), [mobileRequestId, mobileOtp]);
  const canCompleteMobileSignup = useMemo(
    () =>
      mobileOtpVerified &&
      mobileFirstName.trim().length > 0 &&
      mobileLastName.trim().length > 0 &&
      mobileUsername.trim().length >= 3 &&
      mobileEmail.trim().length > 0 &&
      mobilePassword.length >= 8,
    [mobileOtpVerified, mobileFirstName, mobileLastName, mobileUsername, mobileEmail, mobilePassword],
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

  const handleMobileSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSendMobileOtp) return;
    setError("");
    setLoading(true);
    try {
      const result = await api.mobileSignupSendOtp(mobilePhone.trim());
      setMobileRequestId(result.request_id);
      setMobileOtpVerified(false);
    } catch (err) {
      if (err instanceof ApiError) setError(`OTP send failed (${err.status}).`);
      else setError("OTP send failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleMobileVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canVerifyMobileOtp || !mobileRequestId) return;
    setError("");
    setLoading(true);
    try {
      await api.mobileSignupVerifyOtp(mobileRequestId, mobileOtp.trim());
      setMobileOtpVerified(true);
    } catch (err) {
      if (err instanceof ApiError) setError(`OTP verification failed (${err.status}).`);
      else setError("OTP verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleMobileComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCompleteMobileSignup || !mobileRequestId) return;
    setError("");
    setLoading(true);
    try {
      const data = await api.mobileSignupComplete({
        request_id: mobileRequestId,
        first_name: mobileFirstName.trim(),
        last_name: mobileLastName.trim(),
        username: mobileUsername.trim(),
        email: mobileEmail.trim(),
        password: mobilePassword,
      });
      setAccessToken(data.access_token);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) setError(`Mobile signup failed (${err.status}).`);
      else setError("Mobile signup failed.");
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
                  <Link href="/" className="btn-outline-modern inline-flex h-10 items-center border px-4 text-sm font-medium">
                    {t.back}
                  </Link>
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
                  <button
                    type="button"
                    onClick={() => setMode("mobile")}
                    className={`inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${mode === "mobile" ? "btn-primary-modern border-transparent" : "btn-outline-modern"}`}
                  >
                    {t.mobile}
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
                ) : mode === "create" ? (
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
                ) : (
                  <div className="space-y-4">
                    {!mobileRequestId ? (
                      <form onSubmit={handleMobileSendOtp} className="space-y-3">
                        <input
                          value={mobilePhone}
                          onChange={(e) => setMobilePhone(e.target.value)}
                          required
                          placeholder="+97798XXXXXXXX"
                          className="input-modern h-12 w-full px-4 text-sm"
                        />
                        <button type="submit" disabled={loading || !canSendMobileOtp} className="btn-primary-modern inline-flex h-12 items-center border border-transparent px-6 text-sm font-semibold disabled:opacity-60">
                          {loading ? "Sending..." : t.sendOtpBtn}
                        </button>
                      </form>
                    ) : !mobileOtpVerified ? (
                      <form onSubmit={handleMobileVerifyOtp} className="space-y-3">
                        <input
                          value={mobileOtp}
                          onChange={(e) => setMobileOtp(e.target.value)}
                          required
                          placeholder="OTP"
                          className="input-modern h-12 w-full px-4 text-sm"
                        />
                        <div className="flex flex-wrap gap-3">
                          <button type="submit" disabled={loading || !canVerifyMobileOtp} className="btn-primary-modern inline-flex h-12 items-center border border-transparent px-6 text-sm font-semibold disabled:opacity-60">
                            {loading ? "Verifying..." : t.verifyOtpBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileRequestId(null);
                              setMobileOtp("");
                              setMobileOtpVerified(false);
                            }}
                            className="btn-outline-modern inline-flex h-12 items-center border px-6 text-sm font-semibold"
                          >
                            Change Number
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleMobileComplete} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input value={mobileFirstName} onChange={(e) => setMobileFirstName(e.target.value)} required placeholder="First Name" className="input-modern h-12 px-4 text-sm" />
                        <input value={mobileLastName} onChange={(e) => setMobileLastName(e.target.value)} required placeholder="Last Name" className="input-modern h-12 px-4 text-sm" />
                        <input value={mobileUsername} onChange={(e) => setMobileUsername(e.target.value)} required placeholder="Username" className="input-modern h-12 px-4 text-sm" />
                        <input type="email" value={mobileEmail} onChange={(e) => setMobileEmail(e.target.value)} required placeholder="Email" className="input-modern h-12 px-4 text-sm" />
                        <input type="password" value={mobilePassword} onChange={(e) => setMobilePassword(e.target.value)} required placeholder="New Password" className="input-modern h-12 px-4 text-sm md:col-span-2" />
                        <div className="md:col-span-2">
                          <button type="submit" disabled={loading || !canCompleteMobileSignup} className="btn-primary-modern inline-flex h-12 items-center border border-transparent px-6 text-sm font-semibold disabled:opacity-60">
                            {loading ? "Completing..." : t.completeBtn}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
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
