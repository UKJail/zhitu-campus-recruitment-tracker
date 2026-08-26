import type { BinaryEnvelope } from "./crypto";

export type StoredResumeRecord = {
  id: string;
  name: string;
  mimeType: string;
  envelope: BinaryEnvelope;
  updatedAt: string;
};

const DATABASE_NAME = "zhitu-autofill";
const STORE_NAME = "resume-files";
const DATABASE_VERSION = 1;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地简历存储"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("本地简历存储失败"));
    });
  } finally {
    database.close();
  }
}

export function putResumeRecord(record: StoredResumeRecord) {
  return withStore("readwrite", (store) => store.put(record));
}

export function getResumeRecord(id: string) {
  return withStore<StoredResumeRecord | undefined>("readonly", (store) => store.get(id));
}

export function deleteResumeRecord(id: string) {
  return withStore("readwrite", (store) => store.delete(id));
}

export function listResumeRecords() {
  return withStore<StoredResumeRecord[]>("readonly", (store) => store.getAll());
}

export async function replaceResumeRecords(records: StoredResumeRecord[]) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("导入简历文件失败"));
    });
  } finally {
    database.close();
  }
}
