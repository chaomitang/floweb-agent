# Auth Profiles

用于保存和复用浏览器认证状态（cookies + localStorage）。

## 使用场景

- 目标网站需要手动登录
- 不想每次运行脚本都重新登录
- 多因素认证（2FA）不便自动化

## 工作流

1. 有头模式打开网站：`/open https://app.example.com`
2. 让用户手动登录
3. 保存当前会话：`/save example.com`
4. 后续脚本使用该 Profile 自动登录

Profile 文件存储在 `.floweb/sessions/<name>/profiles/<domain>.json`，包含：
- domain
- cookies（完整 cookie jar）
- localStorage（所有 key-value）
- 保存时间戳

## 注意事项

- Profile 仅限本机使用
- 登录态会过期，Profile 失效后需重新登录保存
- 不要将包含敏感 token 的 Profile 提交到 Git
