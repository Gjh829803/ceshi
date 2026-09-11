# Browser capture maintenance

Own shared browser launch and video encoding only. Preserve browser selection,
GPU/software-rendering policy, frame timing, encoder arguments and cleanup.
Creator and Episode own their input plans and capture transactions; this package
does not advance the SDK clock or add a simulation or camera owner.
Validate both actual consumers when launch or encoding behavior changes.

Keep implementation in `src/` and regression tests in `tests/`; the package root
contains metadata and documentation only.
