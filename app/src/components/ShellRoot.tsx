import { Layout } from "@/components/Layout";
import { ShellLayout } from "@/components/ShellLayout";
import { useShellPreference } from "@/hooks/useShellPreference";

// Picks which shell renders for the main route element. Both shells render
// <Outlet /> internally, so the child routes don't change either way.
export function ShellRoot() {
  const [choice] = useShellPreference();
  return choice === "new" ? <ShellLayout /> : <Layout />;
}
