export function log(scope, message, data = undefined) {
  const prefix = `[${new Date().toISOString()}][${scope}]`;
  if (data === undefined) console.log(prefix, message);
  else console.log(prefix, message, JSON.stringify(data));
}
