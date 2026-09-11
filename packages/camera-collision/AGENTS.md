# Camera collision maintenance

Read [the package contract](README.md) and the architecture's camera ownership
rules. This package calculates collision/decollision results; the SDK remains the
sole camera writer and physics owner. Preserve solve/project sampling semantics,
reset state and the distinct ordinary/Humanoid framing policies. Verify both SDK
camera consumers when changing solver behavior.
