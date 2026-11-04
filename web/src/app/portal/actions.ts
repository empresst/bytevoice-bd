"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function signIn(_: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return "Wrong email or password.";
  redirect("/portal");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/portal/login");
}

/** Staff mark a callback as handled. RLS only allows this for their own clinic. */
export async function resolveCallback(form: FormData) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from("callbacks")
    .update({ status: "done", resolved_at: new Date().toISOString(), resolved_by: user?.id })
    .eq("id", String(form.get("id")));
  revalidatePath("/portal/callbacks");
  revalidatePath("/portal");
}
