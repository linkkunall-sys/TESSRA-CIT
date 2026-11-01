import type { RoomType } from "./constants";
import { addDaysIso, parseIso } from "./utils";

export type BookingParseDraft = {
  title: string;
  category: string;
  description: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  attendees: number | null;
  roomCodeHint: string | null;
  roomTypeHints: RoomType[];
  preferRoomTypeOrder: boolean;
  needs: string[];
  accessible: boolean;
  assumptions: string[];
  policyNotices: string[];
  followUp: string[];
  recurring: boolean;
};

export type BookingParseInput = {
  text: string;
  today: string;
  minDate: string;
  maxHours: number;
  mode: "club" | "department";
};

const DAY_ALIASES: { day: number; words: string[] }[] = [
  { day: 0, words: ["monday", "mon", "somwar", "somvaar"] },
  { day: 1, words: ["tuesday", "tue", "tues", "mangalwar", "mangalvaar"] },
  { day: 2, words: ["wednesday", "wed", "budhwar", "budhvaar"] },
  { day: 3, words: ["thursday", "thu", "thurs", "guruwar", "guruvaar", "brihaspativar"] },
  { day: 4, words: ["friday", "fri", "shukrawar", "shukravar", "shukravaar"] },
  { day: 5, words: ["saturday", "sat", "shanivar", "shanivaar"] },
  { day: 6, words: ["sunday", "sun", "ravivar", "ravivaar"] },
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const timeString = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** English and common Romanised-Hindi number words used in booking requests. */
const NUMBER_WORD_VALUES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  cheh: 6,
  che: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  barah: 12,
  bees: 20,
  tees: 30,
  chalis: 40,
  chaalis: 40,
  pachas: 50,
  pachaas: 50,
  saath: 60,
  sattar: 70,
  assi: 80,
  nabbe: 90,
  sau: 100,
  dedh: 1.5,
};
const NUMBER_WORD = Object.keys(NUMBER_WORD_VALUES).sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
const NUMBER_PHRASE = `(?:${NUMBER_WORD})(?:(?:\\s+|-)+(?:and\\s+)?(?:${NUMBER_WORD})){0,4}`;

function numberPhraseValue(raw: string) {
  const normalized = raw.toLowerCase().replace(/-/g, " ").trim();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (/^(?:one and a half|one-and-a-half)$/.test(raw.toLowerCase().trim())) return 1.5;
  const tokens = normalized.split(/\s+/).filter((token) => token !== "and" && token !== "of");
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    const value = NUMBER_WORD_VALUES[token];
    if (value === undefined) return null;
    if (value === 100) current = (current || 1) * 100;
    else if (value === 1000) {
      total += (current || 1) * 1000;
      current = 0;
    } else current += value;
  }
  return total + current;
}

/** Convert number words only when their booking context is unambiguous. */
function normalizeContextNumbers(text: string) {
  const context = "(?:people|persons|participants|students|attendees|audience|visitors|spectators|guests|dancers|learners|log|logon|seats|hours?|hrs?|hr|minutes?|mins?|ghante?|ghanta|minute|a\\.?m\\.?|p\\.?m\\.?|baje|bje|to|till|until|se|tak)";
  const pattern = new RegExp(`\\b(${NUMBER_PHRASE})(?=\\s*(?:\\+\\s*)?(?:-\\s*)?${context}\\b)`, "gi");
  const expanded = text.replace(/\bone(?:-|\s+)and(?:-|\s+)a(?:-|\s+)half(?=\s*(?:-\s*)?(?:hours?|hrs?|hr)\b)/gi, "1.5");
  return expanded.replace(pattern, (match) => {
    const value = numberPhraseValue(match);
    return value === null ? match : String(value);
  });
}

function isRealIso(iso: string) {
  const d = parseIso(iso);
  return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === iso;
}

