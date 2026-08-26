type RememberedKeyRecord = {
  id: "vault-key";
  key: CryptoKey;
  savedAt: string;
};

const DATABASE_NAME = "zhitu-autofill-device";
const STORE_NAME = "trusted-device";
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
    request.onerror = () => reject(request.error || new Error("无法打开设备解锁存储"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("设备解锁存储失败"));
    });
  } finally {
    database.close();
  }
}

export function rememberVaultKey(key: CryptoKey) {
  const record: RememberedKeyRecord = { id: "vault-key", key, savedAt: new Date().toISOString() };
  return withStore("readwrite", (store) => store.put(record));
}

export async function readRememberedVaultKey() {
  const record = await withStore<RememberedKeyRecord | undefined>("readonly", (store) => store.get("vault-key"));
  return record?.key ?? null;
}

export function forgetRememberedVaultKey() {
  return withStore("readwrite", (store) => store.delete("vault-key"));
}
