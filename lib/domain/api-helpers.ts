import { NextResponse } from "next/server";
import type { ZodSchema, ZodError } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function err(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function parseBody<T>(schema: ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = (result.error as ZodError).issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      success: false,
      response: err(`Validation failed: ${issues}`, 422),
    };
  }
  return { success: true, data: result.data };
}

export function dbErr(context: string, error: { code?: string; message: string }) {
  console.error(`${context}:`, error.code, error.message);
  const status = error.code === "PGRST116" ? 404 : 500;
  return err(error.message, status);
}
