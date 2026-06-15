// Tiny pub/sub toast store — no context threading needed. Components call
// toast.success(...) / toast.error(...) / toast.loading(...); <Toaster/> renders.
export type ToastKind = "success" | "error" | "loading" | "info";
export interface ToastItem {
  id: string;
  kind: ToastKind;
  msg: string;
}

let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l(items);
}
function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
function remove(id: string) {
  items = items.filter((t) => t.id !== id);
  const tm = timers.get(id);
  if (tm) {
    clearTimeout(tm);
    timers.delete(id);
  }
  emit();
}
function schedule(id: string, ttl: number) {
  if (ttl > 0) timers.set(id, setTimeout(() => remove(id), ttl));
}

export const toast = {
  show(kind: ToastKind, msg: string, ttl = 3800): string {
    const id = makeId();
    items = [...items, { id, kind, msg }];
    emit();
    schedule(id, ttl);
    return id;
  },
  success(msg: string) {
    return this.show("success", msg);
  },
  error(msg: string) {
    return this.show("error", msg, 5000);
  },
  loading(msg: string) {
    return this.show("loading", msg, 0); // sticky until updated/dismissed
  },
  update(id: string, kind: ToastKind, msg: string, ttl = 3800) {
    const t = items.find((x) => x.id === id);
    if (!t) return this.show(kind, msg, ttl);
    items = items.map((x) => (x.id === id ? { ...x, kind, msg } : x));
    emit();
    schedule(id, ttl);
    return id;
  },
  dismiss(id: string) {
    remove(id);
  },
};

export function subscribeToasts(fn: (items: ToastItem[]) => void) {
  listeners.add(fn);
  fn(items);
  return () => {
    listeners.delete(fn);
  };
}
