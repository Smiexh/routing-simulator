# net-test

这是一个使用 Vite + React + Tailwind CSS 构建的前端项目。

## 项目结构
- `src/`：源代码目录
- `index.html`：入口 HTML 文件
- `package.json`：项目依赖和脚本
- `vite.config.js`：Vite 配置
- `tailwind.config.js`：Tailwind CSS 配置
- `postcss.config.js`：PostCSS 配置

## 启动开发服务器
```fish
npm install
npm run dev
```

## 构建生产版本
```fish
npm run build
```

## 发布到 GitHub Pages
本项目已集成 GitHub Actions 自动打包并发布到 GitHub Pages。

### 手动发布
1. 推送代码到 main 分支。
2. GitHub Actions 会自动构建并发布到 gh-pages 分支。
3. 访问 `https://<你的用户名>.github.io/<仓库名>/` 查看页面。

---

如需自定义，请修改 `vite.config.js` 的 `base` 路径。
