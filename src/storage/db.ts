// IndexedDB persistence: project JSON, asset blobs, LUT files, font files.

const DB_NAME = "framecut";
const DB_VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects"))
          db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("blobs"))
          db.createObjectStore("blobs");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export interface SavedProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export async function saveProject(
  project: any,
  blobRefs: Record<string, Blob>,
  extra: Record<string, any> = {}
): Promise<void> {
  await tx("projects", "readwrite", (s) =>
    s.put({ ...project, ...extra, blobRefs })
  );
}

export async function listProjects(): Promise<SavedProjectMeta[]> {
  const rows: any[] = await tx("projects", "readonly", (s) => s.getAll());
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }));
}

export async function loadProject(id: string): Promise<any | null> {
  return tx("projects", "readonly", (s) => s.get(id));
}

export async function deleteProject(id: string): Promise<void> {
  await tx("projects", "readwrite", (s) => s.delete(id));
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await tx("blobs", "readwrite", (s) => s.put(blob, id));
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return tx("blobs", "readonly", (s) => s.get(id));
}
