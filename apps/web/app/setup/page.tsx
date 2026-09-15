"use client";

import {
  FormEvent,
  useState,
} from "react";

type SetupResult = {
  success: boolean;
  error?: string;
  account?: {
    id: number;
    actorId: number;
    loginIdentifier: string;
    isActive: boolean;
  };
  actor?: {
    id: number;
    code: string;
    displayName: string;
    systemRole: string;
  };
};

export default function SetupPage() {
  const [loginIdentifier, setLoginIdentifier] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [completed, setCompleted] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const normalizedLogin =
      loginIdentifier
        .trim()
        .toLowerCase();

    if (normalizedLogin.length < 3) {
      setError(
        "El usuario debe tener al menos 3 caracteres."
      );
      return;
    }

    if (password.length < 12) {
      setError(
        "La contraseña debe tener al menos 12 caracteres."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Las contraseñas no coinciden."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "/api/auth/setup",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            loginIdentifier:
              normalizedLogin,
            password,
          }),
        }
      );

      const data =
        (await response.json()) as SetupResult;

      if (!response.ok || !data.success) {
        setError(
          data.error ??
            "No fue posible configurar la cuenta."
        );
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setCompleted(true);
    } catch {
      setError(
        "No fue posible comunicarse con LARCOOS."
      );
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-black px-6 py-16 text-white">
        <div className="mx-auto max-w-xl">
          <div className="rounded-3xl border border-emerald-700 bg-emerald-950/30 p-8">
            <div className="mb-4 inline-flex rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Authentication Active
            </div>

            <h1 className="text-3xl font-bold">
              OWNER_ADMIN configurado
            </h1>

            <p className="mt-4 text-sm leading-6 text-zinc-300">
              La cuenta administrativa
              inicial de LARCOOS fue creada
              correctamente.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-900 bg-black/40 p-5">
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Estado
              </div>

              <div className="mt-2 font-semibold text-emerald-400">
                Cuenta protegida y activa
              </div>
            </div>

            <p className="mt-6 text-xs leading-5 text-zinc-500">
              La contraseña no se muestra
              ni se almacena en texto plano.
              El setup inicial queda cerrado
              después de crear la primera
              cuenta.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-xl">
        <div className="mb-8">
          <div className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            LARCOOS Kernel
          </div>

          <h1 className="mt-3 text-4xl font-bold">
            Initial Security Setup
          </h1>

          <p className="mt-4 leading-7 text-zinc-400">
            Crea las credenciales de acceso
            para la identidad principal
            OWNER_ADMIN de LARCOOS.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl"
        >
          <div className="mb-6 rounded-2xl border border-zinc-800 bg-black p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              System Identity
            </div>

            <div className="mt-2 font-semibold">
              LARCO-ADMIN-001
            </div>

            <div className="mt-1 text-sm text-zinc-400">
              OWNER_ADMIN
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-zinc-300">
              Usuario
            </span>

            <input
              type="text"
              value={loginIdentifier}
              onChange={(event) =>
                setLoginIdentifier(
                  event.target.value
                )
              }
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-500 disabled:opacity-50"
              placeholder="Tu usuario de LARCOOS"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-zinc-300">
              Contraseña
            </span>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              autoComplete="new-password"
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-500 disabled:opacity-50"
              placeholder="Mínimo 12 caracteres"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-zinc-300">
              Confirmar contraseña
            </span>

            <input
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              autoComplete="new-password"
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-500 disabled:opacity-50"
              placeholder="Escríbela nuevamente"
            />
          </label>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full rounded-xl bg-emerald-500 px-5 py-3 font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Configurando..."
              : "Create OWNER_ADMIN Account"}
          </button>

          <p className="mt-5 text-xs leading-5 text-zinc-500">
            Tus credenciales se envían
            directamente al backend local de
            LARCOOS. No las escribas en Git,
            PowerShell ni en este chat.
          </p>
        </form>
      </div>
    </main>
  );
}