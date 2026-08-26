# Terrain Height Intent golden exemplars

This directory contains the small, reviewed reference library for generating continuous
signed-color terrain Height Intent rasters. The machine-readable authority is
`golden-exemplars.json`.

An exemplar is admitted only when its source experiment records semantic sign checks,
encoding measurements, deterministic compiler evidence, and a rendered judgment. It is
used only as an encoding-style reference for a compatible terrain family. User
references and the scene World Plan remain spatial authorities.

Candidates stay under `artifacts/terrain-experiments/`. Copying a candidate into this
directory and adding a hash-bound manifest row is an explicit acceptance decision.
There is no universal fallback exemplar: missing family coverage stays missing.

The generated image remains untrusted even when it resembles a golden exemplar. The
trusted Host must project, normalize, constrain, and compile it before Runtime use.