function explicitDate(text: string, today: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const value = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isRealIso(value) ? value : null;
  }

  const named = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i,
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2].toLowerCase()];
    let year = named[3] ? Number(named[3]) : parseIso(today).getFullYear();
    let value = `${year}-${pad(month)}-${pad(day)}`;
    if (!named[3] && value < today) {
      year += 1;
      value = `${year}-${pad(month)}-${pad(day)}`;
    }
    return isRealIso(value) ? value : null;
  }

  const monthFirst = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i,
  );
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const day = Number(monthFirst[2]);
    let year = monthFirst[3] ? Number(monthFirst[3]) : parseIso(today).getFullYear();
    let value = `${year}-${pad(month)}-${pad(day)}`;
    if (!monthFirst[3] && value < today) {
      year += 1;
      value = `${year}-${pad(month)}-${pad(day)}`;
    }
    return isRealIso(value) ? value : null;
  }

  const numeric = text.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](20\d{2}))?\b/);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3]) : parseIso(today).getFullYear();
    const value = `${year}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`;
    return isRealIso(value) ? value : null;
  }
  return null;
}

function dateForWeekday(startIso: string, wantedDay: number) {
  let value = startIso;
  for (let i = 0; i < 8; i += 1) {
    const js = parseIso(value).getDay();
    const day = js === 0 ? 6 : js - 1;
    if (day === wantedDay) return value;
    value = addDaysIso(value, 1);
  }
  return startIso;
}

function nextWeekdayDate(today: string, wantedDay: number) {
  const js = parseIso(today).getDay();
  const current = js === 0 ? 6 : js - 1;
  const nextMonday = addDaysIso(today, 7 - current);
  return addDaysIso(nextMonday, wantedDay);
}

