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
import queue
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from typing import Iterator


DEFAULT_MODEL = "cursor-grok-4.6-xhigh"
DEFAULT_OUTPUT_CHECK_SECONDS = 15.0
DEFAULT_SESSION_INSPECT_SECONDS = 60.0
STATE_SCHEMA_VERSION = 1
WORKTREE_DRIFT_EXIT_CODE = 3
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


def run_git_bytes(workspace: Path, *arguments: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(workspace), *arguments],
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        detail = result.stderr.decode(errors="replace").strip() or "unknown git error"
        raise ReviewError(f"cannot fingerprint review tree: {detail}")
    return result.stdout


def fingerprint_review_tree(workspace: Path) -> str:
    """Hash HEAD plus tracked and untracked review inputs without mutating Git."""
    digest = hashlib.sha256()
    head = subprocess.run(
        ["git", "-C", str(workspace), "rev-parse", "--verify", "HEAD"],
        check=False,
        capture_output=True,
    )
    if head.returncode == 0:
        digest.update(head.stdout)
    else:
        digest.update(b"unborn\0")
        digest.update(run_git_bytes(workspace, "symbolic-ref", "HEAD"))
    digest.update(run_git_bytes(workspace, "diff", "--binary", "--no-ext-diff"))
    digest.update(run_git_bytes(workspace, "diff", "--cached", "--binary", "--no-ext-diff"))
    untracked = run_git_bytes(
        workspace,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
    )
    for raw_path in sorted(path for path in untracked.split(b"\0") if path):
        digest.update(b"untracked\0" + raw_path + b"\0")
        file_path = workspace / os.fsdecode(raw_path)
        if file_path.is_symlink():
            digest.update(b"symlink\0" + os.fsencode(os.readlink(file_path)))
            continue
        if not file_path.is_file():
            digest.update(b"non-file\0")
            continue
        with file_path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


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


