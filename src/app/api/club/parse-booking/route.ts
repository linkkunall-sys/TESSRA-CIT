import { db } from "@/db";
import * as t from "@/db/schema";
import type { RoomRow } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { parsePlainLanguageBooking } from "@/lib/booking-parser";
import { buildBookingAnalyzer } from "@/lib/engine";
import { getSettings } from "@/lib/queries";
import { addDaysIso, parseIso, todayIso, toMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function normalizedCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function supportsNeeds(room: RoomRow, needs: string[], accessible: boolean) {
  if (accessible && !room.accessible) return false;
  const features = new Set(room.features.map((f) => f.toLowerCase()));
  return needs.every((need) => {
    switch (need) {
      case "Accessibility":
        return room.accessible;
      case "Microphones":
        return features.has("audio system");
      case "Wi-Fi access":
        return features.has("wi-fi");
      case "Recording":
        return features.has("recording") || features.has("lecture capture");
      default:
        return features.has(need.toLowerCase());
    }
  });
}

function roomProblem(room: RoomRow, attendees: number | null, needs: string[], accessible: boolean) {
  const problems: string[] = [];
  if (room.status !== "active") problems.push(`${room.code} is not active`);
  if (attendees && room.capacity < attendees) problems.push(`${room.code} seats ${room.capacity}, below the requested ${attendees}`);
  if (accessible && !room.accessible) problems.push(`${room.code} is not wheelchair accessible`);
  if (!supportsNeeds(room, needs, accessible)) problems.push(`${room.code} does not provide every requested facility`);
  return problems;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, message: "Sign in to parse a booking request." }, 401);
  if (user.role !== "club" && user.role !== "coordinator") {
    return json({ ok: false, message: "Venue requests are available to club and department accounts." }, 403);
  }

  let body: { text?: unknown };
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return json({ ok: false, message: "The request body must be valid JSON." }, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (text.length < 5) return json({ ok: false, message: "Describe the event, date, time and expected attendance." }, 400);

  const [settings, rooms] = await Promise.all([getSettings(), db.select().from(t.rooms)]);
  const today = todayIso();
  const leadDays = user.role === "club" ? settings.bookingLeadDays : 0;
  const minDate = addDaysIso(today, leadDays);
  const mode = user.role === "club" ? "club" : "department";
  const draft = parsePlainLanguageBooking({ text, today, minDate, maxHours: settings.maxBookingHours, mode });

  const eligible = rooms.filter((room) => {
    if (user.role === "club") return room.bookable || room.type === "lab";
    return ["lecture", "seminar", "auditorium", "outdoor"].includes(room.type);
  });
  const warnings: string[] = [...draft.policyNotices];
  const followUp = [...draft.followUp];
  if (draft.date && !settings.allowWeekendBookings && [0, 6].includes(parseIso(draft.date).getDay())) {
    followUp.push("Weekend bookings are disabled by campus policy; choose a weekday.");
  }
  let requested: RoomRow | null = null;

  if (draft.roomCodeHint) {
    requested = eligible.find((r) => normalizedCode(r.code) === normalizedCode(draft.roomCodeHint ?? "")) ?? null;
    if (!requested) warnings.push(`The named venue “${draft.roomCodeHint}” is not available to this account; a suitable alternative was searched.`);
  }

  const matching = eligible
    .filter((room) => room.status === "active")
    .filter((room) => !draft.attendees || room.capacity >= draft.attendees)
    .filter((room) => !draft.roomTypeHints.length || draft.roomTypeHints.includes(room.type))
    .filter((room) => supportsNeeds(room, draft.needs, draft.accessible))
    .sort((a, b) => {
      if (draft.preferRoomTypeOrder) {
        const typeOrder = draft.roomTypeHints.indexOf(a.type) - draft.roomTypeHints.indexOf(b.type);
        if (typeOrder) return typeOrder;
      }
      return a.capacity - b.capacity || a.code.localeCompare(b.code);
    });

  if (requested) {
    const problems = roomProblem(requested, draft.attendees, draft.needs, draft.accessible);
    if (problems.length) warnings.push(`${problems.join("; ")}. A compatible alternative was searched.`);
  }

  const ordered = requested && !roomProblem(requested, draft.attendees, draft.needs, draft.accessible).length
    ? [requested, ...matching.filter((r) => r.id !== requested?.id)]
    : matching;

  let selected: RoomRow | null = ordered[0] ?? null;
  if (selected && draft.date && draft.startTime && draft.endTime && draft.attendees) {
    const analyzer = await buildBookingAnalyzer();
    let conflictMessages: string[] = [];
    let conflictFree: RoomRow | null = null;
    for (const room of ordered) {
      const conflicts = analyzer
        .check({ roomId: room.id, date: draft.date, startTime: draft.startTime, endTime: draft.endTime, attendees: draft.attendees })
        .filter((c) => c.severity === "error");
      if (!conflicts.length) {
        conflictFree = room;
        break;
      }
      if (room.id === selected.id) conflictMessages = conflicts.map((c) => c.message);
    }
    if (conflictFree) {
      if (conflictFree.id !== selected.id && conflictMessages.length) {
        warnings.push(`${selected.code} conflicts at that time (${conflictMessages[0]}), so ${conflictFree.code} was proposed instead.`);
      }
      selected = conflictFree;
    } else if (conflictMessages.length) {
      warnings.push(`Matching venues currently conflict at that time: ${conflictMessages[0]}. Choose a different time or venue.`);
      selected = null;
    }
  }

  if (!selected) {
    followUp.push(
      draft.attendees
        ? "No active venue matches the stated capacity, type, facilities and time. Adjust one of those details in the form."
        : "Choose a venue after entering the expected attendance.",
    );
  } else if (!requested) {
    draft.assumptions.push(`${selected.code} (${selected.capacity} seats) was proposed as the smallest suitable active venue.`);
  }

  const durationMinutes = draft.startTime && draft.endTime ? toMinutes(draft.endTime) - toMinutes(draft.startTime) : null;
  const dateAllowed = Boolean(draft.date && draft.date >= minDate);
  const durationAllowed = durationMinutes !== null && durationMinutes > 0 && durationMinutes <= settings.maxBookingHours * 60;
  const weekdayAllowed = Boolean(draft.date && (settings.allowWeekendBookings || ![0, 6].includes(parseIso(draft.date).getDay())));

  const proposal = {
    title: draft.title,
    category: draft.category,
    description: draft.description,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    attendees: draft.attendees,
    roomId: selected?.id ?? null,
    roomCode: selected?.code ?? draft.roomCodeHint,
    needs: draft.needs,
    priority: user.role === "club" ? "normal" : "high",
    assumptions: [...new Set(draft.assumptions)],
    followUp: [...new Set(followUp)],
    warnings: [...new Set(warnings)],
    canSubmit: Boolean(draft.date && draft.startTime && draft.endTime && draft.attendees && selected && dateAllowed && durationAllowed && weekdayAllowed),
  };

  return json({
    ok: true,
    proposal,
    policy: {
      role: user.role,
      categoryCeiling: user.role === "club" ? "Club event" : "Department event",
      leadDays,
      maxHours: settings.maxBookingHours,
      note: "Language parsing only fills an editable draft. Server-side conflict and role checks run again when you submit.",
    },
  });
}
