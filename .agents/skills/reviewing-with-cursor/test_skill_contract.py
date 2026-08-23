#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).parent


class SkillContractTest(unittest.TestCase):
    def test_entrypoint_is_discoverable_and_project_neutral(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")

        self.assertTrue(content.startswith("---\nname: reviewing-with-cursor\n"))
        self.assertIn("description: Use when", content)
        self.assertIn("non-Cursor", content)
        self.assertIn("Cursor Agent CLI", content)
        self.assertNotIn("M5", content)
        self.assertLessEqual(len(content.split()), 500)

    def test_entrypoint_preserves_independent_review_authority(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")

        for required_term in (
            "design",
            "code",
            "final",
            "--mode ask",
            "--resume",
            "--continue",
            "reproduce",
            "references/review-prompts.md",
        ):
            self.assertIn(required_term, content)

    def test_entrypoint_requires_environment_preflight(self) -> None:
        content = (ROOT / "SKILL.md").read_text(encoding="utf-8")

        for required_term in (
            "Applicability preflight",
            "already installed",
            "host agent is Cursor",
            "CURSOR_AGENT_BIN",
            "command -v agent",
            "Start the Cursor Agent",
            "agent status",
            "do not run the helper",
            "Workspace Trust Required",
            "--trust",
        ):
            self.assertIn(required_term, content)

    def test_prompt_contract_requests_evidence_and_disposition(self) -> None:
        content = (ROOT / "references" / "review-prompts.md").read_text(encoding="utf-8")

        for required_term in (
            "Base commit",
            "Head commit",
            "Authoritative documents",
            "Closed findings",
            "Out of scope",
            "P0",
            "reproduction",
            "NO-GO",
            "disposition",
        ):
            self.assertIn(required_term, content)

    def test_openai_metadata_invokes_the_skill_by_name(self) -> None:
        content = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

        self.assertIn('display_name: "Reviewing with Cursor"', content)
        self.assertIn("$reviewing-with-cursor", content)


if __name__ == "__main__":
    unittest.main()
