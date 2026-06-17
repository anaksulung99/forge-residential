export function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pickRandom<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error("pickRandom: empty array");
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export function pickRandomOr<T>(arr: T[], fallback: T): T {
  if (arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
export function randomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomIntExclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}
