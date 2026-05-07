import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useLogout, useMe } from "../api/queries";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { data, isLoading } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onLogin = path.startsWith("/login");
  const isAuthed = !!data?.user;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthed && !onLogin) {
      navigate({ to: "/login", replace: true });
    } else if (isAuthed && onLogin) {
      navigate({ to: "/", replace: true });
    }
  }, [isAuthed, isLoading, onLogin, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      {isAuthed && (
        <header className="bg-govbr-navy text-white px-6 py-2 flex items-center gap-4 text-xs">
          <Link to="/" className="font-semibold tracking-wider">
            UASG
          </Link>
          <span className="opacity-60">/</span>
          <span>Tracker</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="opacity-80">{data!.user!.email}</span>
            <button
              type="button"
              onClick={() => {
                logout.mutate(undefined, {
                  onSuccess: () => navigate({ to: "/login", replace: true }),
                });
              }}
              className="px-2 py-1 rounded border border-white/30 hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </header>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
