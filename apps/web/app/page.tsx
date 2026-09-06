import { redirect } from "next/navigation";
import { validSessionOrNull } from "@/lib/auth-guard";

export default async function Home() {
  redirect((await validSessionOrNull()) ? "/dashboard" : "/login");
}
