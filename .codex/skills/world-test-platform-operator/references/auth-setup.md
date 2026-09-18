# 独立 Skill 与 API Token

页面顶部“下载 Skill”提供相同的通用 ZIP，无需先生成 Token。解压后把 `world-test-platform-operator` 目录安装到本地 AI 的 Skill 系统。包内没有个人凭据；更换或吊销 Token 不影响 Skill 文件。

## 单独配置 Token

在平台“API Token”中生成 Token，然后在本机终端运行：

```sh
python3 "<skill目录>/scripts/platform.py" configure
```

按终端提示粘贴 Token，输入不回显。工具先验证身份，再将凭据保存到本机 `~/.config/world-test-platform/<平台标识>.json`，目录权限 700、文件权限 600。文件位于 Skill 目录之外。

已有安全保存的纯文本 Token 文件时，可用 `configure --token-file /绝对路径/token.txt`；文件必须仅本人可读写，不会被自动删除。不要把完整 Token 作为命令参数或发到 AI 聊天中。

也支持由用户运行环境预先设置 `WORLD_TEST_API_TOKEN`，优先于本机配置。其他平台环境需同时设置 `WORLD_TEST_PLATFORM_ORIGIN`；与请求 origin 不一致时拒绝使用该凭据。`WORLD_TEST_CREDENTIAL_DIR` 可修改本机配置目录。不同平台使用独立凭据。

Skill 不会读取包内 `.private/credentials.json`，也不会自动打开浏览器、生成 Token 或安装凭据。旧版专属包应替换为此通用包，将 Token 单独配置；已有外部本机配置可继续使用。

## 使用

```sh
python3 "<skill目录>/scripts/platform.py" status
python3 "<skill目录>/scripts/platform.py" request '/api/worlds?page=1&pageSize=20&summary=1'
python3 "<skill目录>/scripts/platform.py" request '/api/batches' --method POST --json-file '/绝对路径/request.json'
python3 "<skill目录>/scripts/platform.py" download '<文件清单中的平台相对URL>' --output '/绝对路径/creator-delivery.tar.gz'
```

用户明确要求提交才调用提交接口。`request.json` 只包含任务参数和保存好的 idempotencyKey。工具不自动重试写请求；超时保留原参数与唯一键核对。

Token 吊销后接口返回401，在平台生成新 Token 并重新 configure 或更新环境变量即可；不重新下载 Skill。工具只输出身份、认证结果和非敏感下载信息。

下载跳转到 `world-test-cdn.loopit.com.cn` 时，工具自动去掉平台认证头。结果记录本地 SHA-256、字节数和路径；没有源哈希时不宣称端到端哈希校验通过。普通浏览器播放页仍使用网页登录。
