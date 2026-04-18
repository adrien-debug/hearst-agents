import { NextResponse } from "next/server";
import { calendarConnector } from "@/lib/connectors";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "not_authenticated", message: "Connectez votre compte Google." },
      { status: 401 },
    );
  }

  try {
    const result = await calendarConnector.getEvents(userId, 7);
    return NextResponse.json({ events: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "not_authenticated" || message === "token_revoked") {
      return NextResponse.json(
        { error: message, message: message === "token_revoked"
          ? "Accès révoqué. Reconnectez votre compte Google."
          : "Connectez votre compte Google." },
        { status: 401 },
      );
    }

    console.error("[Calendar API] Error:", message);

    if (message.includes("has not been used in project") || message.includes("is disabled")) {
      return NextResponse.json(
        { error: "api_not_enabled", message: "L'API Google Agenda n'est pas activée. Activez-la dans la console Google Cloud." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "calendar_error", message: "Erreur de lecture Google Agenda." },
      { status: 502 },
    );
  }
}
