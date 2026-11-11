export type PiiCategory =
  | 'email'
  | 'jwt'
  | 'bearer'
  | 'api_key'
  | 'password'
  | 'auth_header';

export type PiiFinding = {
  category: PiiCategory;
  label: string;
  source: string;
  count: number;
  preview: string;
};

export const PII_CATEGORY_LABELS: Record<PiiCategory, string> = {
  email: 'Email',
  jwt: 'JWT',
  bearer: 'Bearer token',
  api_key: 'API key / token',
  password: 'Password field',
  auth_header: 'Auth header / cookie',
};

const SENSITIVE_HEADER_NAMES =
  /^(?:authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization|x-csrf-token|x-access-token)$/i;

type TextRule = { category: PiiCategory; re: RegExp };

const TEXT_RULES: TextRule[] = [
  {
    category: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.+/=-]{8,}/g,
  },
  { category: 'bearer', re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  {
    category: 'api_key',
    re: /\b(sk_(?:live|test)_[A-Za-z0-9]{8,}|pk_(?:live|test)_[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{12,}|AIza[0-9A-Za-z\-_]{35})\b/g,
  },
  {
    category: 'api_key',
    re: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/=]{8,}/gi,
  },
  {
    category: 'api_key',
    re: /[?&](?:token|access_token|api_key|auth|key|secret|session)=[A-Za-z0-9\-._~+/=%]{8,}/gi,
  },
  { category: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g },
  {
    category: 'password',
    re: /"(?:password|passwd|pwd|secret|client_secret)"\s*:\s*"[^"]{3,}"/gi,
  },
];

function replacementFor(category: PiiCategory): string {
  return `[REDACTED:${category}]`;
}

export function maskPreview(value: string): string {
  const s = String(value);
  if (s.length <= 6) return '••••';
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

export function redactText(text: string | null | undefined): string {
  if (text == null || text === '') return String(text ?? '');
  let out = String(text);
  for (const rule of TEXT_RULES) {
    rule.re.lastIndex = 0;
    out = out.replace(rule.re, replacementFor(rule.category));
  }
  return out;
}

export function redactHeaders(
  headers: Record<string, string> | null | undefined
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.test(k.trim())) {
      out[k] = replacementFor('auth_header');
    } else {
      out[k] = redactText(v);
    }
  }
  return out;
}

function scanTextInto(
  map: Map<string, PiiFinding>,
  text: string | null | undefined,
  source: string
) {
  if (!text) return;
  const str = String(text);
  for (const rule of TEXT_RULES) {
    rule.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    let count = 0;
    let preview = '';
    while ((match = rule.re.exec(str)) !== null) {
      count += 1;
      if (!preview) preview = maskPreview(match[0]);
    }
    if (count === 0) continue;
    const key = `${rule.category}::${source}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += count;
    } else {
      map.set(key, {
        category: rule.category,
        label: PII_CATEGORY_LABELS[rule.category],
        source,
        count,
        preview,
      });
    }
  }
}

function scanHeadersInto(
  map: Map<string, PiiFinding>,
  headers: Record<string, string> | null | undefined,
  sourcePrefix: string
) {
  if (!headers) return;
  for (const [k, v] of Object.entries(headers)) {
    const headerName = String(k).trim();
    if (SENSITIVE_HEADER_NAMES.test(headerName)) {
      const key = `auth_header::${sourcePrefix}: ${headerName}`;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else {
        map.set(key, {
          category: 'auth_header',
          label: PII_CATEGORY_LABELS.auth_header,
          source: `${sourcePrefix}: ${headerName}`,
          count: 1,
          preview: maskPreview(String(v)),
        });
      }
    } else {
      scanTextInto(map, String(v), `${sourcePrefix}: header ${headerName}`);
    }
  }
}

export type NetworkEventForPii = {
  method?: string;
  url?: string;
  postData?: string;
  requestBody?: string;
  responseBody?: string;
  responseBodyEncoding?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
};

export type SessionPiiScanInput = {
  consoleEvents?: Array<{ text?: string }>;
  networkEvents?: NetworkEventForPii[];
  annotations?: Array<{ text?: string }>;
  getResponseText?: (ev: NetworkEventForPii) => string | null;
};

export function scanSessionForPii(input: SessionPiiScanInput): {
  findings: PiiFinding[];
  totalMatches: number;
} {
  const map = new Map<string, PiiFinding>();

  for (const ev of input.consoleEvents || []) {
    scanTextInto(map, ev.text, 'Console log');
  }

  for (const ev of input.networkEvents || []) {
    const label = `Network: ${ev.method || 'GET'} ${ev.url || '—'}`;
    scanTextInto(map, ev.url, label);
    scanTextInto(map, ev.postData || ev.requestBody, `${label} (request)`);
    const resp =
      input.getResponseText?.(ev) ??
      (ev.responseBodyEncoding === 'base64' ? null : ev.responseBody);
    scanTextInto(map, resp, `${label} (response)`);
    scanHeadersInto(map, ev.requestHeaders, label);
    scanHeadersInto(map, ev.responseHeaders, label);
  }

  for (const ann of input.annotations || []) {
    if (ann.text) scanTextInto(map, ann.text, 'Annotation note');
  }

  const findings = [...map.values()].sort((a, b) => b.count - a.count);
  const totalMatches = findings.reduce((n, f) => n + f.count, 0);
  return { findings, totalMatches };
}
