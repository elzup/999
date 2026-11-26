// 区分 (role) の enum 表。DB にはコードだけを書き、表示名はここ 1 か所で引く (D-0161)。
// spec: .metarc/db-design-v4.md §2

// 番号とカードで同じコード (D-0175)。記号の種類は kind で見分ける
export const ROLES = Object.freeze({
  person: { label: '人', kinds: ['num', 'date', 'card'], family: 'person' },
  thing: { label: '物', kinds: ['num', 'date', 'card'], family: 'thing' },
  action: { label: '行動', kinds: ['card'], family: 'action' },
  hex: { label: '語', kinds: ['hex'], family: 'hex' },
})

export const KINDS = Object.freeze(['num', 'date', 'card', 'hex'])

export const roleLabel = (code) => ROLES[code]?.label ?? code

export const isRoleAllowed = (kind, code) =>
  Boolean(ROLES[code]?.kinds.includes(kind))

/**
 * 同じ綴りの語を寄せるときの区分。番号の人とカードの P は同じ «人» として数える。
 * 同じ記号の中で別の family に同じ綴りがあれば、それは別の語 (人のトロ / 物のトロ: D-0163)
 */
export const roleFamily = (code) => ROLES[code]?.family ?? code
