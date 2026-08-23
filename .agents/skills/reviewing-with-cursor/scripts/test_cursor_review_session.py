#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest


SCRIPT_PATH = Path(__file__).with_name("cursor_review_session.py")


class CursorReviewSessionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        subprocess.run(
            ["git", "init", "-q", str(self.workspace)],
            check=True,
        )
        self.state_file = self.root / "sessions.json"
        self.prompt_file = self.root / "prompt.md"
        self.prompt_file.write_text("Review the staged change.", encoding="utf-8")
        self.log_file = self.root / "agent-log.jsonl"
        self.counter_file = self.root / "agent-counter.txt"
        self.fake_agent = self.root / "agent"
        self.fake_agent.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env python3
                import json
                import os
                from pathlib import Path
                import sys

                log_path = Path(os.environ["FAKE_AGENT_LOG"])
                with log_path.open("a", encoding="utf-8") as stream:
                    stream.write(json.dumps(sys.argv[1:]) + "\\n")

                if "create-chat" in sys.argv:
                    counter_path = Path(os.environ["FAKE_AGENT_COUNTER"])
                    count = int(counter_path.read_text() or "0") if counter_path.exists() else 0
                    count += 1
                    counter_path.write_text(str(count))
                    print(f"chat-{count:03d}")
                else:
                    if os.environ.get("FAKE_AGENT_REVIEW_EXIT"):
                        print("Workspace Trust Required", file=sys.stderr)
                        raise SystemExit(int(os.environ["FAKE_AGENT_REVIEW_EXIT"]))
                    print("REVIEW_OK")
                """
            ),
            encoding="utf-8",
        )
        self.fake_agent.chmod(0o755)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def run_script(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment.update(
            {
                "CURSOR_AGENT_BIN": str(self.fake_agent),
                "FAKE_AGENT_LOG": str(self.log_file),
                "FAKE_AGENT_COUNTER": str(self.counter_file),
            }
        )
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "run",
                "--workspace",
                str(self.workspace),
                "--state-file",
                str(self.state_file),
                "--prompt-file",
                str(self.prompt_file),
                *arguments,
            ],
            check=check,
            capture_output=True,
            text=True,
            env=environment,
        )

    def read_log(self) -> list[list[str]]:
        if not self.log_file.exists():
            return []
        return [json.loads(line) for line in self.log_file.read_text().splitlines()]

    def test_design_review_reuses_one_explicit_session(self) -> None:
        first = self.run_script("--stage", "m5-r1", "--role", "design")
        second = self.run_script("--stage", "m5-r1", "--role", "design")

        self.assertIn("REVIEW_OK", first.stdout)
        self.assertIn("REVIEW_OK", second.stdout)
        calls = self.read_log()
        create_calls = [call for call in calls if "create-chat" in call]
        review_calls = [call for call in calls if "--resume" in call]
        self.assertEqual(len(create_calls), 1)
        self.assertEqual(len(review_calls), 2)
        self.assertTrue(all(call[call.index("--resume") + 1] == "chat-001" for call in review_calls))
        self.assertTrue(all("--continue" not in call for call in calls))
        self.assertTrue(
            all(
                "--force" not in call and "--yolo" not in call and "--trust" not in call
                for call in calls
            )
        )

    def test_code_review_isolated_by_review_id(self) -> None:
        self.run_script("--stage", "m5-r1", "--role", "code", "--review-id", "task-2")
        self.run_script("--stage", "m5-r1", "--role", "code", "--review-id", "task-2")
        self.run_script("--stage", "m5-r1", "--role", "code", "--review-id", "task-3")

        calls = self.read_log()
        create_calls = [call for call in calls if "create-chat" in call]
        review_calls = [call for call in calls if "--resume" in call]
        self.assertEqual(len(create_calls), 2)
        self.assertEqual(
            [call[call.index("--resume") + 1] for call in review_calls],
            ["chat-001", "chat-001", "chat-002"],
        )

    def test_non_design_review_requires_review_id(self) -> None:
        result = self.run_script("--stage", "m5-r1", "--role", "final", check=False)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--review-id is required", result.stderr)
        self.assertEqual(self.read_log(), [])

    def test_dry_run_does_not_create_state_or_invoke_agent(self) -> None:
        result = self.run_script("--stage", "m5-r1", "--role", "design", "--dry-run")

        self.assertIn("agent", result.stdout)
        self.assertFalse(self.state_file.exists())
        self.assertEqual(self.read_log(), [])

    def test_refuses_to_reuse_session_after_branch_change(self) -> None:
        self.run_script("--stage", "m5-r1", "--role", "design")
        subprocess.run(
            ["git", "-C", str(self.workspace), "switch", "-q", "-c", "other-branch"],
            check=True,
        )

        result = self.run_script("--stage", "m5-r1", "--role", "design", check=False)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("belongs to branch", result.stderr)
        review_calls = [call for call in self.read_log() if "--resume" in call]
        self.assertEqual(len(review_calls), 1)

    def test_detached_head_uses_commit_identity_before_creating_chat(self) -> None:
        subprocess.run(
            [
                "git",
                "-C",
                str(self.workspace),
                "-c",
                "user.name=Skill Test",
                "-c",
                "user.email=skill-test@example.invalid",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "initial",
            ],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(self.workspace), "switch", "-q", "--detach", "HEAD"],
            check=True,
        )

        result = self.run_script("--stage", "m5-r1", "--role", "design")

        self.assertIn("REVIEW_OK", result.stdout)
        state = json.loads(self.state_file.read_text(encoding="utf-8"))
        session = state["sessions"]["m5-r1:design:continuity"]
        self.assertRegex(session["branch"], r"^detached@[0-9a-f]+$")

    def test_workspace_trust_failure_tells_user_how_to_continue(self) -> None:
        os.environ["FAKE_AGENT_REVIEW_EXIT"] = "1"
        try:
            result = self.run_script("--stage", "m5-r1", "--role", "design", check=False)
        finally:
            os.environ.pop("FAKE_AGENT_REVIEW_EXIT", None)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Workspace Trust Required", result.stderr)
        self.assertIn("want Cursor to collaborate", result.stderr)
        self.assertIn("--trust", result.stderr)


if __name__ == "__main__":
    unittest.main()
