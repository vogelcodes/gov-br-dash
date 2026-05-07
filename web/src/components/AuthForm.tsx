import { useState } from "react";
import { useLogin, useSignup } from "../api/queries";
import { ApiError } from "../api/client";

export function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const signup = useSignup();
  const isPending = login.isPending || signup.isPending;

  const handleError = (err: unknown) => {
    if (err instanceof ApiError) setError(err.message);
    else if (err instanceof Error) setError(err.message);
    else setError("Erro inesperado");
  };

  const submit = (mode: "login" | "signup") => {
    setError(null);
    if (!email || !password) {
      setError("Preencha email e senha.");
      return;
    }
    if (mode === "signup" && password.length < 12) {
      setError("Senha precisa de no mínimo 12 caracteres.");
      return;
    }
    const fn = mode === "login" ? login : signup;
    fn.mutate({ email: email.trim(), password }, {
      onSuccess: () => onSuccess(),
      onError: handleError,
    });
  };

  return (
    <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-md p-6 mt-12">
      <h1 className="text-2xl font-semibold mb-1">gov-br-dash</h1>
      <p className="text-sm text-slate-500 mb-6">
        Dados públicos do governo federal
      </p>
      {error && (
        <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      <label className="block text-xs text-slate-500 mb-1" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        className="w-full px-3 py-2 border border-slate-300 rounded mb-3 focus:outline-none focus:border-govbr-blue"
        placeholder="seu@email.com"
      />
      <label className="block text-xs text-slate-500 mb-1" htmlFor="password">
        Senha
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit("login");
        }}
        className="w-full px-3 py-2 border border-slate-300 rounded mb-4 focus:outline-none focus:border-govbr-blue"
        placeholder="mínimo 12 caracteres"
      />
      <button
        type="button"
        onClick={() => submit("login")}
        disabled={isPending}
        className="btn-primary w-full mb-2"
      >
        {login.isPending ? "Entrando…" : "Entrar"}
      </button>
      <button
        type="button"
        onClick={() => submit("signup")}
        disabled={isPending}
        className="btn-secondary w-full"
      >
        {signup.isPending ? "Criando…" : "Criar conta"}
      </button>
    </div>
  );
}
