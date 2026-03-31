/**
 * Size-bounded LRU Map that evicts by total byte size of values.
 * Uses Map insertion order for LRU eviction (oldest first).
 */
export class LruStringMap {
  private map = new Map<string, string>();
  private currentBytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  /** Returns false if the value was too large to store (exceeds maxBytes). */
  set(key: string, value: string): boolean {
    // Remove old entry if exists
    const old = this.map.get(key);
    if (old !== undefined) {
      this.currentBytes -= old.length * 2; // JS string ≈ 2 bytes per char
      this.map.delete(key);
    }

    const valueBytes = value.length * 2;

    // Skip if single value exceeds budget
    if (valueBytes > this.maxBytes) return false;

    // Evict oldest entries until we have room
    while (this.currentBytes + valueBytes > this.maxBytes && this.map.size > 0) {
      const first = this.map.keys().next();
      if (first.done) break;
      const evicted = this.map.get(first.value)!;
      this.currentBytes -= evicted.length * 2;
      this.map.delete(first.value);
    }

    this.map.set(key, value);
    this.currentBytes += valueBytes;
    return true;
  }

  delete(key: string): boolean {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.currentBytes -= val.length * 2;
      this.map.delete(key);
      return true;
    }
    return false;
  }

  get size(): number { return this.map.size; }
  get bytes(): number { return this.currentBytes; }
}
