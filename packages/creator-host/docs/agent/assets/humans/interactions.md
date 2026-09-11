# Human interactions

Pickup/carry/put-down and sit/stand use the same supplied person and actual
interaction anchors. Read this page's capability cards for triggers, eligibility,
approach/anchor conditions, parameters, completion and source entry points.

Register reachable targets and correct physical support. Carrying state must refer
to the intended object; sitting state must refer to the intended seat. Proximity
or animation playback alone does not establish completion. NPC requests use the
same supported action and state contracts as player requests.

Exact interfaces and environment conditions:
creator_get_authoring_schema({topic:'character-actions',sections:['commands','humanoid']}).
Use creator_get_examples({topic:'character-actions'}) for bindings. For workspace
sdk/, use the returned current-source link and live eligibility.
Riding is documented with the [animal](../animals/README.md) or
[vehicle](../vehicles/README.md) being ridden.
