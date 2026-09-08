// Keep each PostgREST request below the default row and practical URL limits.
export const JOB_QUERY_PAGE_SIZE = 500;
export const JOB_QUERY_FILTER_SIZE = 100;
export const JOB_QUERY_FILTER_ENCODED_SIZE = 6_000;
export const JOB_QUERY_MAX_PAGES = 200;
const BATCH_CONCURRENCY = 4;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export class JobsReadError extends Error {
  constructor(message = "职位数据读取失败，请稍后重试") {
    super(message);
  }
}

/** A stable unique key avoids offset shifts. A short page may be a server cap. */
export async function readJobQueryPages<T>(
  fetchPage: (after: string | undefined) => PromiseLike<PageResult<T>>,
  keyOf: (row: T) => string,
) {
  const rows: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < JOB_QUERY_MAX_PAGES; page += 1) {
    const result = await fetchPage(after);
    if (result.error || !Array.isArray(result.data)) throw new JobsReadError();
    if (result.data.length === 0) return rows;
    if (result.data.length > JOB_QUERY_PAGE_SIZE) throw new JobsReadError();
    for (const row of result.data) {
      const key = keyOf(row);
      if (!key || (after !== undefined && key <= after)) throw new JobsReadError();
      rows.push(row);
      after = key;
    }
  }
  // Never claim success with an incomplete activity/history list.
  throw new JobsReadError("职位记录较多，本次未能完整加载，请稍后重试");
}

export function jobQueryValueChunks(values: string[]) {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let encodedSize = 0;
  for (const value of new Set(values)) {
    // Include quoting/commas in the URL budget.
    const size = encodeURIComponent(JSON.stringify(value)).length + 3;
    if (!value || size > JOB_QUERY_FILTER_ENCODED_SIZE) throw new JobsReadError();
    // The installed client's .in() wraps reserved punctuation but does not
    // escape quotes/backslashes. Keep these as singleton exact-value queries.
    if (/["\\]/.test(value)) {
      if (chunk.length) chunks.push(chunk);
      chunks.push([value]);
      chunk = [];
      encodedSize = 0;
      continue;
    }
    if (chunk.length && (chunk.length >= JOB_QUERY_FILTER_SIZE || encodedSize + size > JOB_QUERY_FILTER_ENCODED_SIZE)) {
      chunks.push(chunk);
      chunk = [];
      encodedSize = 0;
    }
    chunk.push(value);
    encodedSize += size;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

export async function readJobQueryChunks<T>(values: string[], fetchChunk: (chunk: string[]) => Promise<T[]>) {
  const chunks = jobQueryValueChunks(values);
  const rows: T[] = [];
  for (let offset = 0; offset < chunks.length; offset += BATCH_CONCURRENCY) {
    const batch = await Promise.all(chunks.slice(offset, offset + BATCH_CONCURRENCY).map(fetchChunk));
    rows.push(...batch.flat());
  }
  return rows;
}
