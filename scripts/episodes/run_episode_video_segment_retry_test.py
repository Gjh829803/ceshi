import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("run-episode-video-segment.py")
SPEC = importlib.util.spec_from_file_location("run_episode_video_segment", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SeedanceRetryContractTest(unittest.TestCase):
    def test_terminal_failure_prefix_is_retryable_before_attempt_three(self) -> None:
        error = MODULE.EpisodeVideoError("SEEDANCE task failed: content check rejected")
        self.assertTrue(MODULE.should_retry_terminal_task(error, "SEEDANCE", 1))

    def test_attempt_three_is_terminal(self) -> None:
        error = MODULE.EpisodeVideoError("SEEDANCE task failed: content check rejected")
        self.assertFalse(MODULE.should_retry_terminal_task(error, "SEEDANCE", 3))

    def test_non_terminal_transport_error_is_not_reclassified(self) -> None:
        error = MODULE.EpisodeVideoError("SEEDANCE poll timed out")
        self.assertFalse(MODULE.should_retry_terminal_task(error, "SEEDANCE", 1))

    def test_stage_name_must_match(self) -> None:
        error = MODULE.EpisodeVideoError("UPSCALE task failed: provider rejected")
        self.assertFalse(MODULE.should_retry_terminal_task(error, "SEEDANCE", 1))


if __name__ == "__main__":
    unittest.main()