def write_report(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(content)
            if content and not content.endswith("\n"):
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


def inspect_authentication(agent_binary: str) -> str:
    try:
        result = subprocess.run(
            [agent_binary, "status", "--format", "json"],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except subprocess.TimeoutExpired:
        return "Cursor authentication inspection timed out"
    detail = result.stdout.strip() or result.stderr.strip() or "no status output"
    return f"exit={result.returncode} {detail}"


def inspect_live_chat_progress(
    *,
    agent_binary: str,
    model: str,
    workspace: Path,
    chat_id: str,
) -> str:
    prompt = (
        "This is a read-only liveness inspection while the preceding review is still running. "
        "Report actual current progress in exactly three concise bullets: work completed, what is "
        "currently executing or waiting, and work remaining. Do not restart the review, modify "
        "files, or invent progress."
    )
    try:
        result = subprocess.run(
            build_review_command(
                agent_binary=agent_binary,
                model=model,
                workspace=workspace,
                chat_id=chat_id,
                prompt=prompt,
            ),
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return "live chat progress query timed out"
    detail = result.stdout.strip() or result.stderr.strip() or "no progress output"
    return f"exit={result.returncode}\n{detail}"


def run_review_with_idle_inspection(
    *,
    command: list[str],
    agent_binary: str,
    model: str,
    workspace: Path,
    chat_id: str,
    output_check_seconds: float,
    session_inspect_seconds: float,
) -> tuple[int, str]:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    output_queue: queue.Queue[str | None] = queue.Queue()

    def read_output() -> None:
        try:
            for line in process.stdout:
                output_queue.put(line)
        finally:
            output_queue.put(None)

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    output: list[str] = []
    last_output_at = time.monotonic()
    next_output_check_at = last_output_at + output_check_seconds
    next_session_inspect_at = last_output_at + session_inspect_seconds

    while True:
        now = time.monotonic()
        deadlines = [
            deadline
            for interval, deadline in (
                (output_check_seconds, next_output_check_at),
                (session_inspect_seconds, next_session_inspect_at),
            )
            if interval > 0
        ]
        queue_timeout = 0.25
        if deadlines:
            queue_timeout = min(queue_timeout, max(0.001, min(deadlines) - now))
        try:
            item = output_queue.get(timeout=queue_timeout)
        except queue.Empty:
            now = time.monotonic()
            if process.poll() is not None:
                continue
            if output_check_seconds > 0 and now >= next_output_check_at:
                idle_seconds = now - last_output_at
                print(
                    f"[cursor-review] process pid={process.pid} is still running; "
                    f"no output for {idle_seconds:.0f}s; chatId={chat_id}",
                    file=sys.stderr,
                    flush=True,
                )
                next_output_check_at = now + output_check_seconds
            if session_inspect_seconds > 0 and now >= next_session_inspect_at:
                process_status = subprocess.run(
                    ["ps", "-o", "pid=,stat=,etime=,command=", "-p", str(process.pid)],
                    check=False,
                    capture_output=True,
                    text=True,
                ).stdout.strip()
                print(
                    f"[cursor-review] requesting live progress from chatId={chat_id}; "
                    f"process={process_status or 'not found'}",
                    file=sys.stderr,
                    flush=True,
                )
                progress = inspect_live_chat_progress(
                    agent_binary=agent_binary,
                    model=model,
                    workspace=workspace,
                    chat_id=chat_id,
                )
                authentication = (
                    inspect_authentication(agent_binary)
                    if not progress.startswith("exit=0")
                    else "not needed"
                )
                diagnostic = (
                    f"[cursor-review] live chat progress: {progress}\n"
                    f"[cursor-review] authentication fallback: {authentication}\n"
                )
                print(diagnostic, end="", file=sys.stderr, flush=True)
                next_session_inspect_at = now + session_inspect_seconds
            continue
        if item is None:
            break
        print(item, end="", flush=True)
        output.append(item)
        last_output_at = time.monotonic()
        next_output_check_at = last_output_at + output_check_seconds
        next_session_inspect_at = last_output_at + session_inspect_seconds

    reader.join()
    return process.wait(), "".join(output)


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
    run_parser.add_argument("--output-file")
    run_parser.add_argument(
        "--output-check-seconds",
        type=float,
        default=DEFAULT_OUTPUT_CHECK_SECONDS,
        help="report process liveness after this many silent seconds; 0 disables",
    )
    run_parser.add_argument(
        "--session-inspect-seconds",
        type=float,
        default=DEFAULT_SESSION_INSPECT_SECONDS,
        help="periodically inspect the process and Cursor CLI authentication after this many silent seconds; 0 disables",
    )
    run_parser.add_argument("--dry-run", action="store_true")
    inspect_parser = subparsers.add_parser(
        "inspect", help="inspect a stored review session without resuming or mutating it"
    )
    inspect_parser.add_argument("--workspace", default=os.getcwd())
    inspect_parser.add_argument("--state-file")
    inspect_parser.add_argument("--stage", required=True)
    inspect_parser.add_argument("--role", required=True, choices=("design", "code", "final"))
    inspect_parser.add_argument("--review-id")
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if arguments.role != "design" and arguments.review_id is None:
        raise ReviewError("--review-id is required for code and final reviews")

    workspace = Path(arguments.workspace).expanduser().resolve()
    if not workspace.is_dir():
        raise ReviewError(f"workspace does not exist: {workspace}")
    run_git(workspace, "rev-parse", "--show-toplevel")

    state_file = resolve_state_file(workspace, arguments.state_file)
    key = session_key(arguments.stage, arguments.role, arguments.review_id)
    agent_binary = resolve_agent_binary()

    if arguments.command == "inspect":
        state = load_state(state_file)
        sessions = state["sessions"]
        assert isinstance(sessions, dict)
        session = sessions.get(key)
        if not isinstance(session, dict):
            raise ReviewError(f"no stored Cursor review session for {key!r}")
        result = {
            "authentication": inspect_authentication(agent_binary),
            "currentBranch": resolve_branch_identity(workspace),
            "currentTreeFingerprint": fingerprint_review_tree(workspace),
            "session": session,
        }
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0

    if arguments.output_check_seconds < 0 or arguments.session_inspect_seconds < 0:
        raise ReviewError("output/session inspection intervals must be zero or positive")

    prompt_path = Path(arguments.prompt_file).expanduser().resolve()
    try:
        prompt = prompt_path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise ReviewError(f"cannot read review prompt {prompt_path}: {error}") from error
    if not prompt:
        raise ReviewError(f"review prompt is empty: {prompt_path}")

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
    before_fingerprint = fingerprint_review_tree(workspace)
    with exclusive_lock(review_lock):
        return_code, review_output = run_review_with_idle_inspection(
            command=command,
            agent_binary=agent_binary,
            model=arguments.model,
            workspace=workspace,
            chat_id=chat_id,
            output_check_seconds=arguments.output_check_seconds,
            session_inspect_seconds=arguments.session_inspect_seconds,
        )
    after_fingerprint = fingerprint_review_tree(workspace)
    tree_drifted = before_fingerprint != after_fingerprint
    if arguments.output_file is not None:
        report_path = Path(arguments.output_file).expanduser().resolve()
        metadata = (
            "# Cursor review session\n\n"
            f"- workspace: `{workspace}`\n"
            f"- branch: `{resolve_branch_identity(workspace)}`\n"
            f"- chatId: `{chat_id}`\n"
            f"- treeFingerprintBefore: `{before_fingerprint}`\n"
            f"- treeFingerprintAfter: `{after_fingerprint}`\n"
            f"- cursorExitCode: `{return_code}`\n"
            f"- treeDrifted: `{str(tree_drifted).lower()}`\n\n"
            "## Cursor output\n\n"
        )
        write_report(report_path, metadata + review_output)
    if tree_drifted:
        print(
            "error: review tree changed while Cursor was running; discard the verdict and rerun "
            f"(before={before_fingerprint}, after={after_fingerprint})",
            file=sys.stderr,
        )
        return WORKTREE_DRIFT_EXIT_CODE
    if return_code != 0:
        print(
            "If the failure above is Workspace Trust Required, " + WORKSPACE_TRUST_GUIDANCE,
            file=sys.stderr,
        )
    return return_code


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReviewError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from None