function parseDate(text: string, today: string, minDate: string) {
  const lower = text.toLowerCase();
  const named = explicitDate(text, today);
  if (named) return { date: named, days: [] as number[], relative: false };

  if (/\b(day after tomorrow|parso|parson)\b/.test(lower)) {
    return { date: addDaysIso(today, 2), days: [] as number[], relative: true };
  }
  // In a future booking request, Hindi “kal” means tomorrow (official starter-pack semantics).
  if (/\b(tomorrow|kal)\b/.test(lower)) {
    return { date: addDaysIso(today, 1), days: [] as number[], relative: true };
  }
  if (/\b(today|aaj|tonight|aaj raat)\b/.test(lower)) {
    return { date: today, days: [] as number[], relative: true };
  }

  const found: { day: number; index: number }[] = [];
  for (const entry of DAY_ALIASES) {
    for (const word of entry.words) {
      const match = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").exec(text);
      if (match) found.push({ day: entry.day, index: match.index });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const days = [...new Set(found.map((f) => f.day))];
  if (!days.length) return { date: null, days, relative: false };
  const dayWords = DAY_ALIASES.find((entry) => entry.day === days[0])?.words ?? [];
  const explicitNext = dayWords.some((word) => new RegExp(`\\b(?:next|agle|agla|agli)\\s+${escapeRegExp(word)}\\b`, "i").test(lower));
  const nextWeek = /\b(?:next week|agle hafte|agale hafte|agli hafte)\b/.test(lower);
  const date = explicitNext || nextWeek ? nextWeekdayDate(today, days[0]) : dateForWeekday(minDate, days[0]);
  return { date, days, relative: false };
}

type ClockToken = { hour: number; minute: number; meridiem: "am" | "pm" | null };

function clockToken(hourRaw: string, minuteRaw?: string, markerRaw?: string): ClockToken | null {
  const hour = Number(hourRaw);
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  const marker = (markerRaw ?? "").toLowerCase().replace(/\./g, "");
  const meridiem = marker.startsWith("a") ? "am" : marker.startsWith("p") ? "pm" : null;
  return { hour, minute, meridiem };
}

function toClockMinutes(token: ClockToken, inferred: "am" | "pm" | null) {
  let hour = token.hour;
  const meridiem = token.meridiem ?? inferred;
  if (hour === 24) return token.minute === 0 ? 24 * 60 : null;
  if (hour > 12 && meridiem) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour * 60 + token.minute;
}

function parseDuration(lower: string) {
  const hours = lower.match(/\b(\d+(?:\.5)?)\s*[- ]?\s*(?:(?:straight|continuous|consecutive)\s+)?(?:hours?|hrs?|hr|ghante?|ghanta)\b/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = lower.match(/\b(\d{1,3})\s*(?:minutes?|mins?|min)\b/);
  return minutes ? Number(minutes[1]) : null;
}

function contextualMeridiem(lower: string): "am" | "pm" | null {
  if (/\b(shaam|sham|evening|raat|night|tonight)\b/.test(lower)) return "pm";
  if (/\b(subah|morning)\b/.test(lower)) return "am";
  if (/\b(dopahar|afternoon)\b/.test(lower)) return "pm";
  return null;
}

function parseTimes(text: string) {
  const lower = text.toLowerCase();
  const assumptions: string[] = [];
  const followUp: string[] = [];
  const duration = parseDuration(lower);
  const globalHint = contextualMeridiem(lower);

  const flexible = lower.match(
    /\b(?:sometime\s+|any\s*time\s+|anytime\s+)?between\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i,
  );
  if (flexible) {
    const first = clockToken(flexible[1], flexible[2], flexible[3]);
    const second = clockToken(flexible[4], flexible[5], flexible[6]);
    if (first && second) {
      const firstHint = first.meridiem ?? second.meridiem ?? globalHint;
      const secondHint = second.meridiem ?? first.meridiem ?? globalHint;
      const start = toClockMinutes(first, firstHint);
      let windowEnd = toClockMinutes(second, secondHint);
      if (start !== null && windowEnd !== null) {
        if (windowEnd <= start && !second.meridiem && windowEnd + 12 * 60 > start) windowEnd += 12 * 60;
        const length = duration ?? 120;
        if (start + length <= windowEnd) {
          assumptions.push(`The flexible ${timeString(start)}–${timeString(windowEnd)} window was filled with its earliest ${length / 60}-hour slot (${timeString(start)}–${timeString(start + length)}).`);
          if (duration === null) assumptions.push("No duration was stated; a 2-hour booking was assumed.");
          return { start, end: start + length, assumptions, followUp };
        }
        followUp.push(`The requested duration does not fit inside the ${timeString(start)}–${timeString(windowEnd)} window. Choose a shorter duration or wider window.`);
        return { start: null, end: null, assumptions, followUp };
      }
    }
  }

  const notBefore = lower.match(/\bnot\s+before\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  if (notBefore) {
    const token = clockToken(notBefore[1], notBefore[2], notBefore[3]);
    const start = token ? toClockMinutes(token, globalHint) : null;
    if (start !== null) {
      const length = duration ?? 120;
      assumptions.push(`“Not before” was interpreted as the earliest allowed start, ${timeString(start)}.`);
      if (duration === null) assumptions.push("No duration was stated; a 2-hour booking was assumed.");
      return { start, end: Math.min(start + length, 24 * 60), assumptions, followUp };
    }
  }

  if (/\b(?:before|by)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(lower)) {
    followUp.push("A latest finish was stated but no start time was given. What start time should be used?");
    return { start: null, end: null, assumptions, followUp };
  }

  // Midnight is the next day's boundary, which an HTML same-day time range
  // cannot represent safely as 24:00. Preserve the stated start and require a
  // deliberate correction instead of silently turning 10 pm–midnight into
  // 00:00–02:00 on the wrong date.
  const toMidnight = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje)?\s*(?:to|till|until|se|[-–])\s*midnight\b/i,
  );
  if (toMidnight) {
    const token = clockToken(toMidnight[1], toMidnight[2], toMidnight[3]);
    const start = token ? toClockMinutes(token, globalHint) : null;
    followUp.push("This request ends at midnight on the next day. Choose a same-day end time or split it into separate bookings.");
    return { start, end: null, assumptions, followUp };
  }

  const range = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje)?\s*(?:to|till|until|se|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje|tak)?\b/i,
  );

  if (range) {
    const first = clockToken(range[1], range[2], range[3]);
    const second = clockToken(range[4], range[5], range[6]);
    if (first && second) {
      const firstHint = first.meridiem ?? second.meridiem ?? globalHint;
      const secondHint = second.meridiem ?? first.meridiem ?? globalHint;
      let start = toClockMinutes(first, firstHint);
      let end = toClockMinutes(second, secondHint);
      if (start !== null && end !== null) {
        if (!first.meridiem && !second.meridiem && !globalHint) {
          assumptions.push("The time range had no AM/PM marker; daytime hours were assumed. Please verify it.");
        }
        if (end <= start && end + 12 * 60 > start && !second.meridiem) end += 12 * 60;
        if (end > start && end <= 24 * 60) {
          if (duration !== null && end - start !== duration) {
            followUp.push(`The stated time range is ${(end - start) / 60} hour(s), but the stated duration is ${duration / 60} hour(s). Which one should be used?`);
            return { start: null, end: null, assumptions, followUp };
          }
          return { start, end, assumptions, followUp };
        }
      }
    }
  }

  const namedClock = lower.match(/\b(noon|midday|midnight)\b/);
  if (namedClock) {
    const start = namedClock[1] === "midnight" ? 0 : 12 * 60;
    if (duration === null) {
      followUp.push("How long should the booking last?");
      return { start, end: null, assumptions, followUp };
    }
    return { start, end: Math.min(start + duration, 24 * 60), assumptions, followUp };
  }

  const twentyFourHour = lower.match(/\b(?:at|from)\s+([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const start = Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
    if (duration === null) {
      followUp.push("How long should the booking last?");
      return { start, end: null, assumptions, followUp };
    }
    return { start, end: Math.min(start + duration, 24 * 60), assumptions, followUp };
  }

  const single = lower.match(/(?:\bat\s+|\bfrom\s+|\b)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje)\b/i)
    ?? lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (single) {
    const token = clockToken(single[1], single[2], single[3]);
    const start = token ? toClockMinutes(token, globalHint) : null;
    if (start !== null) {
      if (/\b(?:around|about|approximately|approx|lagbhag)\s+\d/.test(lower)) assumptions.push(`The approximate time was filled as ${timeString(start)}; please verify it.`);
      if (duration === null) {
        followUp.push("How long should the booking last?");
        return { start, end: null, assumptions, followUp };
      }
      return { start, end: Math.min(start + duration, 24 * 60), assumptions, followUp };
    }
  }

  const vague: { re: RegExp; start: number; label: string }[] = [
    { re: /\b(after lunch|lunch ke baad)\b/, start: 14 * 60, label: "after lunch" },
    { re: /\b(afternoon|dopahar)\b/, start: 14 * 60, label: "afternoon" },
    { re: /\b(evening|shaam|sham)\b/, start: 18 * 60, label: "evening" },
    { re: /\b(morning|subah)\b/, start: 10 * 60, label: "morning" },
    { re: /\b(night|raat)\b/, start: 20 * 60, label: "night" },
  ];
  const period = vague.find((v) => v.re.test(lower));
  if (period) {
    const length = duration ?? 120;
    assumptions.push(`“${period.label}” was interpreted as ${timeString(period.start)} for ${length / 60} hour(s).`);
    return { start: period.start, end: Math.min(period.start + length, 24 * 60), assumptions, followUp };
  }

  followUp.push("What start and end time should the venue be reserved for?");
  return { start: null, end: null, assumptions, followUp };
}

function parseAttendees(text: string) {
  const lower = text.toLowerCase();
  const noun = lower.match(/\b(?:around|about|approx(?:imately)?|lagbhag)?\s*(\d{1,4})\s*\+?\s*(?:people|persons|participants|students|attendees|audience|visitors|spectators|guests|dancers|learners|log|logon|seats)\b/);
  if (noun) return Number(noun[1]);
  const expected = lower.match(/\b(?:attendance|capacity|crowd)\s*(?:of|is|:)?\s*(\d{1,4})\b/);
  return expected ? Number(expected[1]) : null;
}

function parseNeeds(text: string) {
  const lower = text.toLowerCase();
  const needs: string[] = [];
  const add = (value: string) => {
    if (!needs.includes(value)) needs.push(value);
  };
  const wanted = (pattern: string) => {
    const mention = new RegExp(`\\b(?:${pattern})\\b`, "i");
    if (!mention.test(lower)) return false;
    const before = new RegExp(`\\b(?:no(?:\\s+need\\s+for)?|without|do\\s+not\\s+need|don't\\s+need|not\\s+requiring)\\b(?:\\s+\\w+){0,3}\\s+(?:${pattern})\\b`, "i");
    const after = new RegExp(`\\b(?:${pattern})\\b(?:\\s+\\w+){0,3}\\s+(?:nahi\\s+chahiye|not\\s+needed|required\\s+nahi)\\b`, "i");
    return !before.test(lower) && !after.test(lower);
  };
  if (wanted("projector|projection|screen")) add("Projector");
  // A singular “speaker” is usually a guest/person (for example, “industry
  // speaker”), not audio equipment. Explicit sound/PA wording or plural
  // loudspeakers remains an equipment request.
  if (wanted("sound|audio|pa\\s+system|loudspeakers?|speakers")) add("Audio system");
  if (wanted("mics?|microphones?")) {
    add("Microphones");
    add("Audio system");
  }
  if (wanted("stage|stage\\s+lights?|lighting")) add("Stage lighting");
  if (wanted("air[ -]?condition(?:ing|ed)|a\\.?c\\.?")) add("Air conditioning");
  if (wanted("recording|record|camera")) add("Recording");
  if (wanted("wi[ -]?fi|internet")) add("Wi-Fi access");
  if (wanted("computers?|workstations?|coding\\s+lab")) add("Lab workstations");
  if (wanted("power\\s+benches?")) add("Power benches");
  if (wanted("accessible|wheelchair|wheel\\s+chair|ramp|barrier[- ]free")) add("Accessibility");
  return needs;
}

function parseRoom(text: string) {
  const lower = text.toLowerCase();
  // Match the official CIT and general room-code families without treating
  // student-group identifiers such as ECE-3/CSE-3 as room requests.
  const explicitCode = text.match(
    /\b(?:AUD|OAT|EXH-[NS]|SH-\d+|LHC?-\d+|LT-?\d+|CR-\d+|(?:CS|ELEC)-LAB-\d+|(?:PHY|CIVIL)-LAB|MECH-WS|[ABL]-\d{2,3})\b/i,
  )?.[0] ?? null;
  const code = explicitCode ?? (/\bmain auditorium\b/i.test(text) ? "AUD" : null);
  const mentions: { type: RoomType; index: number }[] = [];
  const find = (type: RoomType, pattern: RegExp) => {
    const match = pattern.exec(lower);
    if (match) mentions.push({ type, index: match.index });
  };
  find("auditorium", /\b(auditorium|main hall|bada hall)\b/);
  find("seminar", /\b(seminar(?: hall| room)?|small room|chhota hall)\b/);
  find("lab", /\b(computer lab|computing lab|electronics? lab|lab)\b/);
  find("lecture", /\b(lecture hall|classroom|class room)\b/);
  find("outdoor", /\b(outdoor|open air|lawn|ground|oat)\b/);
  const upperCode = code?.toUpperCase() ?? "";
  if (upperCode === "AUD" && !mentions.some((item) => item.type === "auditorium")) mentions.push({ type: "auditorium", index: 0 });
  if (/^(?:LT|LH|LHC|CR|A-|B-)/.test(upperCode) && !mentions.some((item) => item.type === "lecture")) mentions.push({ type: "lecture", index: 0 });
  if (/^(?:SH-)/.test(upperCode) && !mentions.some((item) => item.type === "seminar")) mentions.push({ type: "seminar", index: 0 });
  if (/(?:LAB|MECH-WS)|^L-/.test(upperCode) && !mentions.some((item) => item.type === "lab")) mentions.push({ type: "lab", index: 0 });
  if (upperCode === "OAT" && !mentions.some((item) => item.type === "outdoor")) mentions.push({ type: "outdoor", index: 0 });
  mentions.sort((a, b) => a.index - b.index);
  const explicitTypes = [...new Set(mentions.map((item) => item.type))];
  const generic = !explicitTypes.length && /\b(room|venue|space|jagah|hall)\b/.test(lower);
  const types: RoomType[] = generic ? ["seminar", "lecture", "auditorium"] : explicitTypes;
  return {
    code: code ? code.toUpperCase().replace(/^LT(\d)/, "LT-$1") : null,
    types,
    preferTypeOrder: explicitTypes.length > 1,
  };
}

function inferCategory(text: string, mode: "club" | "department") {
  const lower = text.toLowerCase();
  if (/\b(workshop|training|bootcamp|hackathon|coding contest|clinic)\b/.test(lower)) return "workshop";
  if (/\b(seminar|guest lecture|industry speaker|talk|speaker)\b/.test(lower)) return "seminar";
  if (/\b(farewell|dance|music|concert|rehearsal|cultural|fest|stage play)\b/.test(lower)) return "cultural";
  if (/\b(sport|tournament|match|yoga)\b/.test(lower)) return "sports";
  if (/\b(meet|meeting|review)\b/.test(lower)) return "meeting";
  return mode === "department" ? "department_event" : "club_event";
}

function cleanTitle(value: string) {
  const cleaned = value
    .replace(/\b(?:on|at)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i, "")
    .replace(/\b(?:for|around|about)\s+\d{1,4}\s+(?:people|students|participants).*$/i, "")
    .replace(/\b(?:need|with)\s+(?:a\s+)?(?:projector|mic|sound|stage).*$/i, "")
    .replace(/[,.]+$/, "")
    .trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trim()}…` : cleaned;
}

function policyNotices(text: string, mode: "club" | "department") {
  const lower = text.toLowerCase();
  const notices: string[] = [];
  const priorityManipulation =
    /\b(?:critical|highest|top|emergency)\s+priority\b|\b(?:give|grant)(?:\s+(?:this|it|me))?\s+(?:extra\s+|more\s+|top\s+|highest\s+)?priority\b|\b(?:mark|classify|treat)\s+(?:this|it|me)\s+(?:as\s+)?(?:an?\s+)?(?:exam|regular class|institute event|institute level|guest lecture)\b|\b(?:pretend|act)\s+(?:that\s+)?(?:i am|i'm)\s+(?:the\s+)?(?:admin|dean|director)\b|\b(?:override|raise|change)\s+(?:my\s+|the\s+)?priority\b/i.test(lower);
  const bypassAttempt =
    /\b(?:bypass|jailbreak|system\s+prompt|ignore\s+(?:(?:all|the|any|previous)\s+){0,2}(?:rules|policy|instructions)|without\s+approval|no\s+approval|hide\s+(?:the\s+)?attendance|do\s+not\s+mention|don't\s+mention|work\s+around\s+(?:the\s+)?limit|split\s+(?:it\s+)?to\s+(?:avoid|bypass))\b/i.test(lower);
  const conditional = /\b(?:if|unless|otherwise|only\s+if|provided\s+that|in\s+case|agar|warna|nahi\s+to)\b/i.test(lower);

  if (priorityManipulation) {
    notices.push(`Priority instructions in the request were ignored. This ${mode === "club" ? "club" : "department"} account keeps its code-enforced category ceiling.`);
  }
  if (bypassAttempt) {
    notices.push("Wording cannot bypass capacity, duration, lead-time, role or approval rules. Enter the true event details; every field is re-validated on submission.");
  }
  if (conditional) {
    notices.push("A condition or fallback was detected. This draft represents one concrete booking; verify the selected venue and time, and submit separate alternatives if needed.");
  }
  return notices;
}

function inferTitle(text: string, category: string) {
  const fallback: Record<string, string> = {
    workshop: "Workshop",
    seminar: "Seminar / guest lecture",
    cultural: "Cultural programme",
    sports: "Sports event",
    meeting: "Meeting",
    department_event: "Department event",
    club_event: "Club event",
  };
  const generic = fallback[category] ?? "Venue request";
  if (/\b(?:pretend|bypass|jailbreak|highest\s+priority|mark\s+(?:this|it)\s+as)\b/i.test(text)) return generic;

  const quantityLead = new RegExp(`^(?:\\d+(?:\\.5)?|${NUMBER_PHRASE})\\s*(?:hours?|hrs?|ghante?|people|students|participants|attendees|audience|dancers|log)\\b`, "i");
  const forMatch = text.match(/\bfor\s+(?:an?\s+|the\s+)?(.+?)(?=\s+on\b|\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|,|\s+at\s+\d|\s+from\s+\d|$)/i);
  if (forMatch) {
    const value = cleanTitle(forMatch[1]);
    if (
      value.length >= 3
      && !quantityLead.test(value)
      && !/^(?:if|otherwise|unless)\b/i.test(value)
      && !/^(?:them|him|her|us|me|you|it|everyone|everybody|all)$/i.test(value)
    ) return value;
  }
  const eventMatch = text.match(/\b([A-Za-z][A-Za-z -]{2,45}(?:workshop|contest|farewell|lecture|seminar|meeting|rehearsal|concert|session|talk|event|finals?|exhibition))\b/i);
  if (eventMatch) {
    const value = cleanTitle(eventMatch[1]);
    if (!/^(?:if|otherwise|unless)\b/i.test(value)) return value;
  }
  return generic;
}

export function parsePlainLanguageBooking(input: BookingParseInput): BookingParseDraft {
  const text = input.text.trim().replace(/\s+/g, " ");
  const parseText = normalizeContextNumbers(text);
  const lower = text.toLowerCase();
  const assumptions: string[] = [];
  const followUp: string[] = [];
  const notices = policyNotices(text, input.mode);

  const parsedDate = parseDate(parseText, input.today, input.minDate);
  let date = parsedDate.date;
  if (!date) followUp.push("Which date or weekday should this booking use?");
  if (date && date < input.minDate) {
    followUp.push(`The requested date is before the earliest permitted date (${input.minDate}); please choose a later date.`);
  }

  const times = parseTimes(parseText);
  assumptions.push(...times.assumptions);
  followUp.push(...times.followUp);
  if (times.start !== null && times.end !== null && times.end - times.start > input.maxHours * 60) {
    followUp.push(`This request is longer than the ${input.maxHours}-hour booking limit; shorten or split it.`);
  }

  const attendees = parseAttendees(parseText);
  if (!attendees) followUp.push("How many people are expected?");

  const room = parseRoom(text);
  const needs = parseNeeds(text);
  const accessible = needs.includes("Accessibility");
  const category = inferCategory(text, input.mode);
  const title = inferTitle(text, category);
  if (["Workshop", "Seminar / guest lecture", "Cultural programme", "Sports event", "Meeting", "Department event", "Club event"].includes(title)) {
    assumptions.push(`A temporary title (“${title}”) was filled in; replace it with the event name if needed.`);
  }

  const recurring = /\b(every|daily|each day|all (?:of )?(?:fest )?week|roz|har din)\b/.test(lower) || parsedDate.days.length > 1;
  if (recurring) {
    followUp.push("This sounds recurring or mentions multiple days. This form submits one occurrence; review the first date, then submit the other dates separately.");
  }

  if (!room.code && !room.types.length) {
    assumptions.push("No venue type was stated; the smallest active venue with enough seats will be proposed.");
  }
  if (parsedDate.days.length > 1 && date) assumptions.push(`The first matching day (${date}) was filled into this single-booking form.`);

  return {
    title,
    category,
    description: `Plain-language request: “${text.slice(0, 450)}”`,
    date,
    startTime: times.start === null ? null : timeString(times.start),
    endTime: times.end === null ? null : timeString(times.end),
    attendees,
    roomCodeHint: room.code,
    roomTypeHints: room.types,
    preferRoomTypeOrder: room.preferTypeOrder,
    needs,
    accessible,
    assumptions,
    policyNotices: notices,
    followUp,
    recurring,
  };
}
