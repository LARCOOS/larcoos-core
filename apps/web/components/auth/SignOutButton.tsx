"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setError(null);
    setIsSigningOut(true);

    try {
      const response = await fetch(
        "/api/auth/logout",
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      if (!response.ok) {
        setError("Unable to sign out");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError(
        "Unable to connect to LARCOOS authentication"
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:border-red-900 hover:bg-red-950/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSigningOut
          ? "Signing out..."
          : "Sign Out"}
      </button>

      {error ? (
        <div className="mt-2 text-xs text-red-400">
          {error}
        </div>
      ) : null}
    </div>
  );
}