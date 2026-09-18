import { hash, is } from 'immutable'
import { type Result, err, ok } from 'neverthrow'

const ABSENT_HASH = hash('Option.empty')

export abstract class Option<T> {
  static of<T>(value: T): Option<T> {
    return new Present(value)
  }

  static empty<T>(): Option<T> {
    return new Absent<T>()
  }

  static fromNullable<T>(value: T | null | undefined): Option<T> {
    return value === null || value === undefined ? Option.empty<T>() : Option.of(value)
  }

  abstract map<U>(transform: (value: T) => U): Option<U>

  abstract andThen<U>(transform: (value: T) => Option<U>): Option<U>

  abstract filter(predicate: (value: T) => boolean): Option<T>

  abstract or(fallback: Option<T>): Option<T>

  abstract unwrapOr(fallback: T): T

  abstract match<U>(onPresent: (value: T) => U, onAbsent: () => U): U

  abstract okOr<E>(error: E): Result<T, E>

  abstract equals(other: unknown): boolean

  abstract hashCode(): number
}

class Present<T> extends Option<T> {
  constructor(private readonly value: T) {
    super()
  }

  override map<U>(transform: (value: T) => U): Option<U> {
    return new Present(transform(this.value))
  }

  override andThen<U>(transform: (value: T) => Option<U>): Option<U> {
    return transform(this.value)
  }

  override filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : Option.empty<T>()
  }

  override or(_fallback: Option<T>): Option<T> {
    return this
  }

  override unwrapOr(_fallback: T): T {
    return this.value
  }

  override match<U>(onPresent: (value: T) => U, _onAbsent: () => U): U {
    return onPresent(this.value)
  }

  override okOr<E>(_error: E): Result<T, E> {
    return ok(this.value)
  }

  override equals(other: unknown): boolean {
    return other instanceof Present && is(this.value, other.value)
  }

  override hashCode(): number {
    return hash(this.value)
  }
}

class Absent<T> extends Option<T> {
  override map<U>(_transform: (value: T) => U): Option<U> {
    return new Absent<U>()
  }

  override andThen<U>(_transform: (value: T) => Option<U>): Option<U> {
    return new Absent<U>()
  }

  override filter(_predicate: (value: T) => boolean): Option<T> {
    return this
  }

  override or(fallback: Option<T>): Option<T> {
    return fallback
  }

  override unwrapOr(fallback: T): T {
    return fallback
  }

  override match<U>(_onPresent: (value: T) => U, onAbsent: () => U): U {
    return onAbsent()
  }

  override okOr<E>(error: E): Result<T, E> {
    return err(error)
  }

  override equals(other: unknown): boolean {
    return other instanceof Absent
  }

  override hashCode(): number {
    return ABSENT_HASH
  }
}
