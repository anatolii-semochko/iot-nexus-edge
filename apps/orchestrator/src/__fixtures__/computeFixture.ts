// compute.test.ts's module for the worker
export function sumSquares(n: number): { n: number; sum: number } {
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += i * i;
  return { n, sum };
}

export function fails(): never {
  throw new Error("as planned");
}
