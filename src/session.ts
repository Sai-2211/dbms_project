const storageKey = "landledger.tab";

// A tab ID is a selector, never an authentication credential. The credential stays HttpOnly.
// Hold a Web Lock for the document lifetime so duplicating a tab cannot clone its identity.
export async function claimTabId(
  storage: Pick<Storage, "getItem" | "setItem">,
  locks: Pick<LockManager, "request"> | undefined,
  randomId: () => string = () => crypto.randomUUID(),
): Promise<string> {
  const previous = storage.getItem(storageKey);
  let id =
    previous &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      previous,
    )
      ? previous
      : randomId();
  if (!locks) {
    // Older browsers fail closed: a reload needs sign-in instead of sharing a cloned identity.
    id = randomId();
    storage.setItem(storageKey, id);
    return id;
  }
  for (;;) {
    const claimed = await new Promise<boolean>((resolve, reject) => {
      void locks
        .request(
          `landledger-tab-${id}`,
          { ifAvailable: true },
          async (lock) => {
            resolve(!!lock);
            if (lock) await new Promise<void>(() => {});
          },
        )
        .catch(reject);
    });
    if (claimed) {
      storage.setItem(storageKey, id);
      return id;
    }
    id = randomId();
  }
}
let ready: Promise<string> | undefined;
export function getTabId() {
  return (ready ??= claimTabId(sessionStorage, navigator.locks));
}
