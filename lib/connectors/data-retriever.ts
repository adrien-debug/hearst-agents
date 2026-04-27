/**
 * Data Retriever — Service de récupération et injection de données réelles
 *
 * Ce service récupère les données depuis les connecteurs OAuth (Gmail, Calendar, Drive)
 * et les formate pour injection dans le contexte LLM.
 */

import { getTokens } from "@/lib/platform/auth/tokens";

// ── Types ───────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  attendees?: string[];
  isAllDay: boolean;
}

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  snippet: string;
  isUnread: boolean;
  hasAttachments: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
  webViewLink?: string;
}

export interface UserDataContext {
  hasCalendarAccess: boolean;
  hasGmailAccess: boolean;
  hasDriveAccess: boolean;
  events?: CalendarEvent[];
  emails?: EmailMessage[];
  files?: DriveFile[];
  formattedForLLM: string;
}

/** Per-provider progress callback. The retriever invokes `start` before each
 * provider read and `end` after, regardless of success/failure — the caller
 * uses this to surface live tool-call events to the UI. */
export interface RetrieveProgress {
  start: (provider: "calendar" | "gmail" | "drive") => void;
  end: (provider: "calendar" | "gmail" | "drive", ok: boolean) => void;
}

// ── Main Service ────────────────────────────────────────────

export class DataRetriever {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Récupère toutes les données disponibles pour l'utilisateur.
   * The optional `progress` callback receives start/end events per provider
   * so the caller can surface live tool-call events in the run timeline.
   */
  async retrieveAll(progress?: RetrieveProgress): Promise<UserDataContext> {
    const context: UserDataContext = {
      hasCalendarAccess: false,
      hasGmailAccess: false,
      hasDriveAccess: false,
      formattedForLLM: "",
    };

    // Check Google tokens
    const googleTokens = await getTokens(this.userId, "google");
    const hasGoogleAccess = !!googleTokens?.accessToken;

    if (hasGoogleAccess) {
      // hasXxxAccess = true dès que le token Google est valide (indépendant du nb de résultats)
      context.hasCalendarAccess = true;
      context.hasGmailAccess = true;
      context.hasDriveAccess = true;

      // Récupérer les événements du calendrier pour aujourd'hui
      progress?.start("calendar");
      try {
        context.events = await this.getTodayEvents();
        progress?.end("calendar", true);
      } catch (err) {
        console.error("[DataRetriever] Failed to fetch calendar:", err);
        context.hasCalendarAccess = false;
        progress?.end("calendar", false);
      }

      // Récupérer les emails récents
      progress?.start("gmail");
      try {
        context.emails = await this.getRecentEmails(10);
        progress?.end("gmail", true);
      } catch (err) {
        console.error("[DataRetriever] Failed to fetch emails:", err);
        context.hasGmailAccess = false;
        progress?.end("gmail", false);
      }

      // Récupérer les fichiers récents
      progress?.start("drive");
      try {
        context.files = await this.getRecentFiles(5);
        progress?.end("drive", true);
      } catch (err) {
        console.error("[DataRetriever] Failed to fetch drive files:", err);
        context.hasDriveAccess = false;
        progress?.end("drive", false);
      }
    }

    // Formatter pour le LLM
    context.formattedForLLM = this.formatForLLM(context);

    return context;
  }

  // Inner methods let errors propagate so retrieveAll can flip
  // hasXxxAccess and emit progress.end(_, false) for the UI.

  private async getTodayEvents(): Promise<CalendarEvent[]> {
    const { getTodayEvents } = await import("./google/calendar");
    return getTodayEvents(this.userId, 10);
  }

  private async getRecentEmails(limit: number): Promise<EmailMessage[]> {
    const { getRecentEmails } = await import("./google/gmail");
    const messages = await getRecentEmails(this.userId, limit);
    return messages.map((e) => ({
      id: e.id,
      subject: e.subject,
      from: e.sender,
      to: [],
      date: e.date,
      snippet: e.snippet,
      isUnread: !e.isRead,
      hasAttachments: false,
    }));
  }

  private async getRecentFiles(limit: number): Promise<DriveFile[]> {
    const { getRecentFiles } = await import("./google/drive");
    return getRecentFiles(this.userId, limit);
  }

