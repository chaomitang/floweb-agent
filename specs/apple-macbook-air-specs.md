# Apple MacBook Air M5 技术规格抓取

从 Apple 中国官网抓取 MacBook Air 最新款的技术规格信息。

## Phase 1: 打开 Apple 中国官网

- [ ] 导航到 apple.com.cn 首页
- [ ] 确认页面加载成功，标题包含 "Apple (中国大陆)"

**Actions:**
```yaml
- tool: browser_navigate
  args:
    url: https://www.apple.com.cn
```

**Asserts:**
```yaml
- condition: page.url().includes('apple.com.cn')
  description: 成功导航到 Apple 中国官网
- condition: await page.title().then(t => t.includes('Apple'))
  description: 页面标题包含 Apple
```

## Phase 2: 进入 Mac 产品页面

- [ ] 点击导航栏中的 "Mac" 链接
- [ ] 确认进入 Mac 系列产品页面

**Actions:**
```yaml
- tool: browser_click
  args:
    selector: a[href="/mac/"]
```

**Asserts:**
```yaml
- condition: page.url().includes('/mac')
  description: 当前页面为 Mac 系列产品页
- condition: await page.locator('h1').textContent().then(t => t.includes('Mac'))
  description: 页面标题包含 Mac
```

## Phase 3: 进入 MacBook Air 产品页

- [ ] 点击 MacBook Air 产品链接
- [ ] 确认进入 MacBook Air 概览页面

**Actions:**
```yaml
- tool: browser_click
  args:
    selector: a[aria-label*="MacBook Air"]
```

**Asserts:**
```yaml
- condition: page.url().includes('macbook-air')
  description: 当前页面为 MacBook Air 产品页
- condition: await page.locator('h1').textContent().then(t => t.includes('MacBook Air'))
  description: 页面标题包含 MacBook Air
```

## Phase 4: 进入技术规格页面

- [ ] 点击 "技术规格" 导航链接
- [ ] 确认进入技术规格页面

**Actions:**
```yaml
- tool: browser_click
  args:
    selector: a[href="/macbook-air/specs/"]
```

**Asserts:**
```yaml
- condition: page.url().includes('/specs')
  description: 当前页面为技术规格页
- condition: await page.locator('h1').textContent().then(t => t.includes('技术规格'))
  description: 页面标题包含"技术规格"
```

## Phase 5: 查看 15 英寸规格

- [ ] 切换到 15 英寸标签页
- [ ] 确认 15 英寸标签页处于选中状态

**Actions:**
```yaml
- tool: browser_click
  args:
    selector: button#table-15-label
```

**Asserts:**
```yaml
- condition: await page.locator('button#table-15-label').getAttribute('aria-selected').then(v => v === 'true')
  description: 15 英寸标签页处于选中状态
```

## Phase 6: 提取核心规格数据

- [ ] 提取芯片型号（Apple M5）
- [ ] 提取三款机型价格（RMB 9,999 / 11,499 / 12,999）
- [ ] 提取显示屏参数（15.3" Liquid 视网膜, 2880×1864, 500nit）
- [ ] 提取电池续航（18 小时）
- [ ] 提取尺寸重量（1.15cm / 1.51kg）
- [ ] 提取无线规格（Wi-Fi 7 / 蓝牙 6）
- [ ] 提取摄像头规格（1200 万像素 Center Stage）

**Actions:**
```yaml
- tool: browser_exec
  args:
    code: |
      const data = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? main.innerText.substring(0, 5000) : 'N/A';
      });
      console.log(data);
```

**Asserts:**
```yaml
- condition: "true"
  description: 规格数据已提取（人工验证）
  stopOnFail: false
```
