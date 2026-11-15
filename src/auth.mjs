const encoder = new TextEncoder();
export const callbackPath = '/api/billing/stripe/trial-clock';
export const dispatchPath = '/internal/deliver';
export const schedulePath = '/v1/jobs';
const timestampHeader = 'X-AnswerCraft-Timestamp';
const signatureHeader = 'X-AnswerCraft-Signature';

function payload(path, timestamp, body) {
  return encoder.encode(['POST', path, timestamp, body].join('\n'));
}
async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}
export async function signedHeaders(path, body, secret, now = Date.now()) {
  const ts = String(Math.floor(now / 1000));
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), payload(path, ts, body)));
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return {'Content-Type':'application/json', [timestampHeader]:ts, [signatureHeader]:hex};
}
export async function authentic(headers, path, body, secret, now = Date.now()) {
  const ts = headers.get(timestampHeader) || '';
  const hex = headers.get(signatureHeader) || '';
  if (!secret || secret.length < 32 || !/^\d{10}$/.test(ts) || !/^[0-9a-f]{64}$/.test(hex) ||
      Math.abs(Math.floor(now/1000) - Number(ts)) > 300) return false;
  const bytes = Uint8Array.from(hex.match(/../g), pair => parseInt(pair,16));
  return crypto.subtle.verify('HMAC', await signingKey(secret), bytes, payload(path, ts, body));
}
export async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > 1024 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { data.set(chunk, position); position += chunk.length; }
    return new TextDecoder('utf-8', {fatal:true}).decode(data);
  } finally { reader.releaseLock(); }
}
export function isJob(job) {
  return job && typeof job === 'object' && Object.keys(job).sort().join(',') === 'id,kind,runAt' &&
    typeof job.id === 'string' && /^[0-9a-f]{64}$/.test(job.id) &&
    (job.kind === 'cutoff' || job.kind === 'warning') && Number.isSafeInteger(job.runAt);
}
