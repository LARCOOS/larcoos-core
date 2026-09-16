"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  success?: boolean;
  error?: string;
  actor?: {
    id: number;
    code: string;
    displayName: string;
  };
};

export default function LoginPage() {
  const router = useRouter();

  const [loginIdentifier, setLoginIdentifier] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(
      event.currentTarget
    );

    const submittedLoginIdentifier =
      String(
        formData.get("loginIdentifier") ?? ""
      ).trim();

    const submittedPassword =
      String(
        formData.get("password") ?? ""
      );

    if (
      !submittedLoginIdentifier ||
      !submittedPassword
    ) {
      setError(
        "Enter your login and password"
      );

      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            loginIdentifier:
              submittedLoginIdentifier,
            password: submittedPassword,
          }),
        }
      );

      const data =
        (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to sign in"
        );

        return;
      }

      /*
       * The authentication token is never exposed
       * to browser JavaScript.
       *
       * /api/auth/login creates the secure HttpOnly
       * LARCOOS session cookie.
       *
       * The root dashboard resolves the authenticated
       * Actor and authorized OrganizationMemberships.
       */
      setPassword("");

      router.replace("/");
      router.refresh();
    } catch {
      setError(
        "Unable to connect to LARCOOS authentication"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
        <section className="w-full rounded-3xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
          <div className="mb-8">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
              LARCOOS Kernel
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              Sign in
            </h1>

            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Secure access to your LARCOOS
              organizations and workspaces.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="loginIdentifier"
                className="mb-2 block text-sm font-medium text-neutral-300"
              >
                Login
              </label>

              <input
                id="loginIdentifier"
                name="loginIdentifier"
                type="text"
                autoComplete="username"
                value={loginIdentifier}
                onChange={(event) =>
                  setLoginIdentifier(
                    event.target.value
                  )
                }
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-neutral-300"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? "Signing in..."
                : "Sign in to LARCOOS"}
            </button>
          </form>

          <div className="mt-8 border-t border-neutral-800 pt-5 text-xs leading-5 text-neutral-500">
            Authentication identifies you.
            Organization membership determines
            what you are authorized to access
            inside each LARCOOS workspace.
          </div>
        </section>
      </div>
    </main>
  );
}