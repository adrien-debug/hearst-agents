import { parseDocumentBuffer } from "@/lib/capabilities/providers/llamaparse";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "Fichier manquant" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return Response.json({ error: "Seuls les PDF sont supportés" }, { status: 400 });
  }

  const fileName = file instanceof File ? file.name : "document.pdf";

  try {
    const buffer = await file.arrayBuffer();
    const { markdown, pages } = await parseDocumentBuffer(buffer, fileName, file.type);
    return Response.json({ text: markdown, pageCount: pages, fileName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: "Échec du parsing", details: message }, { status: 500 });
  }
}
