# LuCI App Filox / Filox 文件管家

<div align="center">
  <p>A modern, powerful, and native File Manager and Editor for OpenWrt LuCI.</p>
  <p>一款专为 OpenWrt LuCI 打造的现代化、功能强大的原生文件管家与编辑器。</p>
</div>

---

## English

### Introduction
**LuCI App Filox** (formerly known as File Manager) is an advanced file exploration tool designed specifically for the OpenWrt LuCI web interface. It allows you to seamlessly navigate, manage, and edit files directly from your router's web panel without needing SSH or external SFTP clients.

### Features
* **File Tree:** Intuitive directory navigation with full path display.
* **Built-in Editor:** Edit text files on the fly directly in your browser.
* **Hex Viewer/Editor:** Includes advanced tools for viewing and editing binary files.
* **Full File Operations:** Download, Rename, Copy, and Delete.
* **Localization:** Fully supports English and Simplified Chinese (zh-cn).
* **Modern Grid UI:** A clean and responsive layout that perfectly integrates with OpenWrt themes.

### Installation (From Source)
1. Add the package to your OpenWrt build environment's `package` directory:
   ```bash
   cd package
   git clone https://github.com/permails/luci-app-filox.git
   ```
2. Update and install feeds (if necessary):
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install -a
   ```
3. Run `make menuconfig` and select `luci-app-filox` under `LuCI -> Applications`:
   ```bash
   make menuconfig
   ```
4. Compile the package:
   ```bash
   make package/luci-app-filox/compile V=s
   ```

### Maintainer
**Author:** [permails](https://github.com/permails)  
**Email:** logo@permails.com

### License
This project is licensed under the **Apache License 2.0**.

---

## 简体中文

### 简介
**LuCI App Filox**（前身为 File Manager）是一款专为 OpenWrt LuCI Web 界面设计的高级文件管理工具。它允许你直接在路由器的网页后台中无缝浏览、管理和编辑文件，彻底告别繁杂的 SSH 命令和第三方 SFTP 客户端。

### 核心功能
* **文件树:** 直观的目录导航，完整的文件路径显示。
* **内置编辑器:** 支持在浏览器中直接编辑文本文件。
* **十六进制编辑:** 包含用于查看和编辑二进制文件的高级功能。
* **全功能文件操作:** 支持下载、重命名、复制和删除。
* **多语言支持:** 完美支持英文与简体中文。
* **现代化界面:** 干净响应式的网格布局，与 OpenWrt 主题完美融合。

### 安装说明 (源码编译)
1. 将本插件放置到 OpenWrt 编译环境的 `package` 目录下：
   ```bash
   cd package
   git clone https://github.com/permails/luci-app-filox.git
   ```
2. 更新并安装 feeds（如果需要）：
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install -a
   ```
3. 运行 `make menuconfig`，然后在 `LuCI -> Applications` 中勾选 `luci-app-filox`：
   ```bash
   make menuconfig
   ```
4. 编译插件：
   ```bash
   make package/luci-app-filox/compile V=s
   ```

### 维护者
**作者:** [permails](https://github.com/permails)  
**邮箱:** logo@permails.com

### 开源协议
本项目基于 **Apache-2.0** 协议开源。
