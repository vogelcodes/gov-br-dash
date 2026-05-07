import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAddUasg, useRemoveUasg, useUasgs } from "../api/queries";
import { ApiError } from "../api/client";

export function UasgList() {
  const { data, isLoading } = useUasgs();
  const add = useAddUasg();
  const remove = useRemoveUasg();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = data?.uasgs ?? [];

  const submit = () => {
    setError(null);
    const value = codigo.trim();
    if (!value) {
      setError("Informe o código da UASG.");
      return;
    }
    add.mutate(value, {
      onSuccess: () => setCodigo(""),
      onError: (err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError("Erro ao adicionar UASG.");
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-1">Minhas UASGs</h1>
      <p className="text-sm text-slate-500 mb-6">
        Cadastre até 3 UASGs para acompanhar atas de registro de preços
      </p>

      <div className="bg-white border border-slate-200 rounded-md p-4 mb-4">
        {error && (
          <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        <label className="block text-xs text-slate-500 mb-1" htmlFor="uasg">
          Código UASG
        </label>
        <div className="flex gap-2">
          <input
            id="uasg"
            type="text"
            value={codigo}
            maxLength={6}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="flex-1 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-govbr-blue"
            placeholder="ex: 160292"
          />
          <button
            type="button"
            onClick={submit}
            disabled={add.isPending}
            className="btn-primary"
          >
            {add.isPending ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-sm text-slate-500 py-4">
          Carregando…
        </div>
      )}
      {!isLoading && list.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-md p-6 text-center text-sm text-slate-500">
          Nenhuma UASG cadastrada
        </div>
      )}
      <ul className="space-y-2">
        {list.map((u) => (
          <li
            key={u.codigoUasg}
            className="flex items-center bg-white border border-slate-200 rounded p-3 hover:border-govbr-blue"
          >
            <Link
              to="/uasg/$codigoUasg"
              params={{ codigoUasg: u.codigoUasg }}
              className="flex-1 min-w-0"
            >
              <div className="font-semibold text-govbr-blue tabular-nums">
                {u.codigoUasg}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {u.nomeUasg ?? ""}
              </div>
            </Link>
            <button
              type="button"
              onClick={() => remove.mutate(u.codigoUasg)}
              disabled={remove.isPending}
              className="text-red-700 px-2 py-1 text-sm hover:bg-red-50 rounded"
              aria-label="Remover"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
