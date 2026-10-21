/** 轻量 id 生成：前缀 + 时间戳基 + 随机段，够 M1 用；M4 换 crypto.randomUUID 落库。 */
let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${counter.toString(36)}${rand}`;
}
