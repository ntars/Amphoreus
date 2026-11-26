export function pass(message) {
  console.log(`PASS ${message}`);
  process.exit(0);
}

export function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

export function envFail(message) {
  console.error(`ENVFAIL ${message}`);
  process.exit(2);
}

export function assert(condition, message) {
  if (!condition) fail(message);
}

export function near(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}
