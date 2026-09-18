# 单主旋翼直升机

稳定 ID: `vehicle.helicopter @ 0.1.1`

本版本复用 `0.1.0` 的原始 GLB 与预览字节，只新增明确的 Whitebox/Creator 绑定。运行时由 `@worldkit/three` 的 `aircraftSubtype: 'helicopter'` 提供；GLB 中两个同名 `aircraft-rotor` 枢轴按遍历顺序对应主旋翼和尾旋翼。
