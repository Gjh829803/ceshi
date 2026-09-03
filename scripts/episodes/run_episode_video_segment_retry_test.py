import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch


MODULE_PATH = Path(__file__).with_name("run-episode-video-segment.py")
SPEC = importlib.util.spec_from_file_location("run_episode_video_segment", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body
        self.ok = 200 <= status_code < 300
        self.text = json.dumps(body)

    def json(self):
        return self._body


class Seedance25ContractTest(unittest.TestCase):
    def test_repository_root_and_default_config_are_project_local(self) -> None:
        self.assertEqual(MODULE.REPO_ROOT, MODULE_PATH.parents[2])
        self.assertTrue(MODULE.DEFAULT_CONFIG.is_file())

    def test_pipeline_uses_direct_seedance_25_720p_without_upscale(self) -> None:
        config = json.loads(MODULE.DEFAULT_CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["schemaVersion"], 2)
        self.assertEqual(config["captureCount"], 6)
        self.assertEqual(config["seedanceCaptureIndices"], [0, 1, 2, 3, 4, 5])
        self.assertEqual(config["eventCaptureIndices"], [0, 2, 4])
        self.assertEqual(config["seedance"]["model"], "seedance-2.5")
        self.assertEqual(config["seedance"]["resolution"], "720p")
        self.assertEqual(config["seedance"]["duration"], 30)
        self.assertTrue(config["seedance"]["generateAudio"])
        self.assertNotIn("upscale", config)
        self.assertEqual(
            config["seedanceProvider"]["credentialFile"],
            ".codex-tmp/runtime-config/infinite-canvas.key",
        )
        self.assertEqual(config["seedanceProvider"]["maxConcurrentJobs"], 10)
        self.assertEqual(config["seedanceProvider"]["globalConcurrency"]["slotCount"], 96)
        self.assertEqual(config["seedanceProvider"]["maxTerminalAttempts"], 2)

    def test_idempotency_header_is_kept_separate_from_bearer_key(self) -> None:
        headers = MODULE.api_headers("secret", idempotency_key="stable-task-key")
        self.assertEqual(headers["Authorization"], "Bearer secret")
        self.assertEqual(headers["Idempotency-Key"], "stable-task-key")
        self.assertEqual(headers["Content-Type"], "application/json")

    def test_cloud_provider_uses_the_configured_shared_slot_pool(self) -> None:
        lease = object()
        pool = MagicMock()
        pool.acquire.return_value = lease
        provider = {
            "globalConcurrency": {
                "enabledInCloud": True,
                "namespace": "lwdp",
                "leaseNamePrefix": "worldkit-seedance-slot",
                "slotCount": 20,
                "leaseDurationSeconds": 900,
                "waitTimeoutSeconds": 21600,
                "pollIntervalSeconds": 5,
            },
        }
        with patch.dict(os.environ, {"WORLDKIT_CLOUD_EXECUTION_ID": "exec_episode"}), patch.object(
            MODULE, "GlobalSeedanceLeasePool", return_value=pool
        ) as constructor:
            acquired = MODULE.acquire_global_seedance_slot(
                provider,
                task_identity="episode/style/segment",
            )
        self.assertIs(acquired, lease)
        self.assertEqual(constructor.call_args.kwargs["slot_count"], 20)
        pool.acquire.assert_called_once_with("episode/style/segment", 21600.0)

    def test_local_provider_does_not_consume_a_cloud_slot(self) -> None:
        provider = {"globalConcurrency": {"enabledInCloud": True, "slotCount": 20}}
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(MODULE.acquire_global_seedance_slot(
                provider,
                task_identity="episode/style/segment",
            ))

    def test_cloud_provider_journal_is_namespaced_by_style_variant(self) -> None:
        with tempfile.TemporaryDirectory() as root, patch.dict(
            os.environ,
            {"WORLDKIT_PROVIDER_JOURNAL_S3_PREFIX": "s3://bucket/provider-journals"},
            clear=False,
        ), patch.object(MODULE.subprocess, "run") as upload:
            destination = Path(root) / "provider-run.json"
            MODULE.persist_provider_record(destination, {
                "episodeId": "episode-case-001",
                "styleVariantId": "style-03",
                "segmentId": "segment-04",
                "status": "seedance-submitted",
            })
        self.assertEqual(
            upload.call_args.args[0][-1],
            "s3://bucket/provider-journals/episode-case-001/style-03/segment-04/provider-run.json",
        )

    def test_retryable_submit_reuses_exact_payload_and_idempotency_key(self) -> None:
        provider = {"baseUrl": "https://provider.test", "submitPath": "/v1/videos"}
        payload = {
            "model": "seedance-2.5",
            "prompt": "fixture",
            "duration": 30,
            "resolution": "720p",
            "ratio": "16:9",
            "generate_audio": True,
            "images": ["https://assets.test/a.png"],
            "videos": ["https://assets.test/a.mp4"],
        }
        responses = [
            FakeResponse(502, {"error": {"message": "temporary"}}),
            FakeResponse(200, {"data": {"id": "job-seedance-25"}}),
        ]
        calls = []

        def fake_post(url, *, headers, json, timeout):
            calls.append((url, headers, json, timeout))
            return responses.pop(0)

        with patch.object(MODULE.requests, "post", side_effect=fake_post), patch.object(
            MODULE.time, "sleep", return_value=None
        ):
            job_id = MODULE.submit_job(
                provider=provider,
                api_key="secret",
                idempotency_key="stable-task-key",
                payload=payload,
            )
        self.assertEqual(job_id, "job-seedance-25")
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][1]["Idempotency-Key"], "stable-task-key")
        self.assertEqual(calls[1][1]["Idempotency-Key"], "stable-task-key")
        self.assertEqual(calls[0][2], payload)
        self.assertEqual(calls[1][2], payload)

    def test_only_documented_terminal_failures_are_terminal(self) -> None:
        self.assertEqual(MODULE.TERMINAL_FAILURE, {"failed", "refunded"})

    def test_poll_exposes_provider_terminal_status_without_losing_it(self) -> None:
        provider = {
            "baseUrl": "https://provider.test",
            "pollPathTemplate": "/v1/videos/{taskId}",
            "pollIntervalSeconds": 5,
            "timeoutSeconds": 60,
        }
        response = FakeResponse(200, {
            "data": {
                "status": "refunded",
                "stage": "refunded",
                "error": "You may not use this feature on the free plan.",
            },
        })
        with patch.object(MODULE.requests, "get", return_value=response):
            with self.assertRaises(MODULE.EpisodeVideoProviderTerminalError) as raised:
                MODULE.poll_job(provider, "secret", "job-refunded")
        self.assertEqual(raised.exception.status, "refunded")
        self.assertIn("free plan", raised.exception.detail)

    def test_raw_checkpoint_requires_matching_hash_and_complete_media(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            raw = Path(root) / "seedance-2.5.mp4"
            raw.write_bytes(b"complete-provider-video")
            receipt = {"sha256": MODULE.sha256(raw)}
            with patch.object(MODULE, "probe", return_value={
                "durationSeconds": 30,
                "hasAudio": True,
            }):
                self.assertTrue(MODULE.raw_checkpoint_is_valid(raw, receipt))
                raw.write_bytes(b"corrupt")
                self.assertFalse(MODULE.raw_checkpoint_is_valid(raw, receipt))

    def test_cloud_provider_journal_is_uploaded_immediately_after_local_commit(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            result = Path(root) / "provider-run.json"
            record = {
                "episodeId": "episode-scene-001",
                "segmentId": "segment-00",
                "status": "seedance-submitted",
                "providerJobId": "provider-job-001",
            }
            with patch.dict(os.environ, {
                "WORLDKIT_PROVIDER_JOURNAL_S3_PREFIX": "s3://bucket/provider-journals",
            }, clear=False), patch.object(MODULE.subprocess, "run") as run:
                MODULE.persist_provider_record(result, record)
            self.assertEqual(json.loads(result.read_text(encoding="utf-8")), record)
            self.assertEqual(run.call_args.args[0], [
                "aws", "s3", "cp", "--only-show-errors", str(result),
                "s3://bucket/provider-journals/episode-scene-001/segment-00/provider-run.json",
            ])


if __name__ == "__main__":
    unittest.main()
