/**
 * app/page.tsx — Root redirect
 * Sends users directly to the main dashboard.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
