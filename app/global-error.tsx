"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * Global Error Boundary — catche les erreurs qui escape les error
 * boundaries normaux (root layout, render errors). Sentry les capture
 * automatiquement.
 *
 * Required: "use client" en première ligne — sinon le boundary ne se
 * monte pas côté client.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
