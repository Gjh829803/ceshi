# Planner to Block Builder contract

The Planner writes a compact Scene Brief, generates the 16:9 entry-intent view
first, then generates a complete top-down world plan from that exact entry PNG
and the uploaded reference. Both use
the immutable Block World colors for support, collision, interaction, water,
cloud, visual-only mass, the Subject marker, and ordered complete landmarks. It
does not define coordinates, geometry, preset refs, Subject refs, or camera
numbers. The Block Builder consumes those intent artifacts and makes
`world.mjs` the first and only geometry authority.

The current Planner always produces one continuous geographic world. Its
top-down footprint covers at least four times the reference-visible geographic
area with meaningful continuation rather than padding. The Brief contains one
or more ordered movement modes. Only ground-motion support is marked as a
traversable area; flight, swimming, and water-surface domains have no route
overlay. Ground connectivity is required only for ground-only mode sets.

After structural self-check, Builder runs the Skill-owned visual-review script
and inspects left-Planner/right-Builder top-down and entry comparisons before it
finishes. These are feedback images, not Runtime evidence or an automatic
similarity Gate.

The current hosted sequence and artifact ownership are documented in
[`Hosted Scene Brief and Evaluation Workflow`](22-hosted-scene-brief-and-evaluation.md).
