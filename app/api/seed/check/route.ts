import { NextResponse } from "next/server";
import { callSparkImages } from "../../../../lib/ai/meta";
import { allowSnap, clientIp } from "../../../../lib/rate/window";
import { COACH_TIMEOUT_MS, coachPrompt, parseCoach, type CoachRead } from "../../../../lib/seed/coach";
import { coachJpeg } from "../../../../lib/seed/jpeg";
import { createClient } from "../../../../lib/supabase/server";

export const maxDuration = 15;

function earlierShots(raw: FormDataEntryValue | null): { index: number; contains: string[] }[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const shots: { index: number; contains: string[] }[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const index = (item as { index?: unknown }).index;
      const contains = (item as { contains?: unknown }).contains;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 1) continue;
      const list = Array.isArray(contains) ? contains.filter((entry): entry is string => typeof entry === "string") : [];
      shots.push({ index, contains: list });
    }
    return shots;
  } catch {
    return [];
  }
}

async function within(work: Promise<CoachRead | null>, ms: number): Promise<CoachRead | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const samples = new URL(request.url).searchParams.get("samples") === "1";
  if (samples) return NextResponse.json(null);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(null);
  }
  if (form.get("samples") === "1") return NextResponse.json(null);

  if (!(await allowSnap(clientIp(request), data.user.id))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size < 1) return NextResponse.json(null);
  const indexRaw = Number(form.get("index"));
  const index = Number.isInteger(indexRaw) && indexRaw >= 1 ? indexRaw : 1;
  const previous = earlierShots(form.get("previous"));

  const read = await within(
    (async () => {
      try {
        const jpeg = await coachJpeg(Buffer.from(await image.arrayBuffer()));
        const spark = await callSparkImages({
          prompt: coachPrompt(index, previous),
          images: [{ label: "photo " + index, imageDataUrl: "data:image/jpeg;base64," + jpeg.toString("base64") }],
          maxOutputTokens: 400,
        });
        return parseCoach(spark.raw, index);
      } catch {
        return null;
      }
    })(),
    COACH_TIMEOUT_MS,
  );

  return NextResponse.json(read);
}
