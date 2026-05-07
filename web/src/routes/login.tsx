import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthForm } from "../components/AuthForm";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  return <AuthForm onSuccess={() => navigate({ to: "/" })} />;
}
