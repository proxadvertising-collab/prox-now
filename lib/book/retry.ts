"use server";

import { redirect } from "next/navigation";
import { POST as postBookPages } from "../../app/api/book/pages/route";

export async function retryReading(formData: FormData) {
  const shop = String(formData.get("shop") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const form = new FormData();
  form.set("shop", shop);
  form.set("retry", "1");
  await postBookPages(new Request("http://localhost/api/book/pages", { method: "POST", body: form }));
  redirect("/book/" + encodeURIComponent(slug || shop));
}
