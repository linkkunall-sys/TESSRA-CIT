export type BookingPolicyItem = {
  category: string;
  priorityOrder: number;
};

export type PolicyBooking = {
  id: number;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: number;
  requesterId: number;
  createdAt: Date;
};

export function normalizeBookingPolicy(categories: string[], stored: BookingPolicyItem[]) {
  const storedRank = new Map(
    stored
      .filter((item) => categories.includes(item.category) && Number.isInteger(item.priorityOrder) && item.priorityOrder > 0)
      .map((item) => [item.category, item.priorityOrder]),
  );
  const used = new Set<number>();
  const validStored = new Map<string, number>();
  for (const category of categories) {
    const rank = storedRank.get(category);
    if (rank && rank <= categories.length && !used.has(rank)) {
      validStored.set(category, rank);
      used.add(rank);
    }
  }
  const free = categories.map((_, index) => index + 1).filter((rank) => !used.has(rank));
  let freeIndex = 0;
  return categories
    .map((category) => ({ category, priorityOrder: validStored.get(category) ?? free[freeIndex++] }))
    .sort((a, b) => a.priorityOrder - b.priorityOrder || categories.indexOf(a.category) - categories.indexOf(b.category));
}

export function validateBookingPolicy(categories: string[], ranks: Record<string, number>) {
  const values = categories.map((category) => ranks[category]);
  if (values.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > categories.length)) {
    return { ok: false as const, message: `Every priority rank must be from 1 to ${categories.length}.` };
  }
  if (new Set(values).size !== categories.length) {
    return { ok: false as const, message: "Each category must have a unique priority rank." };
  }
  return {
    ok: true as const,
    policy: categories.map((category) => ({ category, priorityOrder: ranks[category] })).sort((a, b) => a.priorityOrder - b.priorityOrder),
  };
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

export function bookingTimesOverlap(a: Pick<PolicyBooking, "date" | "startTime" | "endTime" | "roomId">, b: Pick<PolicyBooking, "date" | "startTime" | "endTime" | "roomId">) {
  if (a.date !== b.date || a.roomId !== b.roomId) return false;
  const aStart = minutes(a.startTime);
  const aEnd = minutes(a.endTime);
  const bStart = minutes(b.startTime);
  const bEnd = minutes(b.endTime);
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** Negative means a wins, positive means b wins. Ties go to the earlier request. */
export function compareBookingPriority(a: Pick<PolicyBooking, "id" | "category" | "createdAt">, b: Pick<PolicyBooking, "id" | "category" | "createdAt">, policy: BookingPolicyItem[]) {
  const rank = new Map(policy.map((item) => [item.category, item.priorityOrder]));
  const category = (rank.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.category) ?? Number.MAX_SAFE_INTEGER);
  if (category) return category;
  const submitted = a.createdAt.getTime() - b.createdAt.getTime();
  return submitted || a.id - b.id;
}

export function findHigherPriorityContender(target: PolicyBooking, pending: PolicyBooking[], policy: BookingPolicyItem[]) {
  return pending
    .filter((candidate) => candidate.id !== target.id && bookingTimesOverlap(target, candidate))
    .filter((candidate) => compareBookingPriority(candidate, target, policy) < 0)
    .sort((a, b) => compareBookingPriority(a, b, policy))[0] ?? null;
}

export function departmentCanReviewLab<T extends string | number>(
  coordinatorDepartment: T | null | undefined,
  roomType: string,
  roomDepartment: T | null | undefined,
) {
  return coordinatorDepartment !== null && coordinatorDepartment !== undefined && roomType === "lab" && roomDepartment === coordinatorDepartment;
}
