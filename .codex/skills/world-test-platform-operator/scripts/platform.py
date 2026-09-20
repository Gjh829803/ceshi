#!/usr/bin/env python3
"""World test platform API and downloads using separately configured credentials."""
import argparse
import hashlib
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

DEFAULT_ORIGIN = "https://world-test-platform.loopit.com.cn"
TOKEN = re.compile(r"wtp2?_[a-f0-9]{32}_[a-f0-9]{32}_[A-Za-z0-9_-]{43}\Z")


class ClientError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def origin_value(value):
    url = urllib.parse.urlsplit(value)
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.path not in ("", "/") or url.query or url.fragment):
        raise ClientError("平台地址必须是 HTTPS origin，不能包含路径或凭据")
    return urllib.parse.urlunsplit((url.scheme, url.netloc, "", "", ""))


def credential_path(origin):
    root = Path(os.environ.get("WORLD_TEST_CREDENTIAL_DIR", str(Path.home() / ".config/world-test-platform")))
    return root / (hashlib.sha256(origin.encode()).hexdigest()[:20] + ".json")


def read_private(path, require_private=True, raw=False):
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 16384:
            raise ClientError("凭据文件格式无效")
        if hasattr(os, "getuid") and info.st_uid != os.getuid():
            raise ClientError("凭据文件不属于当前用户")
        # Windows reports synthetic POSIX mode bits for NTFS files; the
        # effective ACL is enforced separately there. Keep the strict mode
        # check on POSIX platforms while allowing the Windows ACL check.
        if require_private and os.name != "nt" and stat.S_IMODE(info.st_mode) & 0o077:
            raise ClientError("凭据文件需设置为仅本人可读写（chmod 600）")
        if not require_private:
            os.fchmod(stream.fileno(), 0o600)
        return stream.read() if raw else json.load(stream)


def validate_credential(value, origin):
    if not isinstance(value, dict) or value.get("origin") != origin or value.get("version") not in (1, 2):
        raise ClientError("凭据与当前平台不匹配")
    if not isinstance(value.get("token"), str) or not TOKEN.fullmatch(value["token"]):
        raise ClientError("凭据中没有有效的个人 API Token")
    expiry = value.get("expiresAt")
    if (value["version"] == 1 or expiry is not None) and (not isinstance(expiry, (int, float)) or expiry <= time.time() * 1000):
        raise ClientError("Token 已过期，请重新授权")
    return value


def load_credential(origin):
    token = os.environ.get("WORLD_TEST_API_TOKEN")
    if token is not None:
        configured_origin = origin_value(os.environ.get("WORLD_TEST_PLATFORM_ORIGIN", DEFAULT_ORIGIN))
        return validate_credential({"version": 2, "origin": configured_origin, "token": token.strip()}, origin)
    return validate_credential(read_private(credential_path(origin)), origin)


def save_credential(value, path):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or (hasattr(os, "getuid") and info.st_uid != os.getuid()):
        raise ClientError("凭据目录必须是当前用户的普通目录")
    os.chmod(path.parent, 0o700)
    temporary = path.with_name(path.name + "." + secrets.token_hex(8))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def platform_url(origin, path):
    parsed = urllib.parse.urlsplit(path)
    if not path.startswith("/") or path.startswith("//") or parsed.scheme or parsed.netloc or parsed.fragment:
        raise ClientError("请求路径必须相对于平台，不能指定外部地址")
    if "\\" in path or any(ord(c) < 32 for c in path):
        raise ClientError("无效的请求路径")
    return origin + path


