# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Filox module
LUCI_DEPENDS:=+luci-base

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=permails <logo@permails.com>
PKG_VERSION:=1.26.7
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