  /**
   * Formate les données pour injection dans le prompt LLM
   */
  private formatForLLM(context: UserDataContext): string {
    const parts: string[] = [];

    if (context.hasCalendarAccess) {
      parts.push("📅 ÉVÉNEMENTS DU CALENDRIER AUJOURD'HUI:");
      parts.push("");
      if (context.events && context.events.length > 0) {
        for (const event of context.events.slice(0, 5)) {
          const time = event.isAllDay ? "Toute la journée" : `${event.startTime} - ${event.endTime}`;
          parts.push(`• ${time}: ${event.title}`);
          if (event.location) parts.push(`  📍 ${event.location}`);
          if (event.attendees && event.attendees.length > 0) {
            parts.push(`  👥 ${event.attendees.join(", ")}`);
          }
          parts.push("");
        }
      } else {
        parts.push("• Aucun événement prévu aujourd'hui.");
        parts.push("");
      }
    }

    if (context.hasGmailAccess) {
      parts.push("📧 EMAILS RÉCENTS:");
      parts.push("");
      if (context.emails && context.emails.length > 0) {
        const unreadCount = context.emails.filter(e => e.isUnread).length;
        if (unreadCount > 0) {
          parts.push(`⚠️ ${unreadCount} email(s) non lu(s)`);
          parts.push("");
        }
        for (const email of context.emails.slice(0, 5)) {
          const prefix = email.isUnread ? "🔴" : "📧";
          parts.push(`${prefix} ${email.from}: ${email.subject}`);
          if (email.snippet) {
            parts.push(`   "${email.snippet.slice(0, 100)}${email.snippet.length > 100 ? "..." : ""}"`);
          }
          parts.push("");
        }
      } else {
        parts.push("• Aucun email récent.");
        parts.push("");
      }
    }

    if (context.hasDriveAccess) {
      parts.push("📁 FICHIERS RÉCENTS:");
      parts.push("");
      if (context.files && context.files.length > 0) {
        for (const file of context.files.slice(0, 5)) {
          const emoji = this.getFileEmoji(file.mimeType);
          parts.push(`• ${emoji} ${file.name}`);
        }
      } else {
        parts.push("• Aucun fichier récent trouvé.");
      }
      parts.push("");
    }

    if (parts.length === 0) {
      return "🔌 Aucune donnée externe disponible. L'utilisateur n'est pas connecté à Google ou les données n'ont pas pu être récupérées.";
    }

    return parts.join("\n");
  }

  private getFileEmoji(mimeType: string): string {
    if (mimeType.includes("folder")) return "📁";
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("document")) return "📝";
    if (mimeType.includes("spreadsheet")) return "📊";
    if (mimeType.includes("presentation")) return "🎞️";
    if (mimeType.includes("image")) return "🖼️";
    return "📎";
  }
}

// ── Helper Functions ──────────────────────────────────────

export async function retrieveUserDataContext(
  userId: string,
  progress?: RetrieveProgress,
): Promise<UserDataContext> {
  const retriever = new DataRetriever(userId);
  return retriever.retrieveAll(progress);
}

/**
 * Détecte si la requête utilisateur concerne des données externes
 */
export function detectDataIntent(message: string): {
  needsCalendar: boolean;
  needsGmail: boolean;
  needsDrive: boolean;
} {
  const lower = message.toLowerCase();
  
  const calendarKeywords = [
    "calendrier", "agenda", "rendez-vous", "réunion", "meeting",
    "événement", "event", "planning", "disponible", "créneau",
    "aujourd'hui", "demain", "cette semaine",
  ];
  
  const gmailKeywords = [
    "email", "mail", "message", "boîte", "inbox", "unread", "non lu",
    "gmail", "correspondance", "écrire", "envoyer", "répondre",
  ];
  
  const driveKeywords = [
    "fichier", "file", "document", "doc", "drive", "dossier",
    "folder", "pdf", "sheet", "slide", "présentation",
  ];

  return {
    needsCalendar: calendarKeywords.some(k => lower.includes(k)),
    needsGmail: gmailKeywords.some(k => lower.includes(k)),
    needsDrive: driveKeywords.some(k => lower.includes(k)),
  };
}
