"""Shared Kubernetes Lease admission for cloud production CPU/provider pools."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from cloud_seedance_slots import GlobalSeedanceLeasePool, SeedanceSlotLease


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "config" / "cloud-production-throughput.json"
POOL_SETTINGS = {
    "gemini": ("gemini", "worldkit-gemini-slot"),
    "media-conformance": ("mediaConformance", "worldkit-media-conformance-slot"),
}


def acquire_global_production_slot(
    pool_name: str,
    task_identity: dict[str, Any] | str,
) -> SeedanceSlotLease | None:
    """Acquire one cross-Worker slot; local/developer execution remains unbounded."""
    if not os.environ.get("WORLDKIT_CLOUD_EXECUTION_ID"):
        return None
    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    profile_key, lease_prefix = POOL_SETTINGS[pool_name]
    slot_count = int(profile["pools"][profile_key])
    identity = task_identity if isinstance(task_identity, str) else json.dumps(
        task_identity,
        sort_keys=True,
        separators=(",", ":"),
    )
    return GlobalSeedanceLeasePool(
        namespace="lwdp",
        lease_name_prefix=lease_prefix,
        slot_count=slot_count,
        lease_duration_seconds=900,
        poll_interval_seconds=5,
        pool_name=pool_name,
    ).acquire(identity, 21_600)
