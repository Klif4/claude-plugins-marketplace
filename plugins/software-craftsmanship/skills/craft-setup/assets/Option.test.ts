import { List, is } from 'immutable'
import { err, ok } from 'neverthrow'
import { describe, expect, it } from 'vitest'
import { Option } from '@domain/Option'

class NoNicknameChosen {
  readonly _tag = 'NoNicknameChosen'
}

describe('Option', () => {
  it('holds the value it was built from', () => {
    expect(Option.of('Camille').unwrapOr('anonymous')).toBe('Camille')
  })

  it('falls back when it holds nothing', () => {
    expect(Option.empty<string>().unwrapOr('anonymous')).toBe('anonymous')
  })

  it('reads a present value out of a nullable boundary value', () => {
    expect(Option.fromNullable('Camille')).toStrictEqual(Option.of('Camille'))
  })

  it.each([
    { raw: null, case: 'null' },
    { raw: undefined, case: 'undefined' },
  ])('reads $case out of a nullable boundary value as an empty option', ({ raw }) => {
    expect(Option.fromNullable<string>(raw)).toStrictEqual(Option.empty<string>())
  })

  it('transforms the value it holds', () => {
    expect(Option.of('Camille').map((name) => name.length)).toStrictEqual(Option.of(7))
  })

  it('transforms nothing when it holds nothing', () => {
    expect(Option.empty<string>().map((name) => name.length)).toStrictEqual(Option.empty<number>())
  })

  it('chains into another option when it holds a value', () => {
    expect(Option.of('Camille').andThen((name) => Option.of(name.toUpperCase())))
      .toStrictEqual(Option.of('CAMILLE'))
  })

  it('chains into nothing when it holds nothing', () => {
    expect(Option.empty<string>().andThen((name) => Option.of(name.toUpperCase())))
      .toStrictEqual(Option.empty<string>())
  })

  it('keeps the value it holds when the predicate accepts it', () => {
    expect(Option.of('Camille').filter((name) => name.length > 3)).toStrictEqual(Option.of('Camille'))
  })

  it('empties itself when the predicate rejects the value it holds', () => {
    expect(Option.of('Jo').filter((name) => name.length > 3)).toStrictEqual(Option.empty<string>())
  })

  it('stays empty under any predicate', () => {
    expect(Option.empty<string>().filter((name) => name.length > 3)).toStrictEqual(Option.empty<string>())
  })

  it('ignores the fallback option when it holds a value', () => {
    expect(Option.of('Camille').or(Option.of('anonymous'))).toStrictEqual(Option.of('Camille'))
  })

  it('takes the fallback option when it holds nothing', () => {
    expect(Option.empty<string>().or(Option.of('anonymous'))).toStrictEqual(Option.of('anonymous'))
  })

  it('matches the present branch when it holds a value', () => {
    expect(Option.of('Camille').match((name) => `Hello ${name}`, () => 'Hello there')).toBe('Hello Camille')
  })

  it('matches the absent branch when it holds nothing', () => {
    expect(Option.empty<string>().match((name) => `Hello ${name}`, () => 'Hello there')).toBe('Hello there')
  })

  it('becomes a successful result carrying the value it holds', () => {
    expect(Option.of('Camille').okOr(new NoNicknameChosen())).toStrictEqual(ok('Camille'))
  })

  it('becomes the named failure when it holds nothing', () => {
    expect(Option.empty<string>().okOr(new NoNicknameChosen()))
      .toStrictEqual(err(new NoNicknameChosen()))
  })

  it.each([
    { left: Option.of(List.of('Camille')), right: Option.of(List.of('Camille')), equal: true, case: 'two options over equal values' },
    { left: Option.of(List.of('Camille')), right: Option.of(List.of('Dominique')), equal: false, case: 'two options over different values' },
    { left: Option.of(List.of('Camille')), right: Option.empty<List<string>>(), equal: false, case: 'a present and an empty option' },
    { left: Option.empty<List<string>>(), right: Option.of(List.of('Camille')), equal: false, case: 'an empty and a present option' },
    { left: Option.empty<List<string>>(), right: Option.empty<List<string>>(), equal: true, case: 'two empty options' },
  ])('compares $case structurally', ({ left, right, equal }) => {
    expect(is(left, right)).toBe(equal)
  })

  it('hashes two options over equal values identically', () => {
    expect(Option.of(List.of('Camille')).hashCode()).toBe(Option.of(List.of('Camille')).hashCode())
  })

  it('hashes every empty option identically', () => {
    expect(Option.empty<string>().hashCode()).toBe(Option.empty<number>().hashCode())
  })
})
