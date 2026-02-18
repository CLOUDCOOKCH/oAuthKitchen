/**
 * Simple TTL-based cache for OAuthKitchen.
 *
 * Stores values with automatic expiration based on TTL (Time To Live).
 */

export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Simple key-value cache with TTL support.
 */
class Cache {
  private store: Map<string, CacheEntry<unknown>> = new Map()
  private maxSize = 500

  /**
   * Set a value in the cache with TTL in seconds.
   */
  set<T>(key: string, value: T, ttlSeconds: number = 3600): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })

    // Prune if cache gets too large
    if (this.store.size > this.maxSize) {
      this._pruneExpired()
    }

    // If still too large, remove oldest entries
    if (this.store.size > this.maxSize) {
      const entriesToRemove = this.store.size - this.maxSize
      let removed = 0
      for (const key of this.store.keys()) {
        if (removed >= entriesToRemove) break
        this.store.delete(key)
        removed++
      }
    }
  }

  /**
   * Get a value from the cache. Returns null if not found or expired.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined

    if (!entry) return null

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value
  }

  /**
   * Check if a key exists in the cache and hasn't expired.
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Delete a key from the cache.
   */
  delete(key: string): void {
    this.store.delete(key)
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * Get the current number of entries in the cache.
   */
  size(): number {
    return this.store.size
  }

  /**
   * Get all keys currently in the cache (including expired).
   */
  keys(): string[] {
    return Array.from(this.store.keys())
  }

  /**
   * Remove all expired entries from the cache.
   */
  private _pruneExpired(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key)
    }
  }

  /**
   * Get statistics about the cache.
   */
  getStats(): {
    size: number
    maxSize: number
    estimatedMemoryUsage: string
  } {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      estimatedMemoryUsage: `~${Math.round(this.store.size * 2)} KB`,
    }
  }
}

/**
 * Global cache instance.
 */
export const globalCache = new Cache()

export default globalCache
