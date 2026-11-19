# 发布到 renli19670413/Guandan

仓库目标地址：`https://github.com/renli19670413/Guandan`。此地址是本项目准备使用的目标，尚不表示远程仓库已创建或上传。

## 方式一：GitHub 网页上传

1. 用 `renli19670413` 登录 GitHub，打开 [创建仓库](https://github.com/new)。仓库名填 `Guandan`，可自行选 Public 或 Private。
2. 本地运行 `npm run package:windows`，解压 `dist/Guandan-1.2.0-source.zip` 到新文件夹。
3. 进入新仓库的「Add file → Upload files」，上传这个解压文件夹里的内容，包括 `.github`、`.gitignore` 等文件。不要上传原工作目录中的私有配置或整个 `dist` 文件夹。
4. GitHub 网页不便上传点开头文件时，使用下面的 Git 方式。新仓库若已初始化 README，也可用 GitHub Desktop 克隆后把发布包内容复制过去、提交再推送。

## 方式二：Git 推送（推荐）

先在 GitHub 创建名为 `Guandan` 的空仓库，不勾选初始化 README。然后在本项目目录运行：

```powershell
git remote -v
git push -u origin main
```

本地仓库已设置目标 remote。HTTPS 身份验证使用 Git Credential Manager 的浏览器登录或 GitHub Personal Access Token；不要在聊天里发送密码、验证码或 Token。账号邮箱仅用于登录，不需要写进网页。

本地首次提交使用 `renli19670413@users.noreply.github.com` 作为作者邮箱，避免将登录邮箱放入公开历史。可按 GitHub 账号中的提交邮箱设置自行更改。若网页已经建立了带提交的仓库，请先克隆到另一目录后复制发布包内容，不要强制覆盖已有远程历史。

## GitHub Pages 离线试玩

仓库上传后，在「Settings → Pages → Build and deployment → Source」选 **GitHub Actions**。然后到「Actions」手动运行 **Deploy offline demo to GitHub Pages**。

如果仓库名是 `Guandan`，默认网址预计为 `https://renli19670413.github.io/Guandan/`（以工作流实际输出为准）。这个静态版本只运行本地规则 Agent，不能在 GitHub Pages 上运行 Node.js 服务，也不会向浏览器提供 API Key。

完整 CherryIN 模式供使用者下载后在本机运行。如果要发布到公网并代用户提供 API，需要另做登录鉴权、分用户额度和服务部署；当前服务按个人本机使用设计，不直接暴露公网。

## 下载包与版本发布

测试工作流会在 main 分支推送和 PR 时运行，无需配置 API Secret；测试只使用模拟模型。

准备正式版本时：

```powershell
git tag v1.2.0
git push origin v1.2.0
```

标签触发 **Publish source release**，测试后自动创建 GitHub Release 并附上源码 ZIP。手动运行该工作流则仅生成 Actions 下载附件，不创建 Release。

发布包和 Pages 都使用明确的文件允许列表生成，不会递归复制包含密钥的工作目录。当前未指定开源许可证；可根据你的授权意愿后续添加 LICENSE。