def open_response(url, *, token=None, method="GET", payload=None):
    headers = {"Accept": "application/json", "Accept-Encoding": "identity"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None if payload is None else json.dumps(payload).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        return urllib.request.build_opener(NoRedirect()).open(request, timeout=30)
    except urllib.error.HTTPError as error:
        return error
    except (urllib.error.URLError, TimeoutError):
        raise ClientError("平台网络请求失败；未输出请求头或凭据") from None


def json_request(origin, token, path, method="GET", payload=None):
    with open_response(platform_url(origin, path), token=token, method=method, payload=payload) as response:
        if response.status == 401:
            raise ClientError("Token 无效或已吊销；请在平台重新生成 Token 并更新本机配置")
        if response.status == 403:
            raise ClientError("平台拒绝本次操作；请检查账号状态或访问来源，不要重复提交")
        if not 200 <= response.status < 300:
            raise ClientError(f"平台返回 HTTP {response.status}；提交响应不确定时保留原请求唯一键")
        if "application/json" not in response.headers.get("Content-Type", ""):
            raise ClientError("平台返回的不是 JSON，可能尚未登录或接口未上线")
        return json.load(response)


def probe(origin, credential):
    result = json_request(origin, credential["token"], "/api/auth/session")
    if not result.get("authenticated") or result.get("provider") != "api-token":
        raise ClientError("当前平台没有接受个人 API Token；需先上线平台接入代码")
    return {"authenticated": True, "user": result.get("user")}


def configure(args, origin):
    if args.token_file:
        token = read_private(Path(args.token_file).expanduser(), raw=True).strip()
    elif sys.stdin.isatty():
        token = getpass.getpass("API Token（输入不会显示）: ").strip()
    else:
        raise ClientError("请在本机终端交互配置，或使用 --token-file 指定仅本人可读的 Token 文件")
    value = validate_credential({"version": 2, "origin": origin, "token": token}, origin)
    status = probe(origin, value)
    path = credential_path(origin)
    save_credential(value, path)
    print(json.dumps({**status, "credentialFile": str(path)}, ensure_ascii=False))


def download(origin, token, path, output, allowed_cdn):
    url = platform_url(origin, path)
    output = Path(output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + "." + secrets.token_hex(8) + ".part")
    if output.exists() or output.is_symlink():
        raise ClientError("目标文件已存在，请使用新的文件名")
    try:
        for _ in range(6):
            parsed = urllib.parse.urlsplit(url)
            same_origin = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", "")) == origin
            # Never forward the platform token on a CDN redirect.
            with open_response(url, token=token if same_origin else None) as response:
                if response.status in (301, 302, 303, 307, 308):
                    target = urllib.parse.urljoin(url, response.headers.get("Location", ""))
                    next_url = urllib.parse.urlsplit(target)
                    next_origin = urllib.parse.urlunsplit((next_url.scheme, next_url.netloc, "", "", ""))
                    if next_url.scheme != "https" or next_url.username or next_url.password or next_url.fragment:
                        raise ClientError("拒绝不安全的下载跳转")
                    if next_origin != origin and next_url.netloc not in allowed_cdn:
                        raise ClientError("下载跳转到未允许的域名；请核对平台实际 CDN 配置")
                    url = target
                    continue
                if response.status != 200:
                    raise ClientError(f"下载返回 HTTP {response.status}；若签名过期，请重新读取平台文件入口")
                if "text/html" in response.headers.get("Content-Type", ""):
                    raise ClientError("下载返回了 HTML 页面，请检查登录和文件入口")
                encoding = response.headers.get("Content-Encoding", "identity").lower()
                if encoding not in ("identity", "gzip"):
                    raise ClientError("下载使用了当前工具不支持的压缩编码")
                decoder = zlib.decompressobj(31) if encoding == "gzip" else None
                digest = hashlib.sha256(); size = 0; wire_size = 0
                fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "wb") as stream:
                    while True:
                        data = response.read(1024 * 1024)
                        if not data:
                            break
                        wire_size += len(data)
                        if decoder:
                            data = decoder.decompress(data)
                        stream.write(data); digest.update(data); size += len(data)
                    if decoder:
                        data = decoder.flush()
                        stream.write(data); digest.update(data); size += len(data)
                        if not decoder.eof or decoder.unused_data:
                            raise ClientError("压缩下载不完整或包含额外数据")
                length = response.headers.get("Content-Length")
                if length is not None and int(length) != wire_size:
                    raise ClientError("下载不完整，请保留同一任务重新下载")
                # Hard-link creation refuses a destination created during download.
                os.link(temporary, output)
                return {"file": str(output.resolve()), "bytes": size, "localSha256": digest.hexdigest()}
        raise ClientError("下载跳转次数过多")
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin")
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("configure", help="保存单独生成的 API Token，不生成 Token 或修改 Skill")
    setup.add_argument("--token-file", help="仅本人可读的纯文本 Token 文件路径")
    sub.add_parser("status")
    api = sub.add_parser("request")
    api.add_argument("path"); api.add_argument("--method", default="GET", choices=["GET", "POST", "PUT", "PATCH", "DELETE"])
    api.add_argument("--json-file")
    files = sub.add_parser("download")
    files.add_argument("path"); files.add_argument("--output", required=True)
    files.add_argument("--allow-cdn", action="append", default=["world-test-cdn.loopit.com.cn"])
    args = parser.parse_args(argv)
    try:
        origin = origin_value(args.origin or os.environ.get("WORLD_TEST_PLATFORM_ORIGIN", DEFAULT_ORIGIN))
        if args.command == "configure":
            configure(args, origin); return 0
        credential = load_credential(origin)
        if args.command == "status":
            result = probe(origin, credential)
        elif args.command == "request":
            payload = json.loads(Path(args.json_file).read_text()) if args.json_file else None
            result = json_request(origin, credential["token"], args.path, args.method, payload)
        else:
            result = download(origin, credential["token"], args.path, args.output, set(args.allow_cdn))
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except FileNotFoundError:
        print("未找到本机凭据或输入文件；请单独配置 API Token（configure 或 WORLD_TEST_API_TOKEN）。", file=sys.stderr)
    except (ClientError, OSError, ValueError, zlib.error) as error:
        # Only our own messages are safe to print; library exceptions can contain paths/URLs.
        print(str(error) if isinstance(error, ClientError) else "本机文件或响应解析失败；未输出凭据。", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
