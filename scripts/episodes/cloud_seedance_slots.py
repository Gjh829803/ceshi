"""Kubernetes Lease backed global Seedance concurrency slots.

The Lease pool is shared by every cloud Episode Worker. A slot covers the
provider Job from submission through terminal download; local image/video
preparation and final ffmpeg conformance do not consume provider capacity.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable


class SeedanceSlotError(RuntimeError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _rfc3339(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parsed_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class KubectlLeaseStore:
    def __init__(self, namespace: str) -> None:
        self.namespace = namespace

    def _run(self, args: list[str], body: dict[str, Any] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["kubectl", "-n", self.namespace, *args],
            input=None if body is None else json.dumps(body),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    def get(self, name: str) -> dict[str, Any] | None:
        result = self._run(["get", "lease", name, "-o", "json"])
        if result.returncode == 0:
            return json.loads(result.stdout)
        if "NotFound" in result.stderr or "not found" in result.stderr.lower():
            return None
        raise SeedanceSlotError(f"kubectl get Lease failed: {result.stderr.strip()[:500]}")

    def create(self, manifest: dict[str, Any]) -> dict[str, Any] | None:
        result = self._run(["create", "-f", "-", "-o", "json"], manifest)
        if result.returncode == 0:
            return json.loads(result.stdout)
        if "AlreadyExists" in result.stderr or "already exists" in result.stderr.lower():
            return None
        raise SeedanceSlotError(f"kubectl create Lease failed: {result.stderr.strip()[:500]}")

    def replace(self, manifest: dict[str, Any]) -> dict[str, Any] | None:
        result = self._run(["replace", "-f", "-", "-o", "json"], manifest)
        if result.returncode == 0:
            return json.loads(result.stdout)
        if "Conflict" in result.stderr or "the object has been modified" in result.stderr.lower():
            return None
        if "NotFound" in result.stderr or "not found" in result.stderr.lower():
            return None
        raise SeedanceSlotError(f"kubectl replace Lease failed: {result.stderr.strip()[:500]}")


@dataclass
class SeedanceSlotLease:
    pool: "GlobalSeedanceLeasePool"
    name: str
    holder_identity: str
    _stop: threading.Event | None = None
    _thread: threading.Thread | None = None

    def __enter__(self) -> "SeedanceSlotLease":
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._renew_loop, daemon=True)
        self._thread.start()
        return self

    def _renew_loop(self) -> None:
        assert self._stop is not None
        interval = max(10.0, self.pool.lease_duration_seconds / 3)
        while not self._stop.wait(interval):
            try:
                if not self.pool.renew(self.name, self.holder_identity):
                    print(f"WORLDKIT_SEEDANCE_SLOT_RENEW_WARNING {self.name}", flush=True)
            except Exception as error:  # noqa: BLE001 - renewal remains best effort
                print(
                    f"WORLDKIT_SEEDANCE_SLOT_RENEW_WARNING {self.name} {type(error).__name__}",
                    flush=True,
                )

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        if self._stop is not None:
            self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        try:
            self.pool.release(self.name, self.holder_identity)
        except Exception as error:  # noqa: BLE001 - expiry is the crash fallback
            print(
                f"WORLDKIT_SEEDANCE_SLOT_RELEASE_WARNING {self.name} {type(error).__name__}",
                flush=True,
            )


class GlobalSeedanceLeasePool:
    def __init__(
        self,
        *,
        namespace: str,
        lease_name_prefix: str,
        slot_count: int,
        lease_duration_seconds: int,
        poll_interval_seconds: float = 5,
        store: Any | None = None,
        now: Callable[[], datetime] = _utc_now,
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not namespace or not lease_name_prefix:
            raise SeedanceSlotError("Seedance slot namespace and prefix are required")
        if slot_count < 1 or slot_count > 100:
            raise SeedanceSlotError("Seedance slot count must be between 1 and 100")
        if lease_duration_seconds < 60 or lease_duration_seconds > 7200:
            raise SeedanceSlotError("Seedance slot lease duration must be between 60 and 7200")
        self.namespace = namespace
        self.lease_name_prefix = lease_name_prefix
        self.slot_count = slot_count
        self.lease_duration_seconds = lease_duration_seconds
        self.poll_interval_seconds = max(0.05, poll_interval_seconds)
        self.store = store or KubectlLeaseStore(namespace)
        self.now = now
        self.monotonic = monotonic
        self.sleep = sleep

    def _name(self, index: int) -> str:
        return f"{self.lease_name_prefix}-{index:02d}"

    def _manifest(
        self,
        name: str,
        holder_identity: str,
        now: datetime,
        *,
        resource_version: str | None = None,
        acquire_time: str | None = None,
        transitions: int = 0,
    ) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "name": name,
            "namespace": self.namespace,
            "labels": {"worldkit.seedleap.dev/pool": "seedance"},
        }
        if resource_version:
            metadata["resourceVersion"] = resource_version
        return {
            "apiVersion": "coordination.k8s.io/v1",
            "kind": "Lease",
            "metadata": metadata,
            "spec": {
                "holderIdentity": holder_identity,
                "leaseDurationSeconds": self.lease_duration_seconds,
                "acquireTime": acquire_time or _rfc3339(now),
                "renewTime": _rfc3339(now),
                "leaseTransitions": transitions,
            },
        }

    def _available(self, lease: dict[str, Any], now: datetime, holder_identity: str) -> bool:
        spec = lease.get("spec") or {}
        holder = str(spec.get("holderIdentity") or "")
        if not holder or holder == holder_identity:
            return True
        renewed = _parsed_time(spec.get("renewTime")) or _parsed_time(spec.get("acquireTime"))
        duration = int(spec.get("leaseDurationSeconds") or self.lease_duration_seconds)
        return renewed is None or renewed + timedelta(seconds=duration) <= now

    def _claim(self, name: str, holder_identity: str) -> dict[str, Any] | None:
        now = self.now()
        current = self.store.get(name)
        if current is None:
            return self.store.create(self._manifest(name, holder_identity, now))
        if not self._available(current, now, holder_identity):
            return None
        metadata = current.get("metadata") or {}
        spec = current.get("spec") or {}
        previous_holder = str(spec.get("holderIdentity") or "")
        transitions = int(spec.get("leaseTransitions") or 0)
        if previous_holder and previous_holder != holder_identity:
            transitions += 1
        return self.store.replace(self._manifest(
            name,
            holder_identity,
            now,
            resource_version=str(metadata.get("resourceVersion") or ""),
            acquire_time=spec.get("acquireTime") if previous_holder == holder_identity else None,
            transitions=transitions,
        ))

    def acquire(self, task_identity: str, wait_timeout_seconds: float) -> SeedanceSlotLease:
        if not task_identity:
            raise SeedanceSlotError("Seedance task identity is required")
        holder_identity = "worldkit-" + hashlib.sha256(task_identity.encode()).hexdigest()[:48]
        start_index = int(hashlib.sha256(holder_identity.encode()).hexdigest()[:8], 16) % self.slot_count
        deadline = self.monotonic() + max(1, wait_timeout_seconds)
        while True:
            for offset in range(self.slot_count):
                name = self._name((start_index + offset) % self.slot_count)
                claimed = self._claim(name, holder_identity)
                if claimed is not None:
                    print(f"WORLDKIT_SEEDANCE_SLOT_ACQUIRED {name}", flush=True)
                    return SeedanceSlotLease(self, name, holder_identity)
            remaining = deadline - self.monotonic()
            if remaining <= 0:
                raise SeedanceSlotError("Timed out waiting for a global Seedance slot")
            self.sleep(min(self.poll_interval_seconds, remaining))

    def renew(self, name: str, holder_identity: str) -> bool:
        current = self.store.get(name)
        if current is None or (current.get("spec") or {}).get("holderIdentity") != holder_identity:
            return False
        metadata = current.get("metadata") or {}
        spec = current.get("spec") or {}
        return self.store.replace(self._manifest(
            name,
            holder_identity,
            self.now(),
            resource_version=str(metadata.get("resourceVersion") or ""),
            acquire_time=spec.get("acquireTime"),
            transitions=int(spec.get("leaseTransitions") or 0),
        )) is not None

    def release(self, name: str, holder_identity: str) -> None:
        for _attempt in range(3):
            current = self.store.get(name)
            if current is None or (current.get("spec") or {}).get("holderIdentity") != holder_identity:
                return
            metadata = current.get("metadata") or {}
            spec = current.get("spec") or {}
            released = self._manifest(
                name,
                "",
                self.now(),
                resource_version=str(metadata.get("resourceVersion") or ""),
                transitions=int(spec.get("leaseTransitions") or 0),
            )
            if self.store.replace(released) is not None:
                print(f"WORLDKIT_SEEDANCE_SLOT_RELEASED {name}", flush=True)
                return
