# 发布到 renli19670413/Qinghe-Guandan-AI

仓库地址：`https://github.com/renli19670413/Qinghe-Guandan-AI`。此仓库与 Qoder 的 `renli19670413/guandan` 相互独立。

## 方式一：GitHub 网页上传

1. 用 `renli19670413` 登录 GitHub，打开 [创建仓库](https://github.com/new)。仓库名填 `Qinghe-Guandan-AI`，可自行选 Public 或 Private。
2. 本地运行 `npm run package:windows`，解压 `dist/Qinghe-Guandan-AI-1.4.1-source.zip` 到新文件夹。
3. 进入新仓库的「Add file → Upload files」，上传这个解压文件夹里的内容，包括 `.github`、`.gitignore` 等文件。不要上传原工作目录中的私有配置或整个 `dist` 文件夹。
4. GitHub 网页不便上传点开头文件时，使用下面的 Git 方式。新仓库若已初始化 README，也可用 GitHub Desktop 克隆后把发布包内容复制过去、提交再推送。

## 方式二：Git 推送（推荐）

先在 GitHub 创建名为 `Qinghe-Guandan-AI` 的空仓库，不勾选初始化 README。然后在本项目目录运行：

```powershell
git remote -v
git push -u origin main
```

本地仓库已设置目标 remote。HTTPS 身份验证使用 Git Credential Manager 的浏览器登录或 GitHub Personal Access Token；不要在聊天里发送密码、验证码或 Token。账号邮箱仅用于登录，不需要写进网页。

本地首次提交使用 `renli19670413@users.noreply.github.com` 作为作者邮箱，避免将登录邮箱放入公开历史。可按 GitHub 账号中的提交邮箱设置自行更改。若网页已经建立了带提交的仓库，请先克隆到另一目录后复制发布包内容，不要强制覆盖已有远程历史。

## GitHub Pages 手机在线版

仓库上传后，在「Settings → Pages → Build and deployment → Source」选 **GitHub Actions**。推送 main 会自动运行 **Deploy CherryIN game to GitHub Pages**，也可在 Actions 中手动启动。

如果仓库名是 `Qinghe-Guandan-AI`，网址为 `https://renli19670413.github.io/Qinghe-Guandan-AI/`（部署是否成功以 Actions 的结果为准）。电脑、手机均可打开，无需运行 StartWeb.cmd。支持离线规则与 CherryIN 多厂家大模型、难度选择。

菜单顶部填写自己的 CherryIN API Key 并点“使用密钥”，再选择大模型模式、厂家、模型与难度并应用设置。密钥只在当前页面内存保存，通过 HTTPS 直接交给 CherryIN；刷新后重新填写。GitHub 不托管任何用户密钥，不需要配置 Actions API Secret，也不要把真实配置上传到仓库。

构建命令 `npm run build:pages` 只发布允许列表中的静态文件。`scripts/pages-client.js` 会与规则验证代码打包成 `cherryin-pages.js`，将本机接口调用改为浏览器直连 CherryIN 的 Messages 兼容协议。OpenAI、Anthropic、Google、DeepSeek 内置示例已验证此协议；其他模型支持情况由平台决定。网络或跨域错误时暂停，不自动回退成本地规则。

每页 200 次请求是防误操作计数，不是持久账单限制。请在 CherryIN 控制台限制令牌额度。存档只在当前浏览器内保存；源站、浏览器或设备变化不会自动迁移存档。本机版仍可下载运行，继续从私有配置读取密钥。

## 下载包与版本发布

测试工作流会在 main 分支推送和 PR 时运行，无需配置 API Secret；测试只使用模拟模型。

准备正式版本时：

```powershell
git tag v1.4.1
git push origin v1.4.1
```

标签触发 **Publish source release**，测试后自动创建 GitHub Release 并附上源码 ZIP。手动运行该工作流则仅生成 Actions 下载附件，不创建 Release。

发布包和 Pages 都使用明确的文件允许列表生成，不会递归复制包含密钥的工作目录。当前未指定开源许可证；可根据你的授权意愿后续添加 LICENSE。
