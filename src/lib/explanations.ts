import { KIND_LABEL, ROOM_TYPE_LABEL, type RoomType, type SessionKind } from "./constants";

export type PlacementRationaleInput = {
  courseCode: string;
  kind: SessionKind;
  isFixed: boolean;
  combined: boolean;
  roomCode: string;
  roomType: RoomType;
  roomCapacity: number;
  students: number;
  issueCount: number;
  alternativeCount: number;
  alternativesCapped?: boolean;
};

export type PlacementRationale = { headline: string; facts: string[] };

/**
 * Human-readable facts only. This never claims a mathematical cause that the
 * scheduling engine cannot prove, and it keeps hard validity separate from the
 * heuristic used to choose among valid placements.
 */
export function explainPlacement(input: PlacementRationaleInput): PlacementRationale {
  const facts: string[] = [];
  let headline: string;

  if (input.issueCount > 0) {
    headline = `This placement currently has ${input.issueCount} validation issue${input.issueCount === 1 ? "" : "s"} and should be reviewed.`;
    facts.push("The explanation below describes the intended placement; the validation panel remains the source of truth.");
  } else if (input.isFixed) {
    headline = `${input.courseCode} is pinned, so every regenerated timetable must preserve this day, period and room.`;
    facts.push("Fixed sessions are hard constraints, not preferences the generator may trade away.");
  } else if (input.alternativeCount === 0) {
    headline = `The current alternative search found no other hard-valid placement for ${input.courseCode}.`;
  } else {
    const count = input.alternativesCapped ? `at least ${input.alternativeCount}` : String(input.alternativeCount);
    headline = `${input.courseCode} has ${count} other hard-valid placement${input.alternativeCount === 1 ? "" : "s"}; this is the placement selected in the published version.`;
  }

  if (input.issueCount === 0) {
    facts.push("Faculty, student groups and the room are all clash-free for every occupied period.");
  }
  facts.push(`${input.roomCode} is a ${ROOM_TYPE_LABEL[input.roomType].toLowerCase()} with ${input.roomCapacity} seats for ${input.students} students.`);
  if (input.kind === "lab") facts.push("The laboratory uses a compatible lab room and a valid contiguous teaching block.");
  else facts.push(`The room supports this ${KIND_LABEL[input.kind].toLowerCase()} and meets its capacity requirement.`);
  if (input.combined) facts.push("All combined student groups share this placement, so their availability is checked together.");
  if (!input.isFixed) facts.push("Among hard-valid choices, the generator spreads group/faculty load, avoids penalized periods and prefers a right-sized room; it evaluates the timetable globally, not one class in isolation.");
  facts.push("A move is still re-validated at request and approval time because availability can change.");

  return { headline, facts };
}
