// 非组件层（queryFn 等）读取 syncNow 的桥接：避免 useRecords 直接 import Provider 循环依赖。
let bridge: (() => void) | undefined;

export function setSyncNowBridge(impl: () => void) {
  bridge = impl;
}

export function getSyncNow() {
  return bridge ?? (() => undefined);
}
