#!/usr/bin/env python3
"""Run a read-only Cursor review with worktree-private session continuity."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from typing import Iterator


DEFAULT_MODEL = "cursor-grok-4.6-xhigh"
STATE_SCHEMA_VERSION = 1
CHAT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
WORKSPACE_TRUST_GUIDANCE = (
    "If you want Cursor to collaborate, add trust for this workspace first "
    "(for example, use `--trust` only after explicit user approval)."
)


class ReviewError(RuntimeError):
    pass


def add_workspace_trust_guidance(detail: str) -> str:
    if "workspace trust" not in detail.lower():
        return detail
    return f"{detail}\n{WORKSPACE_TRUST_GUIDANCE}"


def run_git(workspace: Path, *arguments: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(workspace), *arguments],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git error"
        raise ReviewError(f"workspace is not an accessible Git worktree: {detail}")
    return result.stdout.strip()


def resolve_state_file(workspace: Path, override: str | None) -> Path:
    if override is not None:
        return Path(override).expanduser().resolve()
    git_path = run_git(workspace, "rev-parse", "--git-path", "cursor-review-sessions.json")
    path = Path(git_path)
    if not path.is_absolute():
        path = workspace / path
    return path.resolve()


def resolve_branch_identity(workspace: Path) -> str:
    symbolic = subprocess.run(
        ["git", "-C", str(workspace), "symbolic-ref", "--quiet", "--short", "HEAD"],
        check=False,
        capture_output=True,
        text=True,
    )
    if symbolic.returncode == 0 and symbolic.stdout.strip():
        return symbolic.stdout.strip()
    commit = run_git(workspace, "rev-parse", "--short=12", "HEAD")
    return f"detached@{commit}"


def resolve_agent_binary() -> str:
    configured = os.environ.get("CURSOR_AGENT_BIN")
    if configured:
        path = Path(configured).expanduser()
        if not path.is_file() or not os.access(path, os.X_OK):
            raise ReviewError(f"CURSOR_AGENT_BIN is not executable: {path}")
        return str(path.resolve())
    discovered = shutil.which("agent")
    if discovered is None:
        raise ReviewError("Cursor Agent CLI was not found; install or expose the `agent` command first")
    return discovered


@contextmanager
def exclusive_lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as stream:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def load_state(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"schemaVersion": STATE_SCHEMA_VERSION, "sessions": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReviewError(f"cannot read Cursor review session state at {path}: {error}") from error
    if data.get("schemaVersion") != STATE_SCHEMA_VERSION or not isinstance(data.get("sessions"), dict):
        raise ReviewError(f"unsupported Cursor review session state at {path}")
    return data


def save_state(path: Path, state: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(state, stream, indent=2, sort_keys=True)
            stream.write("\n")
        os.chmod(temporary_path, 0o600)
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def parse_chat_id(output: str) -> str:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        raise ReviewError("`agent create-chat` returned no chat ID")
    candidate = lines[-1].split()[-1]
    if CHAT_ID_PATTERN.fullmatch(candidate) is None:
        raise ReviewError(f"could not parse chat ID from `agent create-chat` output: {lines[-1]!r}")
    return candidate


def create_chat(agent_binary: str, workspace: Path) -> str:
    result = subprocess.run(
        [agent_binary, "--workspace", str(workspace), "create-chat"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown Cursor error"
        raise ReviewError(f"`agent create-chat` failed: {add_workspace_trust_guidance(detail)}")
    return parse_chat_id(result.stdout)


def session_key(stage: str, role: str, review_id: str | None) -> str:
    identity = review_id if review_id is not None else "continuity"
    return f"{stage}:{role}:{identity}"


def ensure_session(
    *,
    agent_binary: str,
    workspace: Path,
    state_file: Path,
    key: str,
    stage: str,
    role: str,
    review_id: str | None,
) -> str:
    state_lock = state_file.with_name(f"{state_file.name}.lock")
    with exclusive_lock(state_lock):
        current_branch = resolve_branch_identity(workspace)
        state = load_state(state_file)
        sessions = state["sessions"]
        assert isinstance(sessions, dict)
        existing = sessions.get(key)
        if isinstance(existing, dict):
            if existing.get("workspace") != str(workspace):
                raise ReviewError(f"stored session {key!r} belongs to a different workspace")
            if existing.get("branch") != current_branch:
                raise ReviewError(
                    f"stored session {key!r} belongs to branch {existing.get('branch')!r}, "
                    f"not current branch {current_branch!r}"
                )
            chat_id = existing.get("chatId")
            if isinstance(chat_id, str) and CHAT_ID_PATTERN.fullmatch(chat_id) is not None:
                return chat_id
            raise ReviewError(f"stored session {key!r} has an invalid chat ID")

        chat_id = create_chat(agent_binary, workspace)
        sessions[key] = {
            "branch": current_branch,
            "chatId": chat_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "reviewId": review_id,
            "role": role,
            "stage": stage,
            "workspace": str(workspace),
        }
        save_state(state_file, state)
        return chat_id


def build_review_command(
    *,
    agent_binary: str,
    model: str,
    workspace: Path,
    chat_id: str,
    prompt: str,
) -> list[str]:
    return [
        agent_binary,
        "-p",
        "--mode",
        "ask",
        "--model",
        model,
        "--workspace",
        str(workspace),
        "--resume",
        chat_id,
        prompt,
    ]


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a Cursor design/code/final review with explicit session isolation."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run", help="create or resume a review session and run it")
    run_parser.add_argument("--workspace", default=os.getcwd())
    run_parser.add_argument("--state-file")
    run_parser.add_argument("--stage", required=True)
    run_parser.add_argument("--role", required=True, choices=("design", "code", "final"))
    run_parser.add_argument("--review-id")
    run_parser.add_argument("--prompt-file", required=True)
    run_parser.add_argument("--model", default=DEFAULT_MODEL)
    run_parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.role != "design" and arguments.review_id is None:
        raise ReviewError("--review-id is required for code and final reviews")

    workspace = Path(arguments.workspace).expanduser().resolve()
    if not workspace.is_dir():
        raise ReviewError(f"workspace does not exist: {workspace}")
    run_git(workspace, "rev-parse", "--show-toplevel")

    prompt_path = Path(arguments.prompt_file).expanduser().resolve()
    try:
        prompt = prompt_path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise ReviewError(f"cannot read review prompt {prompt_path}: {error}") from error
    if not prompt:
        raise ReviewError(f"review prompt is empty: {prompt_path}")

    state_file = resolve_state_file(workspace, arguments.state_file)
    key = session_key(arguments.stage, arguments.role, arguments.review_id)
    agent_binary = resolve_agent_binary()

    if arguments.dry_run:
        print(shlex.join([agent_binary, "--workspace", str(workspace), "create-chat"]))
        print(
            shlex.join(
                build_review_command(
                    agent_binary=agent_binary,
                    model=arguments.model,
                    workspace=workspace,
                    chat_id="<chat-id>",
                    prompt=str(prompt_path),
                )[:-1]
                + [f"<contents of {prompt_path}>"],
            )
        )
        return 0

    chat_id = ensure_session(
        agent_binary=agent_binary,
        workspace=workspace,
        state_file=state_file,
        key=key,
        stage=arguments.stage,
        role=arguments.role,
        review_id=arguments.review_id,
    )
    lock_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
    review_lock = state_file.with_name(f"{state_file.name}.locks") / f"{lock_hash}.lock"
    command = build_review_command(
        agent_binary=agent_binary,
        model=arguments.model,
        workspace=workspace,
        chat_id=chat_id,
        prompt=prompt,
    )
    with exclusive_lock(review_lock):
        result = subprocess.run(command, check=False)
    if result.returncode != 0:
        print(
            "If the failure above is Workspace Trust Required, " + WORKSPACE_TRUST_GUIDANCE,
            file=sys.stderr,
        )
    return result.returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReviewError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from None
