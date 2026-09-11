"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getFirebaseAuth,
  getGoogleProvider,
  signInWithCustomToken,
  signInWithPopup,
} from "@/lib/firebase/client";

type AuthTab = "signin" | "signup";
type Step = "phone" | "otp" | "name";

type PendingSession = {
  idToken: string;
  fullName: string;
};

type AuthCardProps = {
  mode?: "embedded" | "modal";
  initialTab?: AuthTab;
  onSuccess?: () => void;
  onClose?: () => void;
};

const EMPTY_OTP = ["", "", "", "", "", ""];

const COUNTRY_CODES = [
  { flag: "🇮🇳", code: "+91", country: "India" },
  { flag: "🇺🇸", code: "+1", country: "USA" },
  { flag: "🇬🇧", code: "+44", country: "UK" },
  { flag: "🇦🇪", code: "+971", country: "UAE" },
  { flag: "🇸🇬", code: "+65", country: "Singapore" },
  { flag: "🇦🇺", code: "+61", country: "Australia" },
  { flag: "🇩🇪", code: "+49", country: "Germany" },
  { flag: "🇫🇷", code: "+33", country: "France" },
  { flag: "🇯🇵", code: "+81", country: "Japan" },
];

export function AuthCard({
  mode = "embedded",
  initialTab = "signup",
  onSuccess,
  onClose,
}: AuthCardProps) {
  const router = useRouter();
  const { appUser, refreshUser, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [challengeId, setChallengeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [canResend, setCanResend] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  type SubmittingAction = "otp" | "google" | "verify" | "name" | null;
  const [submittingAction, setSubmittingAction] = useState<SubmittingAction>(null);
  const [error, setError] = useState("");

  const [isOtpError, setIsOtpError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  // Property quick-start state (when authenticated)
  const [propertyType, setPropertyType] = useState("Hotel");
  const [location, setLocation] = useState("");
  const [rooms, setRooms] = useState(1);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetState() {
    setStep("phone");
    setPhone("");
    setChallengeId("");
    setFullName("");
    setPendingSession(null);
    setOtp(EMPTY_OTP);
    setIsOtpError(false);
    setShakeKey(0);
    setCanResend(false);
    setResendTimer(30);
    setSubmittingAction(null);
    setError("");
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const startTimer = () => {
    setResendTimer(30);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const normalizedPhone = `${countryCode}${phone}`;
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  const createSession = async (idToken: string, name: string) => {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, fullName: name }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      if (response.status === 422) {
        setPendingSession({ idToken, fullName: name });
        setFullName(name);
        setStep("name");
        return;
      }
      throw new Error(data.error ?? "Unable to create session.");
    }

    await refreshUser();
    resetState();
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/partner/onboarding");
    }
  };

  const handleSendOtp = async () => {
    if (phone.trim().length < 6 || Boolean(submittingAction)) return;

    setSubmittingAction("otp");
    setError("");

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: normalizedPhone }),
      });
      const data = (await response.json()) as { challengeId?: string; error?: string };

      if (!response.ok || !data.challengeId) {
        throw new Error(data.error ?? "Unable to send verification code.");
      }

      setChallengeId(data.challengeId);
      setIsOtpError(false);
      setStep("otp");
      startTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send code.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6 || Boolean(submittingAction)) return;

    setSubmittingAction("verify");
    setError("");
    setIsOtpError(false);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp: code }),
      });
      const data = (await response.json()) as { customToken?: string; error?: string };

      if (!response.ok || !data.customToken) {
        setIsOtpError(true);
        setShakeKey((prev) => prev + 1);
        return;
      }

      const credential = await signInWithCustomToken(getFirebaseAuth(), data.customToken);
      const idToken = await credential.user.getIdToken();
      await createSession(idToken, credential.user.displayName ?? "");
    } catch {
      setIsOtpError(true);
      setShakeKey((prev) => prev + 1);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (Boolean(submittingAction)) return;

    setSubmittingAction("google");
    setError("");

    try {
      const credential = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
      const idToken = await credential.user.getIdToken();
      const name = credential.user.displayName ?? "";

      await createSession(idToken, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in with Google.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleCompleteName = async () => {
    if (!pendingSession || fullName.trim().length < 2 || Boolean(submittingAction)) return;

    setSubmittingAction("name");
    setError("");

    try {
      await createSession(pendingSession.idToken, fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to finish sign in.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (isOtpError) setIsOtpError(false);
    const cleaned = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = cleaned;
    setOtp(next);
    if (cleaned && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isOtpError) setIsOtpError(false);
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    if (isOtpError) setIsOtpError(false);
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleBackToPhone = () => {
    setStep("phone");
    setOtp(EMPTY_OTP);
    setIsOtpError(false);
    setChallengeId("");
    setError("");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleStartListing = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/partner/onboarding");
  };

  // If user is already logged in, show authenticated quick dashboard/listing card
  if (appUser) {
    return (
      <div className="rounded-2xl border border-[var(--hk-border)] bg-white p-7 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--hk-primary-dark)] text-white shadow-sm">
              <UserAvatarIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--hk-gold)]">
                  Active Partner
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <h3 className="text-[17px] font-bold text-[var(--hk-primary-dark)]">
                {appUser.fullName || "Partner Account"}
              </h3>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-emerald-900">
          <p className="text-[14px] font-semibold">Ready to list your property?</p>
          <p className="mt-0.5 text-[13px] text-emerald-700">
            You are signed in as <span className="font-bold">{appUser.email || appUser.phoneNumber || "Host"}</span>.
          </p>
        </div>

        <form onSubmit={handleStartListing} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-[var(--hk-ink)]">
              Property type
            </label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-[var(--hk-background-warm)] p-3.5 text-[14px] font-medium text-[var(--hk-ink)] outline-none transition-all focus:border-[var(--hk-primary-dark)] focus:ring-2 focus:ring-[rgba(11,31,58,0.12)]"
            >
              <option value="Hotel">Hotel</option>
              <option value="Apartment">Apartment</option>
              <option value="Villa">Villa</option>
              <option value="Resort">Resort</option>
              <option value="Boutique Stay">Boutique Stay</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-[var(--hk-ink)]">
              Location
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. London, UK or Mumbai, India"
              className="w-full rounded-xl border border-gray-300 bg-[var(--hk-background-warm)] p-3.5 text-[14px] text-[var(--hk-ink)] outline-none transition-all placeholder:text-gray-400 focus:border-[var(--hk-primary-dark)] focus:ring-2 focus:ring-[rgba(11,31,58,0.12)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-[var(--hk-ink)]">
              Number of rooms
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={rooms}
              onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-xl border border-gray-300 bg-[var(--hk-background-warm)] p-3.5 text-[14px] text-[var(--hk-ink)] outline-none transition-all focus:border-[var(--hk-primary-dark)] focus:ring-2 focus:ring-[rgba(11,31,58,0.12)]"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--hk-primary-dark)] py-4 text-[15px] font-bold text-white shadow-md transition-all hover:bg-[var(--hk-primary)] hover:shadow-lg"
          >
            Continue to Partner Onboarding &rarr;
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <Link
            href="/partner/dashboard"
            className="text-[13px] font-bold text-[var(--hk-primary-dark)] hover:underline"
          >
            Open Partner Dashboard
          </Link>
          <button
            onClick={() => void logout()}
            className="text-[13px] font-semibold text-red-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-white ${
        mode === "embedded"
          ? "rounded-2xl border border-[var(--hk-border)] p-6 shadow-2xl backdrop-blur-md sm:p-8"
          : "rounded-[24px] p-6 sm:p-8"
      }`}
    >
     

  

      {/* Close button at top right */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close modal"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}

      {/* Center Header Logo Icon */}
      <div className="flex justify-center mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black shadow-sm">
          <KeyIcon className="h-6 w-6 text-[#E3C27B]" />
        </div>
      </div>

      {/* Main Content Step Views */}
      {step === "phone" ? (
        <div>
          <h2 className="text-[22px] font-bold text-center tracking-tight text-gray-900 mb-6">
            Log in or sign up
          </h2>

          <div className="mb-2">
            <div className="flex items-center rounded-xl border border-gray-300 bg-white overflow-hidden transition-all focus-within:border-black focus-within:ring-1 focus-within:ring-black">
              {/* Country Code Selector */}
              <div className="relative flex items-center border-r border-gray-200 px-3.5 py-3.5 bg-white shrink-0">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                >
                  {COUNTRY_CODES.map((c, i) => (
                    <option key={`${c.code}-${i}`} value={c.code}>
                      {c.flag} {c.code} ({c.country})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 text-[14px] font-medium text-gray-900">
                  <span className="text-[16px]">{selectedCountry?.flag || "🇮🇳"}</span>
                  <span>{countryCode}</span>
                  <ChevronDownIcon className="h-3.5 w-3.5 text-gray-500" />
                </div>
              </div>

              {/* Phone Input */}
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSendOtp();
                }}
                placeholder="Phone number"
                className="w-full flex-1 bg-transparent px-4 py-3.5 text-[15px] font-normal text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <p className="mt-2.5 mb-5 text-[12px] text-gray-500 leading-normal">
            We&apos;ll send your verification code on WhatsApp.{" "}
            <a href="#" className="font-semibold text-gray-900 underline hover:text-black">
              Privacy Policy
            </a>
          </p>

          <ErrorMessage error={error} />

          <button
            type="button"
            onClick={() => void handleSendOtp()}
            disabled={phone.trim().length < 6 || Boolean(submittingAction)}
            className={`w-full rounded-xl py-3.5 text-[15px] font-semibold text-white transition-all disabled:cursor-not-allowed ${
              phone.trim().length >= 6
                ? "bg-black hover:bg-gray-800"
                : "bg-[#949BA5] opacity-100"
            }`}
          >
            {submittingAction === "otp" ? (
              <span className="flex items-center justify-center gap-2">
                <SpinnerIcon className="h-4 w-4 animate-spin text-white" /> Sending code...
              </span>
            ) : (
              "Continue"
            )}
          </button>

          <div className="my-5 flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-[13px] font-normal text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={Boolean(submittingAction)}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white py-3.5 text-[14px] font-bold text-gray-800 transition-all hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GoogleIcon className="h-5 w-5 shrink-0" />
            <span>
              {submittingAction === "google" ? "Connecting Google..." : "Continue with Google"}
            </span>
          </button>
        </div>
      ) : step === "otp" ? (
        <div>
          <button
            type="button"
            onClick={handleBackToPhone}
            className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-black"
          >
            <BackIcon className="h-4 w-4" /> Change phone number
          </button>

          <h2 className="mb-1 text-[22px] font-bold text-center tracking-tight text-gray-900">
            Verify phone number
          </h2>
          <p className="mb-6 text-center text-[14px] text-gray-500">
            Enter the 6-digit code sent to{" "}
            <span className="font-semibold text-gray-900">{normalizedPhone}</span>
          </p>

          <div
            key={shakeKey}
            className={`mb-6 flex justify-center gap-2 sm:gap-2.5 ${
              isOtpError ? "animate-shake" : ""
            }`}
            onPaste={handleOtpPaste}
          >
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className={`h-12 w-10 rounded-xl border-2 text-center text-[18px] font-bold outline-none transition-all sm:h-14 sm:w-12 sm:text-[20px] ${
                  isOtpError
                    ? "border-red-500 bg-red-50 text-red-600 focus:border-red-500"
                    : digit
                    ? "border-black bg-gray-50 text-black"
                    : "border-gray-300 bg-white text-gray-900 focus:border-black"
                }`}
              />
            ))}
          </div>

          <div className="mb-6 text-center">
            {canResend ? (
              <button
                type="button"
                onClick={() => {
                  setOtp(EMPTY_OTP);
                  setIsOtpError(false);
                  void handleSendOtp();
                }}
                disabled={submittingAction === "verify"}
                className="text-[13px] font-semibold text-black underline hover:text-gray-700"
              >
                Didn&apos;t get code? Resend code
              </button>
            ) : (
              <p className="text-[13px] text-gray-500">
                Resend code in <span className="font-bold text-gray-900">{resendTimer}s</span>
              </p>
            )}
          </div>

          <ErrorMessage error={error} />

          <button
            type="button"
            onClick={() => void handleVerifyOtp()}
            disabled={otp.some((d) => d === "") || submittingAction === "verify"}
            className="w-full rounded-xl bg-black py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[#949BA5]"
          >
            {submittingAction === "verify" ? (
              <span className="flex items-center justify-center gap-2">
                <SpinnerIcon className="h-4 w-4 animate-spin text-white" /> Verifying...
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      ) : (
        <div>
          <h2 className="mb-1 text-[22px] font-bold text-center tracking-tight text-gray-900">
            Complete your profile
          </h2>
          <p className="mb-6 text-center text-[14px] text-gray-500">
            Please enter your full name to finish creating your account.
          </p>

          <div className="mb-5">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCompleteName();
              }}
              placeholder="Full Name"
              className="w-full rounded-xl border border-gray-300 bg-white p-3.5 text-[15px] font-normal text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black"
            />
          </div>

          <ErrorMessage error={error} />

          <button
            type="button"
            onClick={() => void handleCompleteName()}
            disabled={fullName.trim().length < 2 || submittingAction === "name"}
            className="w-full rounded-xl bg-black py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[#949BA5]"
          >
            {submittingAction === "name" ? (
              <span className="flex items-center justify-center gap-2">
                <SpinnerIcon className="h-4 w-4 animate-spin text-white" /> Saving...
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;

  return (
    <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-medium text-red-700">
      {error}
    </p>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14.5 8.5a4.5 4.5 0 1 1-8.63 1.75A4.5 4.5 0 0 1 14.5 8.5ZM14.5 8.5H22m-3.5 0v3.25m-3.25-3.25V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="8.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function UserAvatarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.5-7 5v1h14v-1c0-2.5-3-5-7-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M19 12H5m0 0 7-7m-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
