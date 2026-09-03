from __future__ import annotations

import copy
import unittest
from datetime import datetime, timedelta, timezone

from cloud_seedance_slots import GlobalSeedanceLeasePool, SeedanceSlotError


class FakeStore:
    def __init__(self) -> None:
        self.values = {}
        self.revision = 0

    def _write(self, manifest):
        self.revision += 1
        value = copy.deepcopy(manifest)
        value.setdefault("metadata", {})["resourceVersion"] = str(self.revision)
        self.values[value["metadata"]["name"]] = value
        return copy.deepcopy(value)

    def get(self, name):
        value = self.values.get(name)
        return copy.deepcopy(value) if value else None

    def create(self, manifest):
        if manifest["metadata"]["name"] in self.values:
            return None
        return self._write(manifest)

    def replace(self, manifest):
        name = manifest["metadata"]["name"]
        current = self.values.get(name)
        if not current or current["metadata"]["resourceVersion"] != manifest["metadata"]["resourceVersion"]:
            return None
        return self._write(manifest)


class GlobalSeedanceLeasePoolTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 3, tzinfo=timezone.utc)
        self.monotonic = 0.0
        self.store = FakeStore()

    def pool(self, slots=2):
        return GlobalSeedanceLeasePool(
            namespace="lwdp",
            lease_name_prefix="worldkit-seedance-slot",
            slot_count=slots,
            lease_duration_seconds=60,
            poll_interval_seconds=1,
            store=self.store,
            now=lambda: self.now,
            monotonic=lambda: self.monotonic,
            sleep=self.advance,
        )

    def advance(self, seconds):
        self.monotonic += seconds
        self.now += timedelta(seconds=seconds)

    def test_limits_global_holders_and_reuses_released_slot(self):
        pool = self.pool()
        first = pool.acquire("episode-a/style-00/segment-00", 1)
        second = pool.acquire("episode-b/style-00/segment-00", 1)
        with self.assertRaises(SeedanceSlotError):
            pool.acquire("episode-c/style-00/segment-00", 1)
        first.__exit__(None, None, None)
        replacement = pool.acquire("episode-c/style-00/segment-00", 1)
        self.assertNotEqual(replacement.holder_identity, second.holder_identity)

    def test_reclaims_expired_worker_lease(self):
        pool = self.pool(slots=1)
        first = pool.acquire("episode-a/style-00/segment-00", 1)
        self.advance(61)
        replacement = pool.acquire("episode-b/style-00/segment-00", 1)
        self.assertEqual(first.name, replacement.name)

    def test_renewal_preserves_holder(self):
        pool = self.pool(slots=1)
        lease = pool.acquire("episode-a/style-00/segment-00", 1)
        self.advance(40)
        self.assertTrue(pool.renew(lease.name, lease.holder_identity))
        self.advance(40)
        with self.assertRaises(SeedanceSlotError):
            pool.acquire("episode-b/style-00/segment-00", 1)

    def test_supports_a_distinct_global_pool_without_sharing_seedance_leases(self):
        pool = GlobalSeedanceLeasePool(
            namespace="lwdp",
            lease_name_prefix="worldkit-gemini-slot",
            slot_count=1,
            lease_duration_seconds=60,
            pool_name="gemini",
            store=self.store,
            now=lambda: self.now,
            monotonic=lambda: self.monotonic,
            sleep=self.advance,
        )
        lease = pool.acquire("episode-a/style-00/gemini", 1)
        self.assertEqual(
            self.store.values[lease.name]["metadata"]["labels"][
                "worldkit.seedleap.dev/pool"
            ],
            "gemini",
        )


if __name__ == "__main__":
    unittest.main()
