import { createFileRoute } from "@tanstack/react-router";
import { UasgList } from "../components/UasgList";

export const Route = createFileRoute("/")({
  component: UasgList,
});
