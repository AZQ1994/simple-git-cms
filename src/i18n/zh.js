// 简体中文。键名见 src/i18n/index.js；{xxx} 是会被替换的占位符。
export default {
  'lang.name': '简体中文',

  // 登录
  'login.subtitle': '{collection}的编辑与发布',
  'login.github': '使用 GitHub 登录',
  'login.tokenSummary': '使用访问令牌登录',
  'login.tokenSubmit': '登录',
  'login.tokenHint': '在 GitHub → Settings → Developer settings → Fine-grained tokens 生成，仓库权限选 Contents: Read and write。',
  'login.failed': '登录失败：{error}',
  'login.expired': '登录已失效，请重新登录',
  'login.noAccess': '账号 {login} 没有这个网站仓库的编辑权限：需要被加为仓库协作者（Write），且登录用的 GitHub App 已安装到这个仓库。请联系管理员。',

  // 侧栏
  'list.new': '新建文章',
  'list.search': '搜索文章',
  'list.openAria': '文章列表',
  'list.empty': '没有符合条件的文章',
  'list.untitled': '（无标题）',
  'filter.all': '全部',
  'filter.live': '已发布',
  'filter.draft': '草稿',
  'user.logout': '退出',
  'user.language': '界面语言',

  // 顶栏
  'bar.viewLive': '在网站查看',
  'bar.delete': '删除',
  'bar.unpublish': '撤回为草稿',
  'bar.preview': '预览',
  'bar.saveDraft': '保存草稿',
  'bar.publish': '发布',
  'bar.update': '更新',

  // 状态
  'status.new': '新文章',
  'status.live': '已发布',
  'status.draft': '草稿',
  'status.unsaved': '未保存',

  // 空状态
  'empty.hint': '从左侧选择一篇文章，或者新建一篇。',

  // 文章字段
  'doc.titlePlaceholder': '标题',
  'doc.date': '日期',
  'doc.tags': '标签',
  'doc.addTag': '添加标签',
  'doc.removeTag': '删除标签 {tag}',
  'doc.seo': '搜索摘要',
  'doc.descPlaceholder': '显示在搜索结果里的简介（60～110 字）。不填会自动取正文开头。',
  'doc.descAuto': '自动生成',
  'doc.descCount': '{n} 字',

  // 工具条
  'toolbar.h2': '小标题',
  'toolbar.bold': '加粗（⌘B）',
  'toolbar.italic': '斜体（⌘I）',
  'toolbar.bulletList': '列表',
  'toolbar.orderedList': '编号列表',
  'toolbar.blockquote': '引用',
  'toolbar.link': '链接',
  'toolbar.image': '插入图片（可多选，多张会并排）',
  'toolbar.imageLabel': '图片',
  'toolbar.undo': '撤销（⌘Z）',
  'toolbar.redo': '重做（⇧⌘Z）',
  'toolbar.linkPrompt': '链接地址（留空表示取消链接）',
  'doc.footHint': '图片可以直接粘贴或拖进来；点一下图片可以裁剪、加说明、并排。',

  // 图片
  'img.crop': '裁剪/旋转',
  'img.caption': '说明',
  'img.side': '并排',
  'img.replace': '替换',
  'img.captionPlaceholder': '图片说明（显示在图片下方）',
  'img.captionSubmit': '确定',
  'img.layoutAlone': '单独一行',
  'img.layoutSide': '与上一张并排',
  'img.processing': '正在处理 {n} 张图片…',
  'img.processingOne': '正在处理图片…',
  'img.notImage': '只能上传图片',
  'img.tooLarge': '图片超过 {mb}MB',
  'img.compressFailed': '图片压缩失败',

  // 裁剪窗口
  'crop.free': '自由',
  'crop.rotateLeft': '向左旋转',
  'crop.rotateRight': '向右旋转',
  'crop.reset': '还原',
  'crop.cancel': '取消',
  'crop.apply': '完成',

  // 校验
  'validate.title': '请填写标题',
  'validate.body': '请填写正文',
  'validate.tags': '请至少添加一个标签',
  'validate.externalImage': '正文里有外部图片地址（可能是从别处粘贴的），请下载后用「图片」按钮重新上传',

  // 保存
  'save.saving': '正在保存…',
  'save.updating': '正在更新…',
  'save.publishing': '正在发布…',
  'save.unpublishing': '正在撤回…',
  'save.deleting': '正在删除…',
  'save.loading': '正在载入…',
  'save.draftSaved': '草稿已保存',
  'done.create': '已新建，约 1 分钟后网站更新',
  'done.update': '已更新，约 1 分钟后网站更新',
  'done.publish': '已发布，约 1 分钟后网站更新',
  'done.unpublish': '已撤回，约 1 分钟后网站更新',
  'save.deleted': '已删除',
  'save.busyRepo': '保存失败：仓库正在频繁更新，请稍后再试',
  'save.discardConfirm': '有未保存的修改，确定要放弃吗？',
  'save.publishConfirm': '发布后所有人都能在网站上看到这篇文章。确定发布？',
  'save.unpublishConfirm': '撤回后网站上将看不到这篇文章，内容会保留为草稿。确定撤回？',
  'save.deleteConfirm': '永久删除草稿「{title}」？',

  // 动作名（也用在提交信息里）
  'verb.create': '新建',
  'verb.update': '更新',
  'verb.publish': '发布',
  'verb.unpublish': '撤回',

  // 提交信息
  'commit.article': '{verb}文章：{title}',
  'commit.delete': '删除草稿：{title}',

  // 冲突
  'conflict.title': '这篇文章已被其他人修改',
  'conflict.theirsText': '在你打开之后，有人保存了新的版本（标题：{title}）。',
  'conflict.deletedText': '在你打开之后，这篇文章已被删除。',
  'conflict.cancel': '取消',
  'conflict.theirs': '载入对方的版本',
  'conflict.mine': '用我的版本覆盖',

  // 预览
  'preview.title': '预览',
  'preview.hint': '和发布后的样子一致，内容未保存也能看',
  'preview.desktop': '电脑',
  'preview.phone': '手机',
  'preview.close': '关闭',
  'preview.loadFailed': '预览组件加载失败，请检查网络后重试',

  // 部署
  'deploy.pending': '正在更新网站…',
  'deploy.success': '网站已更新',
  'deploy.failure': '网站更新失败，请联系管理员',

  // 配置 / GitHub
  'config.missing': '找不到 config.json',
  'config.incomplete': 'config.json 缺少 repo / collection.dir / media.dir / auth.base',
  'config.defaultTitle': '内容管理',
  'config.defaultCollection': '文章',
  'github.error': 'GitHub：{message}',
  'github.requestFailed': 'GitHub 请求失败（{status}）',
};
