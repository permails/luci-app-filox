# LuCI App Filox / Filox 文件管家

<div align="center">
  <p>A modern, powerful, and native File Manager and Editor for OpenWrt LuCI.</p>
  <p>一款专为 OpenWrt LuCI 打造的现代化、功能强大的原生文件管家与编辑器。</p>
</div>

---

## 📖 Introduction / 简介

### English
**LuCI App Filox** (formerly known as File Manager) is an advanced file exploration tool designed specifically for the OpenWrt LuCI web interface. It allows you to seamlessly navigate, manage, and edit files directly from your router's web panel without needing SSH or external SFTP clients.

### 中文
**LuCI App Filox**（前身为 File Manager）是一款专为 OpenWrt LuCI Web 界面设计的高级文件管理工具。它允许你直接在路由器的网页后台中无缝浏览、管理和编辑文件，彻底告别繁杂的 SSH 命令和第三方 SFTP 客户端。

---

## ✨ Features / 核心功能

* 📁 **File Tree (文件树):** Intuitive directory navigation with full path display. (直观的目录导航，完整的文件路径显示)
* 📝 **Built-in Editor (内置编辑器):** Edit text files on the fly directly in your browser. (支持在浏览器中直接编辑文本文件)
* 🔢 **Hex Viewer/Editor (十六进制编辑):** Includes advanced tools for viewing and editing binary files. (包含用于查看和编辑二进制文件的高级功能)
* 🚀 **Full File Operations (全功能文件操作):** 
  * Download (下载)
  * Rename (重命名)
  * Copy (复制)
  * Delete (删除)
* 🌐 **Localization (多语言支持):** Fully supports English and Simplified Chinese (zh-cn). (完美支持英文与简体中文)
* 🎨 **Modern Grid UI (现代化界面):** A clean and responsive layout that perfectly integrates with OpenWrt themes. (干净响应式的网格布局，与 OpenWrt 主题完美融合)

---

## 🛠️ Installation / 安装说明

### From Source (Compile into OpenWrt) / 源码编译

1. Add the package to your OpenWrt build environment's `package` directory:
   将本插件放置到 OpenWrt 编译环境的 `package` 目录下：
   ```bash
   cd package
   git clone https://github.com/permails/luci-app-filox.git
   ```

2. Update and install feeds (if necessary):
   更新并安装 feeds（如果需要）：
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install -a
   ```

3. Run `make menuconfig` and select `luci-app-filox` under `LuCI -> Applications`:
   运行 `make menuconfig`，然后在 `LuCI -> Applications` 中勾选 `luci-app-filox`：
   ```bash
   make menuconfig
   ```

4. Compile the package:
   编译插件：
   ```bash
   make package/luci-app-filox/compile V=s
   ```

---

## 🙋‍♂️ Maintainer / 维护者

**Author:** [permails](https://github.com/permails)  
**Email:** logo@permails.com

---

## 📄 License / 开源协议

This project is licensed under the **Apache License 2.0**.
本项目基于 **Apache-2.0** 协议开源。
