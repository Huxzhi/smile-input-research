export class Emitter<T> {
  private cbs: Array<(v: T) => void> = []

  on(cb: (v: T) => void): () => void {
    this.cbs.push(cb)
    return () => { this.cbs = this.cbs.filter(c => c !== cb) }
  }

  emit(v: T): void {
    for (const cb of this.cbs) cb(v)
  }
}
