# 淘宝登录并搜索手机

## 概述
打开淘宝网 → 人工登录 → 搜索"手机" → 查看搜索结果

## Phase 1: 打开淘宝首页
打开淘宝首页，确认页面加载成功。

**Actions:**
```yaml
- tool: browser_navigate
  args:
    url: https://www.taobao.com
```

**Asserts:**
```yaml
- condition: page.url().includes('taobao.com')
  description: 已导航到淘宝首页
- condition: page.locator('#q').isVisible()
  description: 搜索框可见
```

- [x] 淘宝首页加载成功
- [x] 搜索框可见

---

## Phase 2: 人工登录
点击登录链接，进入登录页面。由于淘宝有反爬机制（滑块验证），需要人工完成登录。

**Actions:**
```yaml
- tool: browser_click
  args:
    selector: a[href*="login.taobao.com"]
- tool: browser_ask_human
  args:
    message: 请在浏览器中手动登录淘宝（输入账号密码或扫码）。登录完成后告诉我。
```

**Asserts:**
```yaml
- condition: page.url().includes('taobao.com') && !page.url().includes('login')
  description: 登录成功，回到淘宝首页
- condition: page.locator('#J_SiteNavLogin').textContent().includes('炒米糖1994')
  description: 显示已登录用户名
```

- [x] 点击登录链接进入登录页
- [x] 人工完成登录（扫码或密码+滑块验证）
- [x] 登录成功回到首页，显示用户名

---

## Phase 3: 搜索手机
在搜索框中输入"手机"并提交搜索。

**Actions:**
```yaml
- tool: browser_type
  args:
    selector: input#q
    text: 手机
- tool: browser_click
  args:
    selector: button[type="submit"]
```

**Asserts:**
```yaml
- condition: page.url().includes('q=%E6%89%8B%E6%9C%BA')
  description: URL 包含手机搜索参数
- condition: page.locator('[id^="item_id_"]').first().isVisible()
  description: 搜索结果列表可见
```

- [x] 搜索框输入"手机"
- [x] 点击搜索按钮
- [x] 搜索结果页加载，显示手机商品列表
